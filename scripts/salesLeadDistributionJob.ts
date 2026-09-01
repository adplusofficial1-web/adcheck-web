// Sales Lead Distribution — daily cron job. Meant to run as a Render Cron
// Job (see "cron:sales-distribution" in package.json), same pattern as
// scripts/hunterAutoFillJob.ts and scripts/runAutoBilling.ts — a plain
// script talking straight to the DB via the server-side lib modules the
// app uses (relative imports, not the "@/..." alias, since this file runs
// outside Next's module resolution via tsx).
//
// What this does: tops up every active sales rep's OPEN lead queue
// (sales_status in new/contacted/interested) to
// lib/salesLeads.ts:DAILY_QUOTA (10), pulling from completed Hunter leads
// that found a real compliance problem (review_status IN
// ('caution','violation')) and haven't been assigned to anyone yet — see
// lib/salesLeads.ts:distributeDailyLeads() for the actual algorithm and
// claude/Sales Lead Distribution - Design.md (project docs) for the full
// feature writeup and the fairness note on why reps are processed in
// signup order when the pool runs short.
//
// Scheduled ~30 minutes AFTER adcheck-hunter-auto-fill (see that cron's own
// schedule on Render) so leads that Hunter's own auto-fill run just
// finished today are already 'done' with a review_status by the time this
// runs and land in the pool the same day, not the next one. No Puppeteer
// here at all — this is a handful of small SQL queries — so unlike the
// Hunter auto-fill cron this has no meaningful memory footprint and is not
// expected to hit the OOM issue tracked against that job.
//
// Idempotent / safe to re-run: sales_lead_assignments.hunter_lead_id is
// UNIQUE (migrations/011_sales_leads.sql), so re-running this after a
// partial failure never double-assigns a lead that already went out; it
// just tops up whatever's still short of quota.
import { distributeDailyLeads, DAILY_QUOTA } from "../lib/salesLeads";

async function main() {
  const results = await distributeDailyLeads();

  if (results.length === 0) {
    console.log("[sales-distribution] no active sales reps — nothing to do");
    return;
  }

  let totalAssigned = 0;
  let shortfalls = 0;
  for (const r of results) {
    totalAssigned += r.assignedCount;
    if (r.needed > 0 && r.assignedCount < r.needed) {
      shortfalls++;
      console.warn(
        `[sales-distribution] ${r.salesUserName} (${r.salesUserId}): pool ไม่พอ ให้ได้แค่ ${r.assignedCount}/${r.needed} — ต้องการ Lead ที่มีปัญหาเพิ่มจาก Hunter`
      );
    } else if (r.needed > 0) {
      console.log(`[sales-distribution] ${r.salesUserName} (${r.salesUserId}): เติมครบ ${r.assignedCount}/${r.needed}`);
    } else {
      console.log(`[sales-distribution] ${r.salesUserName} (${r.salesUserId}): คิวเต็มอยู่แล้ว (${DAILY_QUOTA}/${DAILY_QUOTA}) ข้าม`);
    }
  }

  console.log(
    `[sales-distribution] run complete — ${results.length} เซลล์ที่ active, มอบหมายเพิ่มรวม ${totalAssigned} Lead${
      shortfalls > 0 ? `, ${shortfalls} คน pool ไม่พอ` : ""
    }`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sales-distribution] fatal error:", err);
    process.exit(1);
  });
