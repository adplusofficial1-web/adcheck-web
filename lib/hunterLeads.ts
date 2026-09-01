import { sql } from "@/lib/db";

// Admin > Marketing > Hunter's server-side queue — see
// migrations/009_hunter_queue.sql for the full table design writeup and
// why this is a separate table from `submissions`/`submission_images`
// rather than reusing them, and migrations/010_hunter_leads_single_result_url.sql
// for why result_url is a single column, not an array. See
// migrations/011_sales_leads.sql for review_status/flag_count, added so the
// Sales Lead Distribution pool (lib/salesLeads.ts) can filter to only
// leads whose AI review actually found a problem.

export type HunterLeadStatus = "awaiting_images" | "ready" | "running" | "done" | "failed";
export type HunterLeadReviewStatus = "passed" | "caution" | "violation";

export type HunterLead = {
  id: string;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  image_urls: string[];
  note: string | null;
  status: HunterLeadStatus;
  result_url: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  review_status: HunterLeadReviewStatus | null;
  flag_count: number | null;
};

const ALLOWED_STATUS: HunterLeadStatus[] = ["awaiting_images", "ready", "running", "done", "failed"];

export function isHunterLeadStatus(v: unknown): v is HunterLeadStatus {
  return typeof v === "string" && (ALLOWED_STATUS as string[]).includes(v);
}

// Every lead, newest first — matches the "คิวที่ส่งแล้ว" table's original
// [...queue].reverse() ordering from the localStorage-only version.
export async function listHunterLeads(): Promise<HunterLead[]> {
  const rows = await sql`SELECT * FROM hunter_leads ORDER BY created_at DESC`;
  return rows as HunterLead[];
}

// Bulk-insert straight from the Excel-import preview (HunterImport.tsx) —
// one row per parsed clinic, status always starts 'awaiting_images' since
// none of them have image_urls yet at this point. Returns how many rows
// were actually created.
export async function importHunterLeads(
  rows: { clinic: string; province: string; link: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  // Plain sequential inserts rather than a single multi-row INSERT — the
  // Excel import batch is at most a few hundred rows (typical Hunter
  // lead-list size), so this isn't a hot path worth the extra query-
  // building complexity of a bulk VALUES statement.
  for (const r of rows) {
    await sql`
      INSERT INTO hunter_leads (clinic_name, province, source_link, status)
      VALUES (${r.clinic}, ${r.province || null}, ${r.link || null}, 'awaiting_images')
    `;
    inserted++;
  }
  return inserted;
}

// Hunter filling in image URLs (and/or a note) for a lead they're
// actively working — up to 3 (enforced by the DB CHECK constraint, see
// migration).
//
// Status handling:
//   - 'awaiting_images' -> 'ready' the moment the first image URL lands,
//     so the admin "run automation" list only ever shows leads that
//     actually have something to review.
//   - 'running' is left alone — editing urls mid-run shouldn't be
//     possible from the UI anyway (the run button disables while
//     running), but if it somehow happens, don't fight the in-flight run.
//   - 'done'/'failed' -> 'ready', clearing result_url/last_error,
//     whenever the edited image_urls array no longer matches what's
//     already in image_urls. This matters because a lead's images are
//     now reviewed together as ONE batch (checkAdImageUrls) producing
//     ONE result_url — if Hunter swaps out any image for a different
//     URL, the old combined result would silently describe the wrong
//     set of images without this reset.
export async function updateHunterLeadImages(
  id: string,
  imageUrls: string[],
  note?: string
): Promise<HunterLead | null> {
  const [existing] = (await sql`
    SELECT status, image_urls FROM hunter_leads WHERE id = ${id}
  `) as { status: HunterLeadStatus; image_urls: string[] }[];
  if (!existing) return null;

  const urlsChanged = JSON.stringify(existing.image_urls) !== JSON.stringify(imageUrls);

  // CHANGE (2026-08-31, found via manual test after switching the UI to
  // auto-save-on-type): the previous version only handled
  // awaiting_images->ready and done/failed->ready/awaiting_images —
  // clearing a 'ready' lead's URLs back down to 0 (e.g. Hunter deletes what
  // they typed) left status stuck at 'ready' forever, with an empty
  // image_urls, so "ตรวจสอบอัตโนมัติ" stayed shown as available even
  // though there was nothing left to review (the run route's own
  // image_urls.length===0 check would 400 if clicked, but the row
  // shouldn't even look ready). Rewritten to derive nextStatus from
  // existing.status + the resulting url count uniformly, covering every
  // direction of the transition symmetrically instead of one-off cases:
  //   - awaiting_images/ready <-> each other, purely by url count (never
  //     touches running/done/failed — those only ever change via the
  //     automation run itself, see markHunterLeadRunning/Done/Failed below)
  //   - done/failed -> ready/awaiting_images (clearing result_url) only
  //     when the urls actually changed, so re-saving the same urls after a
  //     completed run doesn't wipe its result for no reason
  let nextStatus: HunterLeadStatus = existing.status;
  let clearResult = false;
  if (existing.status === "awaiting_images" || existing.status === "ready") {
    nextStatus = imageUrls.length > 0 ? "ready" : "awaiting_images";
  } else if ((existing.status === "done" || existing.status === "failed") && urlsChanged) {
    nextStatus = imageUrls.length > 0 ? "ready" : "awaiting_images";
    clearResult = true;
  }

  // Clearing result_url (via clearResult below) means this lead is no
  // longer a finished, reviewed lead — also clear review_status/flag_count
  // so it drops out of the Sales Lead Distribution pool query (which
  // filters on review_status) exactly as it drops out of "done" leads
  // generally, instead of leaving stale review data behind.
  const [row] = clearResult
    ? await sql`
        UPDATE hunter_leads
        SET image_urls = ${imageUrls}, note = COALESCE(${note ?? null}, note), status = ${nextStatus},
            result_url = NULL, last_error = NULL, review_status = NULL, flag_count = NULL, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
    : await sql`
        UPDATE hunter_leads
        SET image_urls = ${imageUrls}, note = COALESCE(${note ?? null}, note), status = ${nextStatus}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
  return (row as HunterLead) ?? null;
}

// --- Automation run bookkeeping -----------------------------------------
// Called by app/api/admin/hunter/[id]/run/route.ts (and
// scripts/hunterAutoFillJob.ts) around each phase of a run. Kept as small,
// obviously-named functions rather than one generic "updateStatus" so each
// call site reads as exactly what's happening.
//
// CHANGE (2026-08-31): a lead's images are now reviewed together as ONE
// batch (lib/automationCheckAd.ts:checkAdImageUrls) producing ONE
// result_url, rather than one-result-per-image appended as the run
// progresses — so there's no more partial "2 of 3 appended so far" state
// to persist mid-run. The run route now calls markHunterLeadRunning, then
// either markHunterLeadDone(id, resultUrl, reviewStatus, flagCount) or
// markHunterLeadFailed once, after the whole batch settles.

export async function markHunterLeadRunning(id: string): Promise<void> {
  await sql`UPDATE hunter_leads SET status = 'running', last_error = NULL, updated_at = now() WHERE id = ${id}`;
}

// CHANGE (Sales Lead Distribution, 2026-09-01): now also takes the batch's
// overall review outcome and total flag count (both come straight off
// CheckAdBatchResult — see lib/automationCheckAd.ts) and persists them onto
// review_status/flag_count. This is what lets the sales distribution pool
// query (lib/salesLeads.ts) tell "done and clean" apart from "done and
// found a problem" without re-deriving it from submissions/review_flags —
// every existing caller was already holding these values, they just
// weren't being saved anywhere before this.
export async function markHunterLeadDone(
  id: string,
  resultUrl: string,
  reviewStatus: HunterLeadReviewStatus,
  flagCount: number
): Promise<void> {
  await sql`
    UPDATE hunter_leads
    SET status = 'done', result_url = ${resultUrl}, last_error = NULL,
        review_status = ${reviewStatus}, flag_count = ${flagCount}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markHunterLeadFailed(id: string, errorMessage: string): Promise<void> {
  await sql`UPDATE hunter_leads SET status = 'failed', last_error = ${errorMessage}, updated_at = now() WHERE id = ${id}`;
}

export async function getHunterLead(id: string): Promise<HunterLead | null> {
  const [row] = await sql`SELECT * FROM hunter_leads WHERE id = ${id}`;
  return (row as HunterLead) ?? null;
}

// Hunter/admin removing a lead from the queue entirely (the per-row "ลบ"
// button in HunterImport.tsx) — a plain hard delete, since a hunter_leads
// row is just a prospecting queue entry, not billing/audit data like a
// real submission. Deleting a lead does NOT touch the `submissions` row(s)
// its automation runs already created (those stay, same as any other
// automation-business submission) — only removes it from this queue.
//
// NOTE (Sales Lead Distribution): if this lead was already assigned to a
// sales rep (sales_lead_assignments.hunter_lead_id references this id),
// the FOREIGN KEY has no ON DELETE clause, so deleting an assigned lead
// will fail with a DB error instead of silently orphaning the assignment —
// intentional: a lead a sales rep is actively working should not be
// deletable out from under them via the Hunter queue's "ลบ" button.
// Returns true if a row was actually deleted.
export async function deleteHunterLead(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM hunter_leads WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
