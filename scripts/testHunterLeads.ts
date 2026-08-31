// One-off manual test runner for a specific set of Hunter leads, by ID.
// Not part of the scheduled cron (scripts/hunterAutoFillJob.ts) — this is
// for testing the Facebook-image-find + AI-review pipeline against a
// hand-picked set of leads on demand (e.g. verifying the Haiku 4.5 switch
// on real leads) without touching the other ~40 leads still queued with
// status 'awaiting_images'.
//
// Usage: npx tsx scripts/testHunterLeads.ts <leadId1> <leadId2> ...
// Only leads currently in status 'awaiting_images' are processed (same
// safety rule as the cron job — never touches a lead a human is already
// working, or one already done/failed).
import puppeteer, { type Browser } from "puppeteer";
import { sql } from "../lib/db";
import { findLeadImageUrls } from "../lib/facebookAdLibrary";
import { updateHunterLeadImages, markHunterLeadRunning, markHunterLeadDone, markHunterLeadFailed } from "../lib/hunterLeads";
import { checkAdImageUrls, CheckAdError } from "../lib/automationCheckAd";

const PUPPETEER_LAUNCH_ARGS = [
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

async function findImagesForLeads(leads: PendingLead[]): Promise<FoundLead[]> {
  const browser: Browser = await puppeteer.launch({ headless: true, args: PUPPETEER_LAUNCH_ARGS });
  const found: FoundLead[] = [];
  try {
    for (const lead of leads) {
      const imageUrls = await findLeadImageUrls(browser, lead);
      if (imageUrls.length === 0) {
        console.log(`[test-hunter] ${lead.id} ("${lead.clinic_name}"): no images found, left awaiting_images`);
        continue;
      }
      await updateHunterLeadImages(lead.id, imageUrls);
      console.log(`[test-hunter] ${lead.id} ("${lead.clinic_name}"): found ${imageUrls.length} image(s)`);
      imageUrls.forEach((u, i) => console.log(`    [${i}] ${u}`));
      found.push({ lead, imageUrls });
    }
  } finally {
    await browser.close();
  }
  return found;
}

async function reviewFoundLeads(foundLeads: FoundLead[]): Promise<number> {
  let reviewedCount = 0;
  for (const { lead, imageUrls } of foundLeads) {
    await markHunterLeadRunning(lead.id);
    try {
      const result = await checkAdImageUrls(imageUrls, { caption: lead.clinic_name, model: "claude-haiku-4-5" });
      await markHunterLeadDone(lead.id, result.resultUrl);
      reviewedCount++;
      console.log(`[test-hunter] ${lead.id} ("${lead.clinic_name}"): review done -> ${result.resultUrl}`);
      result.images.forEach((img, i) =>
        console.log(`    image ${i}: status=${img.status} flags=${img.flags.length} failed=${img.failed}`)
      );
    } catch (e) {
      const message = e instanceof CheckAdError ? e.message : "internal_error";
      console.error(`[test-hunter] ${lead.id} ("${lead.clinic_name}"): automation run failed:`, e);
      await markHunterLeadFailed(lead.id, message);
    }
  }
  return reviewedCount;
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: npx tsx scripts/testHunterLeads.ts <leadId1> <leadId2> ...");
    process.exit(1);
  }

  const leads = (await sql`
    SELECT id, clinic_name, province, source_link
    FROM hunter_leads
    WHERE id = ANY(${ids}) AND status = 'awaiting_images'
  `) as PendingLead[];

  console.log(`[test-hunter] ${leads.length}/${ids.length} requested lead(s) are in 'awaiting_images' and will be processed`);
  if (leads.length < ids.length) {
    const foundIds = new Set(leads.map((l) => l.id));
    for (const id of ids) {
      if (!foundIds.has(id)) console.log(`[test-hunter]   skipping ${id} — not found or not in 'awaiting_images'`);
    }
  }
  if (leads.length === 0) {
    console.log("[test-hunter] nothing to do");
    return;
  }

  const foundLeads = await findImagesForLeads(leads);
  const reviewedCount = await reviewFoundLeads(foundLeads);
  const skippedCount = leads.length - foundLeads.length;

  console.log(
    `[test-hunter] run complete — ${foundLeads.length}/${leads.length} lead(s) got images (${reviewedCount} reviewed successfully), ${skippedCount} left awaiting_images`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[test-hunter] fatal error:", err);
    process.exit(1);
  });
