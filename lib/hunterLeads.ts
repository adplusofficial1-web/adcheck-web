import { sql } from "@/lib/db";

// Admin > Marketing > Hunter's server-side queue — see
// migrations/009_hunter_queue.sql for the full table design writeup and
// why this is a separate table from `submissions`/`submission_images`
// rather than reusing them, and migrations/010_hunter_leads_single_result_url.sql
// for why result_url is a single column, not an array. See
// migrations/011_sales_leads.sql for review_status/flag_count, added so the
// Sales Lead Distribution pool (lib/salesLeads.ts) can filter to only
// leads whose AI review actually found a problem. See
// migrations/013_hunter_sent.sql for hunter_sent_at — the admin-driven "ส่ง"
// step that decides when a checked lead becomes visible on the read-only
// Hunter Freelancer page (/hunter, see listHunterLeadsPublicView below).
// See migrations/017_hunter_lead_assignment.sql for assigned_hunter_user_id
// — every "ส่ง" lead now goes to exactly ONE Hunter (picked automatically,
// see pickHunterForAssignment below) instead of broadcasting to everyone.

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
hunter_sent_at: string | null;
assigned_hunter_user_id: string | null;
};

const ALLOWED_STATUS: HunterLeadStatus[] = ["awaiting_images", "ready", "running", "done", "failed"];

export function isHunterLeadStatus(v: unknown): v is HunterLeadStatus {
return typeof v === "string" && (ALLOWED_STATUS as string[]).includes(v);
}

// The minimal shape the Hunter Freelancer Page (/hunter) is allowed to
// see — deliberately NOT the full HunterLead: no image_urls, note, or
// last_error, since those are internal working fields for the admin
// queue, not something an external freelancer's read-only view needs
// exposed. See lib/currentHunterUser.ts / app/api/hunter/leads/route.ts.
export type HunterLeadPublicView = {
id: string;
clinic_name: string;
province: string | null;
source_link: string | null;
status: HunterLeadStatus;
result_url: string | null;
created_at: string;
};

// Every lead, newest first — matches the "คิวที่ส่งแล้ว" table's original
// [...queue].reverse() ordering from the localStorage-only version.
export async function listHunterLeads(): Promise<HunterLead[]> {
const rows = await sql`SELECT * FROM hunter_leads ORDER BY created_at DESC`;
return rows as HunterLead[];
}

// Same ordering as listHunterLeads, but selects only the columns a Hunter
// freelancer's read-only view is allowed to see — see HunterLeadPublicView
// above. Powers GET /api/hunter/leads.
//
// CHANGE (2026-09-01, "ส่ง" workflow — migrations/013_hunter_sent.sql):
// only leads the admin has explicitly marked "ส่งสำเร็จ" (hunter_sent_at
// set via markHunterLeadSent, the "ส่ง" button in HunterImport.tsx) show up
// here — a lead being status='done' is no longer enough on its own.
// Confirmed with user: freelancers should see only what's been sent to
// them, not the whole queue as soon as it's checked.
//
// NOTE (2026-09-01, Automatic Hunter Lead Assignment): this function is no
// longer what actually powers a signed-in Hunter's /hunter Pipeline tab —
// that's lib/hunterPipeline.ts:listHunterLeadsForHunter(hunterUserId), which
// additionally filters to hl.assigned_hunter_user_id = hunterUserId so each
// Hunter only sees the ONE clinic they were assigned, not every sent lead.
// This unscoped version is kept only as a small helper (unused internally
// right now, left in place rather than deleted mid-fix) — do NOT wire it
// back into any Hunter-facing route without adding the same assignment
// filter, or the broadcast bug this fix addresses comes right back.
export async function listHunterLeadsPublicView(): Promise<HunterLeadPublicView[]> {
const rows = await sql`
SELECT id, clinic_name, province, source_link, status, result_url, created_at
FROM hunter_leads
WHERE hunter_sent_at IS NOT NULL
ORDER BY created_at DESC
`;
return rows as HunterLeadPublicView[];
}

// Match key for clinic-name duplicate detection — trim + lowercase only.
// Confirmed with user (2026-09-01): dedupe compares "ชื่อคลินิกอย่างเดียว"
// (clinic name only, not name+province), case/whitespace-insensitive so
// "ABC Clinic" / "abc clinic " / " ABC Clinic" are all treated as the same
// clinic. Exported so the import preview (HunterImport.tsx) can flag
// likely duplicates client-side using the exact same rule the server
// enforces authoritatively below.
export function normalizeClinicName(name: string): string {
return name.trim().toLowerCase();
}

// Bulk-insert straight from the Excel-import preview (HunterImport.tsx) —
// one row per parsed clinic, status always starts 'awaiting_images' since
// none of them have image_urls yet at this point.
//
// CHANGE (2026-09-01, per user request: "ทุกครั้งที่เพิ่มคลินิก หรือ เพิ่มไฟล์
// ให้ระบบลบชื่อที่ซ้ำกับที่ในระบบมีก่อนทุกครั้ง"): now dedupes against clinic
// names already in `hunter_leads` (normalizeClinicName above), skipping any
// row whose clinic name already exists — and also dedupes WITHIN this same
// batch (a file can legitimately list the same clinic twice), keeping only
// the first occurrence. Loads the full existing-name set once up front
// rather than one EXISTS query per row — the leads table is small enough
// (a marketing prospecting queue, not a transactional table) that this is
// far cheaper than N extra round-trips. Returns both how many rows were
// actually inserted and how many were skipped as duplicates so the caller
// can show the admin both numbers.
// CHANGE (2569-09-02, per user request to make raising the import cap in
// app/api/admin/hunter/route.ts's MAX_IMPORT_ROWS safe): switched the old
// "await one INSERT per row, sequentially" loop below for a chunked
// multi-row INSERT. The old version did N full network round-trips to
// Neon for N rows — fine at a "few hundred rows" scale, but at a few
// thousand rows that's a few thousand sequential round-trips inside ONE
// HTTP request, which risks running long enough to hit Render's request
// timeout mid-import (and since nothing was wrapped in a transaction, a
// timeout partway through left whatever had already committed sitting in
// the table — recoverable on a retry thanks to the dedupe above, but
// confusing for whoever's importing). Chunking into IMPORT_CHUNK_SIZE-row
// INSERT statements cuts the round-trip count by ~IMPORT_CHUNK_SIZE×
// while keeping each statement's parameter count (3 per row) well under
// Postgres's 65535-per-query ceiling. Built with the driver's
// `sql(text, params)` call form (see node_modules/@neondatabase/serverless
// — the tagged-template `sql\`...\`` form used everywhere else in this
// file has no bulk-VALUES helper) rather than tagged-template interpolation,
// since the VALUES clause itself (placeholder count) is only known at
// runtime.
const IMPORT_CHUNK_SIZE = 500;

export async function importHunterLeads(
rows: { clinic: string; province: string; link: string }[]
): Promise<{ inserted: number; skippedDuplicate: number }> {
if (rows.length === 0) return { inserted: 0, skippedDuplicate: 0 };

const existingRows = (await sql`SELECT clinic_name FROM hunter_leads`) as { clinic_name: string }[];
const existingNames = new Set(existingRows.map((r) => normalizeClinicName(r.clinic_name)));
const seenInBatch = new Set<string>();

const toInsert: { clinic: string; province: string; link: string }[] = [];
let skippedDuplicate = 0;

for (const r of rows) {
const key = normalizeClinicName(r.clinic);
if (key && (existingNames.has(key) || seenInBatch.has(key))) {
skippedDuplicate++;
continue;
}
if (key) seenInBatch.add(key);
toInsert.push(r);
}

for (let i = 0; i < toInsert.length; i += IMPORT_CHUNK_SIZE) {
const chunk = toInsert.slice(i, i + IMPORT_CHUNK_SIZE);
const values: any[] = [];
const placeholders: string[] = [];
chunk.forEach((r, idx) => {
const base = idx * 3;
placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'awaiting_images')`);
values.push(r.clinic, r.province || null, r.link || null);
});
await sql(
`INSERT INTO hunter_leads (clinic_name, province, source_link, status) VALUES ${placeholders.join(", ")}`,
values
);
}

return { inserted: toInsert.length, skippedDuplicate };
}

// Hunter filling in image URLs (and/or a note) for a lead they're
// actively working — up to 3 (enforced by the DB CHECK constraint, see
// migration).
//
// Status handling:
// - 'awaiting_images' -> 'ready' the moment the first image URL lands,
// so the admin "run automation" list only ever shows leads that
// actually have something to review.
// - 'running' is left alone — editing urls mid-run shouldn't be
// possible from the UI anyway (the run button disables while
// running), but if it somehow happens, don't fight the in-flight run.
// - 'done'/'failed' -> 'ready', clearing result_url/last_error,
// whenever the edited image_urls array no longer matches what's
// already in image_urls. This matters because a lead's images are
// now reviewed together as ONE batch (checkAdImageUrls) producing
// ONE result_url — if Hunter swaps out any image for a different
// URL, the old combined result would silently describe the wrong
// set of images without this reset.
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
// - awaiting_images/ready <-> each other, purely by url count (never
// touches running/done/failed — those only ever change via the
// automation run itself, see markHunterLeadRunning/Done/Failed below)
// - done/failed -> ready/awaiting_images (clearing result_url) only
// when the urls actually changed, so re-saving the same urls after a
// completed run doesn't wipe its result for no reason
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
//
// CHANGE (2026-09-01, "ส่ง" workflow): also clear hunter_sent_at here — if
// Hunter freelancers were already sent this lead's old result and the
// admin now swaps the images, the old result_url they were given is gone
// (set to NULL above), so it must also disappear from their /hunter list
// (listHunterLeadsPublicView filters on hunter_sent_at IS NOT NULL) rather
// than linger there pointing at nothing. Re-sending after the re-review
// completes is the same explicit "ส่ง" click as any other lead.
//
// CHANGE (2026-09-01, Automatic Hunter Lead Assignment): also clear
// assigned_hunter_user_id alongside hunter_sent_at, for the same reason —
// a re-sent lead should be assigned fresh by pickHunterForAssignment
// below, not silently keep pointing at whichever Hunter got the old
// (now-invalid) result.
const [row] = clearResult
? await sql`
UPDATE hunter_leads
SET image_urls = ${imageUrls}, note = COALESCE(${note ?? null}, note), status = ${nextStatus},
result_url = NULL, last_error = NULL, review_status = NULL, flag_count = NULL,
hunter_sent_at = NULL, assigned_hunter_user_id = NULL, updated_at = now()
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

// --- Automatic lead assignment (2569-09-01, Automatic Hunter Lead
// Assignment fix) --------------------------------------------------------
// Fixes a real bug reported by the site owner: every active Hunter was
// seeing the exact same admin-"ส่ง" clinics at once (hunter_sent_at was a
// single shared broadcast flag with no per-Hunter scoping), so multiple
// Hunters could independently contact the same clinic. See
// migrations/017_hunter_lead_assignment.sql for the full writeup and the
// project doc "Hunter Lead Assignment - No Duplicates.md".
//
// Picks the active Hunter with the fewest currently-OPEN admin-sent leads,
// tie-broken by earliest hunter_users.created_at — the exact same
// "least-loaded, tie-break by created_at" convention
// lib/salesLeads.ts:distributeDailyLeads uses for sales reps, so this
// isn't a third distribution rule invented for Hunters specifically.
// "Open" = a lead already assigned to this Hunter (hunter_sent_at IS NOT
// NULL) whose PRIVATE pipeline status (hunter_lead_pipeline — defaults to
// 'new' when this Hunter has no row for it yet) isn't one of the terminal
// states (closed_won/closed_lost/no_response) — mirrors
// sales_lead_assignments' own open-status list. Never reads/writes
// hunter_self_leads (a completely different, already-private-by-
// construction table — see migrations/016_hunter_self_leads.sql).
//
// Returns null (never throws itself) when there is no active Hunter at
// all to assign to — callers decide how to surface that; see
// markHunterLeadSent below, which turns a null pick into a clear thrown
// error rather than silently no-op'ing a "ส่ง" click.
export async function pickHunterForAssignment(): Promise<string | null> {
const rows = (await sql`
SELECT hu.id
FROM hunter_users hu
LEFT JOIN hunter_leads hl
ON hl.assigned_hunter_user_id = hu.id AND hl.hunter_sent_at IS NOT NULL
LEFT JOIN hunter_lead_pipeline hlp
ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = hu.id
WHERE hu.active = true
GROUP BY hu.id, hu.created_at
ORDER BY
COUNT(hl.id) FILTER (
WHERE hl.id IS NOT NULL
AND COALESCE(hlp.status, 'new') NOT IN ('closed_won', 'closed_lost', 'no_response')
) ASC,
hu.created_at ASC
LIMIT 1
`) as { id: string }[];
return rows[0]?.id ?? null;
}

// --- "ส่ง" workflow (Hunter Freelancer Page, 2026-09-01) ------------------
// The admin-driven gate between "checked" (status='done') and "visible to
// Hunter freelancers on /hunter" — see migrations/013_hunter_sent.sql and
// listHunterLeadsPublicView above. Called by
// app/api/admin/hunter/[id]/send/route.ts (the "ส่ง"/"ยกเลิกส่ง" buttons in
// HunterImport.tsx's queue table).

// Only ever sends a lead that's actually 'done' — the WHERE clause makes
// this a no-op (returns null) rather than an error if called on a lead
// that isn't ready yet, so the route can treat "nothing changed" plainly.
//
// CHANGE (2569-09-01, Automatic Hunter Lead Assignment): now also picks
// exactly ONE active Hunter (pickHunterForAssignment above) and stamps
// assigned_hunter_user_id in the same UPDATE as hunter_sent_at, instead of
// leaving every Hunter to see the same broadcast list. Throws a plain
// Error (rather than returning null, which the route would otherwise read
// as "lead not found/not done") when there is no active Hunter at all —
// the route below turns this into a clear 400 for the admin instead of
// either silently no-op'ing the "ส่ง" click or a raw 500. Runs the pick
// BEFORE the UPDATE (two round-trips, not one atomic statement) — fine
// for a single admin click; the "ส่งทั้งหมด" batch path
// (app/api/admin/hunter/send-all/route.ts) is what actually has to worry
// about concurrent picks racing on stale counts, and that route calls
// this function once per lead SEQUENTIALLY specifically so each pick sees
// every prior iteration's already-committed assignment.
export async function markHunterLeadSent(id: string): Promise<HunterLead | null> {
const hunterUserId = await pickHunterForAssignment();
if (!hunterUserId) {
throw new Error("ไม่มี Hunter ที่เปิดใช้งานอยู่ในระบบ ไม่สามารถส่งได้");
}
const [row] = await sql`
UPDATE hunter_leads SET hunter_sent_at = now(), assigned_hunter_user_id = ${hunterUserId}
WHERE id = ${id} AND status = 'done'
RETURNING *
`;
return (row as HunterLead) ?? null;
}

// CHANGE (2569-09-01, Automatic Hunter Lead Assignment): also clears
// assigned_hunter_user_id back to NULL, not just hunter_sent_at — a
// "ยกเลิกส่ง" lead should be a completely blank slate, picked fresh by
// pickHunterForAssignment whenever it's sent again, not silently still
// pointed at whichever Hunter it was assigned to before.
export async function unmarkHunterLeadSent(id: string): Promise<HunterLead | null> {
const [row] = await sql`
UPDATE hunter_leads SET hunter_sent_at = NULL, assigned_hunter_user_id = NULL WHERE id = ${id}
RETURNING *
`;
return (row as HunterLead) ?? null;
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

// Checkbox-based bulk delete (2026-09-01, per user request: "มีปุ่มติ๊กที่
// สามารถลบเป็นกลุ่มได้") — the multi-select "ลบที่เลือก" button in
// HunterImport.tsx. Deletes each id with its OWN statement (not one
// multi-row DELETE ... WHERE id = ANY(...)) specifically so one row hitting
// the same FK constraint noted on deleteHunterLead above (already assigned
// to a sales rep) fails on its own instead of rolling back every other
// delete in the batch — the admin selecting 200 rows to clean up shouldn't
// lose all 200 because 1 of them was already picked up by sales. Returns
// which ids actually got deleted and which failed (with a reason) so the
// caller can report both back to the admin.
export async function bulkDeleteHunterLeads(
ids: string[]
): Promise<{ deletedIds: string[]; failed: { id: string; error: string }[] }> {
const deletedIds: string[] = [];
const failed: { id: string; error: string }[] = [];
for (const id of ids) {
try {
const rows = await sql`DELETE FROM hunter_leads WHERE id = ${id} RETURNING id`;
if (rows.length > 0) {
deletedIds.push(id);
} else {
failed.push({ id, error: "ไม่พบรายการนี้" });
}
} catch {
// Same FK situation as deleteHunterLead above (lead already assigned
// to a sales rep via sales_lead_assignments.hunter_lead_id) — surface
// a plain-language reason rather than the raw DB error.
failed.push({ id, error: "ลบไม่สำเร็จ (อาจถูกมอบหมายให้เซลล์แล้ว)" });
}
}
return { deletedIds, failed };
}
