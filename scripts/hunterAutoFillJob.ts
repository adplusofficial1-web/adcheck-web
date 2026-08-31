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
// never-throws contract.
import puppeteer from "puppeteer";
import { sql } from "../lib/db";
import { findLeadImageUrls } from "../lib/facebookAdLibrary";
import {
  updateHunterLeadImages,
  markHunterLeadRunning,
  markHunterLeadDone,
  markHunterLeadFailed,
} from "../lib/hunterLeads";
import { checkAdImageUrls, CheckAdError } from "../lib/automationCheckAd";

// Sanity ceiling per run, same spirit as MAX_IMPORT_ROWS in
// app/api/admin/hunter/route.ts — this job is meant to keep a queue that's
// imported in batches of "a few hundred" (per lib/hunterLeads.ts) trickling
// forward a bit every day, not to blast through the entire backlog (and
// Facebook's rate-limit/ToS tolerance) in one run. Raise deliberately, not
// by accident — see lib/facebookAdLibrary.ts's module comment on why
// volume matters here specifically.
const MAX_LEADS_PER_RUN = 25;

type PendingLead = { id: string; clinic_name: string; province: string | null; source_link: string | null };

async function main() {
  const leads = (await sql`
    SELECT id, clinic_name, province, source_link
    FROM hunter_leads
    WHERE status = 'awaiting_images'
    ORDER BY created_at ASC
    LIMIT ${MAX_LEADS_PER_RUN}
  `) as PendingLead[];

  console.log(`[hunter-auto-fill] ${leads.length} lead(s) awaiting images (cap ${MAX_LEADS_PER_RUN}/run)`);
  if (leads.length === 0) {
    console.log("[hunter-auto-fill] nothing to do — run complete");
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    // Render's build/runtime image runs as a non-root user without a
    // sandbox-capable kernel namespace set up for Chromium's default
    // sandbox — same reason the official Render Puppeteer guide
    // (render.com/docs/deploy-puppeteer-node) and most other constrained-
    // container deployments disable it. This does not weaken anything this
    // script relies on for safety: it only ever navigates to
    // facebook.com/ads/library URLs this file itself builds, never
    // arbitrary/user-supplied URLs or scripts.
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let foundCount = 0;
  let reviewedCount = 0;
  let skippedCount = 0;

  try {
    for (const lead of leads) {
      const imageUrls = await findLeadImageUrls(browser, lead);
      if (imageUrls.length === 0) {
        console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): no images found, left awaiting_images`);
        skippedCount++;
        continue;
      }
      foundCount++;

      // Reuses the exact same update path the manual admin UI's PATCH hits
      // (lib/hunterLeads.ts:updateHunterLeadImages), so a lead this job
      // fills in is indistinguishable in the DB from one a human filled in
      // by hand — same status transition, same stale-result-clearing logic.
      await updateHunterLeadImages(lead.id, imageUrls);
      console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): found ${imageUrls.length} image(s)`);

      // Auto-runs the AI compliance check immediately (explicit product
      // decision, 2026-08-31) — mirrors
      // app/api/admin/hunter/[id]/run/route.ts exactly (same
      // markHunterLeadRunning -> checkAdImageUrls -> markHunterLeadDone/
      // Failed sequence), just called in-process here instead of over HTTP
      // since this script already imports the same lib functions the route
      // uses.
      await markHunterLeadRunning(lead.id);
      try {
        const result = await checkAdImageUrls(imageUrls, { caption: lead.clinic_name });
        await markHunterLeadDone(lead.id, result.resultUrl);
        reviewedCount++;
        console.log(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): review done -> ${result.resultUrl}`);
      } catch (e) {
        const message = e instanceof CheckAdError ? e.message : "internal_error";
        console.error(`[hunter-auto-fill] ${lead.id} ("${lead.clinic_name}"): automation run failed:`, e);
        await markHunterLeadFailed(lead.id, message);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `[hunter-auto-fill] run complete — ${foundCount}/${leads.length} lead(s) got images (${reviewedCount} reviewed successfully), ${skippedCount} left awaiting_images`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[hunter-auto-fill] fatal error:", err);
    process.exit(1);
  });
