// Hunter Lead Distribution — daily cron job. Meant to run as a Render Cron
// Job (see "cron:hunter-lead-distribution" in package.json), same pattern as
// scripts/salesLeadDistributionJob.ts and scripts/hunterAutoFillJob.ts — a
// plain script talking straight to the DB via the server-side lib modules
// the app uses (relative imports, not the "@/..." alias, since this file
// runs outside Next's module resolution via tsx).
//
// What this does: tops up every active Hunter freelancer's OPEN lead queue
// to lib/hunterLeads.ts:HUNTER_DAILY_QUOTA (10), pulling ONLY from
// hunter_leads with review_status='violation' that haven't been assigned to
// anyone yet — see lib/hunterLeads.ts:distributeDailyHunterLeads for the
// actual algorithm and the three requirements confirmed with the site owner
// (2569-09-05) via AskUserQuestion:
//   1. Pool: review_status='violation' ONLY — never falls back to
//      caution/passed even if this pool runs dry.
//   2. Recipients: every hunter_users row with active=true — INCLUDING ones
//      not yet assignment_approved (unlike the admin's manual "ส่ง" flow,
//      which requires approval — this is a deliberate difference the site
//      owner chose for the automatic daily drop).
//   3. Notification: a system message into that Hunter's existing
//      hunter_messages chat thread (sender='admin', sender_email=null —
//      renders as "ทีมงาน", same as any other admin message), so the
//      existing unread-badge on their "แชทกับทีมงาน" tab lights up — no new
//      notification channel built for this.
//
// Scheduled shortly after adcheck-sales-distribution (same daily "reset the
// quota near the start of the day" moment) — see this cron's own schedule
// on Render.
//
// Idempotent / safe to re-run: every assignment UPDATE inside
// distributeDailyHunterLeads is a compare-and-set
// (`WHERE assigned_hunter_user_id IS NULL`), so re-running this after a
// partial failure (or a second manual trigger the same day) never
// double-assigns a lead that already went out — it just tops up whatever's
// still short of quota for each Hunter, using whatever's left in the
// violation pool.
import { distributeDailyHunterLeads, HUNTER_DAILY_QUOTA } from "../lib/hunterLeads";

async function main() {
  const results = await distributeDailyHunterLeads();

  if (results.length === 0) {
    console.log("[hunter-lead-distribution] no active Hunters — nothing to do");
    return;
  }

  let totalAssigned = 0;
  let shortfalls = 0;
  for (const r of results) {
    totalAssigned += r.assignedCount;
    if (r.needed > 0 && r.assignedCount < r.needed) {
      shortfalls++;
      console.warn(
        `[hunter-lead-distribution] ${r.hunterUserName} (${r.hunterUserId}): pool ไม่พอ ให้ได้แค่ ${r.assignedCount}/${r.needed} — ต้องการ lead กลุ่ม violation เพิ่ม`
      );
    } else if (r.needed > 0) {
      console.log(
        `[hunter-lead-distribution] ${r.hunterUserName} (${r.hunterUserId}): เติมครบ ${r.assignedCount}/${r.needed}`
      );
    } else {
      console.log(
        `[hunter-lead-distribution] ${r.hunterUserName} (${r.hunterUserId}): คิวเต็มอยู่แล้ว (${HUNTER_DAILY_QUOTA}/${HUNTER_DAILY_QUOTA}) ข้าม`
      );
    }
  }

  console.log(
    `[hunter-lead-distribution] run complete — ${results.length} Hunter ที่ active, มอบหมายเพิ่มรวม ${totalAssigned} lead${
      shortfalls > 0 ? `, ${shortfalls} คน pool ไม่พอ` : ""
    }`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[hunter-lead-distribution] fatal error:", err);
    process.exit(1);
  });
