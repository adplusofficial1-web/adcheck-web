// Hunter auto-fill + auto-run cron job. Meant to run as a Render Cron Job
// (see "cron:hunter" in package.json), same pattern as
// scripts/runAutoBilling.ts — a plain script talking straight to the DB via
// the same server-side lib modules the app uses (relative imports, not the
// "@/..." alias, since this file runs outside Next's module resolution via
// tsx).
//
// What this replaces: before this script existed, "Hunter" (a person) had
// to open Facebook themselves, find each lead's ad, and paste up to 3
// direct image URLs into the admin UI (components/admin/HunterImport.tsx)
// before anyone could click "ตรวจสอบอัตโนมัติ". This automates exactly that
// one manual step — finding the images — using lib/facebookAdLibrary.ts,
// then (per explicit product decision, 2026-08-31) immediately runs the
// same AI compliance check the manual "run automation" button triggers, so
// a lead can go from 'awaiting_images' to 'done' with zero clicks.
//
// IMPORTANT — this spends real credits from the shared "AdCheck Automation
// (Internal)" business (lib/db.ts:getOrCreateAutomationBusiness) for every
// lead it successfully finds images for, exactly the same accounting as the
// manual button and the external n8n endpoint. Make sure that business has
// an active credits package before enabling this on a schedule — otherwise
// every run just fails with "insufficient credits" (see lib/credits.ts) and
// every lead gets marked 'failed' for that reason instead of ever actually
// running.
//
// Only ever touches leads with status = 'awaiting_images' — a lead a human
// Hunter has already started working (status 'ready', or already
// 'done'/'failed' from a prior run) is left alone, so this never overwrites
// what a person is actively doing. Re-run safe: a lead this run can't find
// any images for just stays 'awaiting_images' for the next scheduled run
// (or a human) to pick up — see lib/facebookAdLibrary.ts's own
// never-throws contract. A lead this run finds images for but then crashes
// before reviewing (see the two-phase structure below) is left in 'ready'
// — updateHunterLeadImages already moves it there — which is exactly the
// pre-existing "a human pasted the images, ready to review" state, so
// nothing is lost even on a mid-run crash.
//
// NOTE (Sales Lead Distribution, 2026-09-01): every lead this job moves to
// 'done' now also gets review_status/flag_count persisted (see
// reviewFoundLeads below) — the daily scripts/salesLeadDistributionJob.ts
// cron reads those columns to build its pool of "leads with a real
// compliance problem" to hand out to sales reps. No behavior change to the
// Hunter pipeline itself, just additional bookkeeping on the same write.
import puppeteer, { type Browser } from "puppeteer";
import { sql } from "../lib/db";
import { findLeadImageUrls } from "../lib/facebookAdLibrary";
import {
  updateHunterLeadImages,
  markHunterLeadRunning,
  markHunterLeadDone,
  markHunterLeadFailed,
  markHunterLeadAutoFillAttempt,
  recoverStaleRunningLeads,
  getHunterLead,
} from "../lib/hunterLeads";
import { checkAdImageUrls, CheckAdError } from "../lib/automationCheckAd";

// Fair-rotation knobs (2569-09-02, Bug Audit 4 — see
// migrations/019_hunter_leads_run_watchdog.sql). A lead the Ad Library has
// no images for used to be re-scraped on EVERY run forever (the selection
// was simply "oldest awaiting_images first, LIMIT 5"), starving every lead
// behind it. Now each lead gets at most MAX_AUTO_FILL_ATTEMPTS tries, at
// least AUTO_FILL_RETRY_HOURS apart, and least-recently-tried leads go
// first. A lead that exhausts its attempts just stays 'awaiting_images'
// for a human Hunter to fill in by hand — nothing is marked failed.
const MAX_AUTO_FILL_ATTEMPTS = 3;
const AUTO_FILL_RETRY_HOURS = 24;

// Sanity ceiling per run, same spirit as MAX_IMPORT_ROWS in
// app/api/admin/hunter/route.ts — this job is meant to keep a queue that's
// imported in batches of "a few hundred" (per lib/hunterLeads.ts) trickling
// forward a bit every day, not to blast through the entire backlog (and
// Facebook's rate-limit/ToS tolerance) in one run. Raise deliberately, not
// by accident — see lib/facebookAdLibrary.ts's module comment on why
// volume matters here specifically.
//
// FIX (2026-08-31): lowered from 25 to 5 after the Render Cron Job's
// Starter plan (512MB RAM) hit "Out of memory" running headless Chrome
// across a long batch in one process. A smaller batch means less chance of
// hitting the ceiling on a given run — any lead left over just waits for
// the next scheduled run (see the re-run-safe note above), so this only
// slows the backlog down, it doesn't lose anything.
const MAX_LEADS_PER_RUN = 10;

// FIX (2026-08-31): trimmed Chrome's own memory footprint to fit the 512MB
// Render Starter plan, alongside the MAX_LEADS_PER_RUN cut above. Beyond
// --no-sandbox/--disable-setuid-sandbox (needed for Render's container —
// see below), these disable background/telemetry/renderer subsystems this
// script never uses (no extensions, no GPU, no sync, no translate, no
// audio) and merge Chrome's renderer into the main process
// (--single-process/--no-zygote) rather than spawning separate ones — the
// standard trade for running Chrome in a small, single-purpose container
// where a bit less isolation is an acceptable cost for staying under the
// memory ceiling.
const PUPPETEER_LAUNCH_ARGS = [
  // Render's build/runtime image runs as a non-root user without a
  // sandbox-capable kernel namespace set up for Chromium's default
  // sandbox — same reason the official Render Puppeteer guide
  // (render.com/docs/deploy-puppeteer-node) and most other constrained-
  // container deployments disable it. This does not weaken anything this
  // script relies on for safety: it only ever navigates to
  // facebook.com/ads/library URLs this file itself builds, never
  // arbitrary/user-supplied URLs or scripts.
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
  "--safebrowsing-disable-auto-update",
  "--single-process",
  "--no-zygote",
];

type PendingLead = { id: string; clinic_name: string; province: string | null; source_link: string | null };
type FoundLead = { lead: PendingLead; imageUrls: string[] };

// Phase 1: drive headless Chrome to find images for every lead in this
// batch. Kept as its own function so the browser (and everything Chrome is
// holding in memory) is fully closed — see the `finally` below — before
// phase 2 ever starts spending memory on image downloads + the Anthropic
// API call. Returns only the leads that got images; a lead with none found
// is logged here and simply left 'awaiting_images' for next time.
async function findImagesForLeads(leads: PendingLead[]): Promise<FoundLead[]> {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: PUPPETEER_LAUNCH_ARGS,
  });

  const found: FoundLead[] = [];
  try {
    for (const lead of leads) {
      const imageUrls = await findLeadImageUrls(browser, lead);
      // Bookkeeping for the fair-rotation selection in main() — recorded
      // whether or not anything was found, BEFORE any early `continue`.
      await markHunterLeadAutoFillAttempt(lead.id);
      if (imageUrls.length === 0) {
        console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): no images found, left awaiting_images`);
        continue;
      }

      // Re-read before writing (2569-09-02, Bug Audit 4): a headless-Chrome
      // scrape takes long enough that a human may have pasted URLs into
      // this very lead (or run/deleted it) in the meantime. Only a lead
      // that is STILL 'awaiting_images' with no image_urls gets the scraped
      // links — otherwise this cron used to overwrite the human's URLs
      // (and, via updateHunterLeadImages' done/failed reset, wipe a
      // finished result).
      const fresh = await getHunterLead(lead.id);
      if (!fresh || fresh.status !== "awaiting_images" || fresh.image_urls.length > 0) {
        console.log(
          `[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): changed since selection (status=${fresh?.status ?? "deleted"}), leaving as-is`
        );
        continue;
      }

      // Reuses the exact same update path the manual admin UI's PATCH hits
      // (lib/hunterLeads.ts:updateHunterLeadImages), so a lead this job
      // fills in is indistinguishable in the DB from one a human filled in
      // by hand — same status transition (-> 'ready'), same stale-result-
      // clearing logic. This also means a crash between here and phase 2
      // below leaves the lead safely in 'ready', not stuck or duplicated.
      await updateHunterLeadImages(lead.id, imageUrls);
      console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): found ${imageUrls.length} image(s)`);
      found.push({ lead, imageUrls });
    }
  } finally {
    // FIX (2026-08-31): closing Chrome here — before any AI review call —
    // is the fix for a second "out of memory" crash (exit 137) that hit
    // when the review step for the batch's last lead ran while headless
    // Chrome was still resident. Splitting into two phases means the two
    // memory-heavy operations (a full browser vs. base64 image encode +
    // API request) never overlap.
    await browser.close();
  }
  return found;
}

// Phase 2: run the same AI compliance check the manual "run automation"
// button triggers (app/api/admin/hunter/[id]/run/route.ts), once per lead
// that phase 1 found images for. Runs after Chrome has fully exited.
async function reviewFoundLeads(foundLeads: FoundLead[]): Promise<number> {
  let reviewedCount = 0;
  for (const { lead, imageUrls } of foundLeads) {
    // Compare-and-set (2569-09-02, Bug Audit 4): false = someone (the
    // admin's manual button) already has this lead running — skip rather
    // than run a second, concurrent review on it.
    const started = await markHunterLeadRunning(lead.id);
    if (!started) {
      console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): already running elsewhere, skipped`);
      continue;
    }
    try {
      // Haiku 4.5 (2026-08-31): after a side-by-side comparison against
      // Sonnet 5 on real Hunter lead images (scripts/compareModels.ts)
      // showed acceptable quality at noticeably lower latency/cost, this
      // internal Hunter review path was switched to Haiku 4.5. The
      // customer-facing check-ad endpoint (lib/automationCheckAd.ts's
      // checkAdImageUrl, singular) is untouched and still uses Sonnet 5.
      const result = await checkAdImageUrls(imageUrls, { caption: lead.clinic_name, model: "claude-haiku-4-5" });
      // All links dead / not images (2569-09-02, Bug Audit 4) — a failed
      // run, not a 'done' one; same handling as the manual run route.
      if (result.allFailed) {
        const message = "โหลดรูปไม่ได้ทุกลิงก์ (ลิงก์หมดอายุ/ไม่ใช่รูป): " + result.failedUrls.join(", ");
        await markHunterLeadFailed(lead.id, message);
        console.error(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): every image failed to load`);
        continue;
      }
      // Sales Lead Distribution (2026-09-01): see the module comment above
      // — persists the overall outcome so this lead can enter the sales
      // pool if it found a problem.
      await markHunterLeadDone(lead.id, result.resultUrl, result.overallStatus, result.flagCount);
      reviewedCount++;
      console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): review done -> ${result.resultUrl}`);
    } catch (e) {
      const message = e instanceof CheckAdError ? e.message : "internal_error";
      console.error(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): automation run failed:`, e);
      await markHunterLeadFailed(lead.id, message);
    }
  }
  return reviewedCount;
}

async function main() {
  // Stuck-'running' watchdog (2569-09-02, Bug Audit 4): a previous cron
  // process OOM-killed mid-review (see the memory notes above) left its
  // lead 'running' forever. Same recovery the admin queue's GET runs.
  const recovered = await recoverStaleRunningLeads();
  if (recovered > 0) {
    console.log(`[hunter-auto-fill] recovered ${recovered} lead(s) stuck at 'running' -> failed`);
  }

  // Fair rotation — see MAX_AUTO_FILL_ATTEMPTS / AUTO_FILL_RETRY_HOURS above.
  const leads = (await sql`
    SELECT id, clinic_name, province, source_link
    FROM hunter_leads
    WHERE status = 'awaiting_images'
      AND auto_fill_attempts < ${MAX_AUTO_FILL_ATTEMPTS}
      AND (
        auto_fill_last_attempt_at IS NULL
        OR auto_fill_last_attempt_at < now() - (${AUTO_FILL_RETRY_HOURS} * interval '1 hour')
      )
    ORDER BY auto_fill_last_attempt_at ASC NULLS FIRST, created_at ASC
    LIMIT ${MAX_LEADS_PER_RUN}
  `) as PendingLead[];

  console.log(`[hunter-auto-fill] ${leads.length} lead(s) awaiting images (cap ${MAX_LEADS_PER_RUN}/run)`);
  if (leads.length === 0) {
    console.log("[hunter-auto-fill] nothing to do — run complete");
    return;
  }

  const foundLeads = await findImagesForLeads(leads);
  const reviewedCount = await reviewFoundLeads(foundLeads);
  const skippedCount = leads.length - foundLeads.length;

  console.log(
    `[hunter-auto-fill] run complete — ${foundLeads.length}/${leads.length} lead(s) got images (${reviewedCount} reviewed successfully), ${skippedCount} left awaiting_images`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[hunter-auto-fill] fatal error:", err);
    process.exit(1);
  });
