import { sql } from "@/lib/db";
import { sendHunterMessage } from "@/lib/hunterMessages";

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
// See migrations/019_hunter_leads_run_watchdog.sql for run_started_at (the
// stuck-'running' watchdog, recoverStaleRunningLeads below) and
// auto_fill_attempts/auto_fill_last_attempt_at (the auto-fill cron's fair
// rotation, markHunterLeadAutoFillAttempt below).

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
run_started_at: string | null;
auto_fill_attempts: number;
auto_fill_last_attempt_at: string | null;
};

// Thrown by updateHunterLeadImages when the lead is mid-run (status
// 'running') — the PATCH route (app/api/admin/hunter/[id]/route.ts) turns
// this into a 409 so the admin gets "แก้ลิงก์ได้เมื่อตรวจเสร็จ" instead of the
// edit silently racing the in-flight review. Typed (not a string match on
// the message) so the route can't confuse it with a real DB failure.
export class HunterLeadBusyError extends Error {
constructor() {
super("hunter lead is running");
this.name = "HunterLeadBusyError";
}
}

// The clinic-name placeholder HunterImport.tsx substitutes for a row whose
// name cell was empty (only a link present) — must match that file's
// literal exactly. Exempt from dedupe in importHunterLeads below: many
// rows can legitimately share it, and skipping all-but-one as "duplicates"
// silently dropped real leads.
export const UNNAMED_CLINIC_PLACEHOLDER = "(ไม่ระบุชื่อ - ต้องเช็ค)";

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
// CHANGE (2569-09-02, Bug Audit 4): every chunk now goes to Neon inside ONE
// `sql.transaction([...])` (the driver's non-interactive HTTP transaction —
// it accepts the same un-awaited `sql(text, params)` promises), so an
// import is all-or-nothing again: a failure in chunk 3 no longer leaves
// chunks 1-2 committed with the admin told "นำเข้าไม่สำเร็จ". Also: rows
// carrying the UNNAMED_CLINIC_PLACEHOLDER name are exempt from dedupe (see
// that constant) and the return shape is { inserted, skippedDuplicates }
// (plural, matching what the route/UI now report).
const IMPORT_CHUNK_SIZE = 500;

export async function importHunterLeads(
rows: { clinic: string; province: string; link: string }[]
): Promise<{ inserted: number; skippedDuplicates: number }> {
if (rows.length === 0) return { inserted: 0, skippedDuplicates: 0 };

const placeholderKey = normalizeClinicName(UNNAMED_CLINIC_PLACEHOLDER);
const existingRows = (await sql`SELECT clinic_name FROM hunter_leads`) as { clinic_name: string }[];
const existingNames = new Set(existingRows.map((r) => normalizeClinicName(r.clinic_name)));
const seenInBatch = new Set<string>();

const toInsert: { clinic: string; province: string; link: string }[] = [];
let skippedDuplicates = 0;

for (const r of rows) {
const key = normalizeClinicName(r.clinic);
const dedupable = key.length > 0 && key !== placeholderKey;
if (dedupable && (existingNames.has(key) || seenInBatch.has(key))) {
skippedDuplicates++;
continue;
}
if (dedupable) seenInBatch.add(key);
toInsert.push(r);
}

if (toInsert.length === 0) return { inserted: 0, skippedDuplicates };

const queries = [];
for (let i = 0; i < toInsert.length; i += IMPORT_CHUNK_SIZE) {
const chunk = toInsert.slice(i, i + IMPORT_CHUNK_SIZE);
const values: any[] = [];
const placeholders: string[] = [];
chunk.forEach((r, idx) => {
const base = idx * 3;
placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'awaiting_images')`);
values.push(r.clinic, r.province || null, r.link || null);
});
queries.push(
sql(
`INSERT INTO hunter_leads (clinic_name, province, source_link, status) VALUES ${placeholders.join(", ")}`,
values
)
);
}
await sql.transaction(queries);

return { inserted: toInsert.length, skippedDuplicates };
}

// Hunter filling in image URLs (and/or a note) for a lead they're
// actively working — up to 3 (enforced by the DB CHECK constraint, see
// migration).
//
// Status handling:
// - 'awaiting_images' -> 'ready' the moment the first image URL lands,
// so the admin "run automation" list only ever shows leads that
// actually have something to review.
// - 'running' -> throws HunterLeadBusyError (2569-09-02, Bug Audit 4).
// Previously the edit went through and overwrote image_urls under an
// in-flight review, so the run's result_url ended up describing a set
// of images that no longer matched what was saved. The PATCH route
// turns the error into a 409; the UI also disables the inputs while
// running, but the server is the authority.
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
if (existing.status === "running") throw new HunterLeadBusyError();

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

// CHANGE (2569-09-02, Bug Audit 4): now a compare-and-set — the `AND status
// <> 'running'` guard means two concurrent run requests for the same lead
// (double-click, the auto-run-on-3rd-URL firing alongside a manual click,
// "ตรวจสอบทั้งหมด" overlapping a row's own button) can't BOTH proceed and
// spend two batches of credits on one lead. Returns false when the lead is
// already running (or doesn't exist) so the caller can 409/skip instead of
// blindly continuing. Also stamps run_started_at for the stuck-run
// watchdog (recoverStaleRunningLeads below).
export async function markHunterLeadRunning(id: string): Promise<boolean> {
const rows = await sql`
UPDATE hunter_leads
SET status = 'running', last_error = NULL, run_started_at = now(), updated_at = now()
WHERE id = ${id} AND status <> 'running'
RETURNING id
`;
return rows.length > 0;
}

// Stuck-'running' watchdog (2569-09-02, Bug Audit 4 — see
// migrations/019_hunter_leads_run_watchdog.sql). A run that dies mid-flight
// (Render restart/request timeout on the manual route, OOM kill on the cron)
// never reaches markHunterLeadDone/Failed, so the lead sat at 'running'
// forever with its run/delete buttons hidden. Flips any lead that has been
// 'running' longer than maxAgeMinutes back to 'failed' with a clear Thai
// last_error so the admin can simply re-run it. Called at the top of
// GET /api/admin/hunter (every queue load) and at the start of
// scripts/hunterAutoFillJob.ts. 15 minutes is far beyond a real run (≤3
// images, each a single AI call). Returns how many rows were recovered.
// Rows from before migration 019 have run_started_at NULL — those are
// covered by the updated_at fallback so they can't stay stuck either.
export async function recoverStaleRunningLeads(maxAgeMinutes = 15): Promise<number> {
const rows = await sql`
UPDATE hunter_leads
SET status = 'failed',
last_error = 'หมดเวลา (ระบบอาจรีสตาร์ทระหว่างตรวจ) — กดตรวจสอบอัตโนมัติอีกครั้ง',
updated_at = now()
WHERE status = 'running'
AND COALESCE(run_started_at, updated_at) < now() - (${maxAgeMinutes} * interval '1 minute')
RETURNING id
`;
return rows.length;
}

// Auto-fill cron bookkeeping (2569-09-02, Bug Audit 4 — see
// migrations/019_hunter_leads_run_watchdog.sql): recorded after EVERY
// attempt scripts/hunterAutoFillJob.ts makes to find a lead's images,
// found or not, so that job's selection query can rotate fairly through
// the queue instead of retrying the same never-found leads forever.
export async function markHunterLeadAutoFillAttempt(id: string): Promise<void> {
await sql`
UPDATE hunter_leads
SET auto_fill_attempts = auto_fill_attempts + 1, auto_fill_last_attempt_at = now()
WHERE id = ${id}
`;
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
//
// CHANGE (2569-09-02, Bug Audit 4): only Hunters an admin has approved for
// assignment (hunter_users.assignment_approved — see
// migrations/020_hunter_assignment_approval.sql; self-registered rows
// start false) are eligible. Also: markHunterLeadSent no longer calls this
// function — it inlines the exact same SELECT as a subquery of its own
// UPDATE (see PICK_HUNTER_SUBQUERY) so pick+assign is one statement. Keep
// the two in sync if the ranking rule ever changes; this standalone
// version is kept for the eligibility pre-check (countAssignableHunters)
// and any future caller that only wants to *read* the pick.
const PICK_HUNTER_SUBQUERY = `
SELECT hu.id
FROM hunter_users hu
LEFT JOIN hunter_leads hl
ON hl.assigned_hunter_user_id = hu.id AND hl.hunter_sent_at IS NOT NULL
LEFT JOIN hunter_lead_pipeline hlp
ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = hu.id
WHERE hu.active = true AND hu.assignment_approved = true
GROUP BY hu.id, hu.created_at
ORDER BY
COUNT(hl.id) FILTER (
WHERE hl.id IS NOT NULL
AND COALESCE(hlp.status, 'new') NOT IN ('closed_won', 'closed_lost', 'no_response')
) ASC,
hu.created_at ASC
LIMIT 1
`;

export async function pickHunterForAssignment(): Promise<string | null> {
const rows = (await sql(PICK_HUNTER_SUBQUERY)) as { id: string }[];
return rows[0]?.id ?? null;
}

// How many Hunters are currently eligible to be assigned a lead — the
// pre-check markHunterLeadSent runs so "no Hunter at all" can stay a clear
// thrown error (-> 400 in the send route) rather than the single-statement
// UPDATE below silently stamping assigned_hunter_user_id = NULL.
async function countAssignableHunters(): Promise<number> {
const [row] = (await sql`
SELECT COUNT(*)::int AS n FROM hunter_users WHERE active = true AND assignment_approved = true
`) as { n: number }[];
return row?.n ?? 0;
}

// Message text the send route matches on to map "no Hunter" to a 400 —
// exported so the route doesn't have to hard-code a substring.
export const NO_ACTIVE_HUNTER_MESSAGE = "ไม่มี Hunter ที่เปิดใช้งานอยู่ในระบบ ไม่สามารถส่งได้";

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
// either silently no-op'ing the "ส่ง" click or a raw 500.
//
// CHANGE (2569-09-02, Bug Audit 4): two fixes in one rewrite —
// 1. `AND hunter_sent_at IS NULL`: re-sending an already-sent lead used to
// silently re-run the pick and REASSIGN it to a different Hunter (a
// double-click on "ส่ง", or two admins) — now it's a no-op (returns
// null) and the send route reports 409 "ถูกส่งไปแล้ว".
// 2. The pick is now a subquery INSIDE the UPDATE (one statement, not
// SELECT-then-UPDATE), so two concurrent sends can't both read the same
// stale "who's least loaded" snapshot and pile onto one Hunter — each
// UPDATE's subquery sees the other's committed assignment (or blocks on
// the row lock if they target the same lead). The cheap
// countAssignableHunters pre-check keeps the "no Hunter at all" case a
// clear thrown error instead of an UPDATE that stamps a NULL assignee.
export async function markHunterLeadSent(id: string): Promise<HunterLead | null> {
if ((await countAssignableHunters()) === 0) {
throw new Error(NO_ACTIVE_HUNTER_MESSAGE);
}
const rows = (await sql(
`UPDATE hunter_leads
SET hunter_sent_at = now(), assigned_hunter_user_id = (${PICK_HUNTER_SUBQUERY})
WHERE id = $1 AND status = 'done' AND hunter_sent_at IS NULL
RETURNING *`,
[id]
)) as HunterLead[];
const row = rows[0];
if (!row) return null;
// The roster emptied between the pre-check and the UPDATE (a Hunter was
// deactivated in that window) — undo rather than leave a sent-but-
// assigned-to-nobody lead that no Hunter would ever see.
if (!row.assigned_hunter_user_id) {
await sql`UPDATE hunter_leads SET hunter_sent_at = NULL, assigned_hunter_user_id = NULL WHERE id = ${id}`;
throw new Error(NO_ACTIVE_HUNTER_MESSAGE);
}
return row;
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

// --- Automatic DAILY lead distribution (2569-09-05, per user request:
// "hunter ทุกคนที่สมัครแล้ว ให้ส่ง Lead 10 อัน ทุกวันได้เลย อัตโนมัติ") --------
// Distinct from the admin-driven "ส่ง" workflow above (markHunterLeadSent),
// which sends ONE lead at a time, on demand, only to
// assignment_approved=true Hunters. This instead runs once a day (see
// scripts/hunterLeadDistributionJob.ts, a Render Cron Job) and tops up
// EVERY active Hunter's open queue to HUNTER_DAILY_QUOTA — deliberately
// mirroring lib/salesLeads.ts:distributeDailyLeads's "top up to quota, in
// signup order, pool exhaustion is a per-recipient shortfall not an error"
// shape, since it's structurally the same problem for a different
// recipient table. Three requirements confirmed with the site owner via
// AskUserQuestion (2569-09-05), each a deliberate departure from the
// existing manual "ส่ง" flow:
//   1. Pool: ONLY hunter_leads.review_status = 'violation' — never falls
//      back to 'caution'/'passed' even once this pool is empty. (The manual
//      "ส่ง" flow has no such restriction — any status='done' lead
//      qualifies there.)
//   2. Recipients: every hunter_users row with active = true, INCLUDING
//      ones with assignment_approved = false (self-registered, not yet
//      admin-approved). The manual "ส่ง" flow's pickHunterForAssignment
//      requires assignment_approved = true — this daily drop deliberately
//      does not.
//   3. Notification: a system message into the Hunter's existing
//      hunter_messages thread (sender='admin', sender_email=null — the
//      Hunter side renders any admin row as "ทีมงาน" regardless, per
//      lib/hunterMessages.ts's own comment), so the unread-badge on their
//      existing "แชทกับทีมงาน" tab (HunterShell.tsx) lights up without any
//      new notification channel being built.
export const HUNTER_DAILY_QUOTA = 10;

export type HunterLeadDistributionResult = {
hunterUserId: string;
hunterUserName: string;
assignedCount: number;
needed: number;
};

// Sequential, one Hunter at a time, in signup order (hunter_users.created_at
// ASC) — same fairness rule and same reasoning as
// lib/salesLeads.ts:distributeDailyLeads: when the violation pool runs
// short, whoever registered earliest gets priority rather than an arbitrary
// or random split. Each Hunter's assignment UPDATEs commit before the next
// Hunter's pool SELECT runs, so two Hunters processed in the same run can
// never be handed the same lead (the pool query's
// `assigned_hunter_user_id IS NULL` filter is what prevents the overlap,
// same mechanism as the sales version's anti-join) — safe without any
// explicit locking because this only ever runs from one cron process at a
// time, exactly like the sales job it mirrors.
export async function distributeDailyHunterLeads(): Promise<HunterLeadDistributionResult[]> {
const activeHunters = (await sql`
SELECT id, name FROM hunter_users WHERE active = true ORDER BY created_at ASC
`) as { id: string; name: string }[];

const results: HunterLeadDistributionResult[] = [];

for (const hunter of activeHunters) {
// "Open" here is the exact same definition PICK_HUNTER_SUBQUERY above
// uses for the manual "ส่ง" flow's least-loaded pick: a lead already
// assigned+sent to this Hunter whose PRIVATE pipeline status (defaults
// to 'new' when they have no hunter_lead_pipeline row for it yet) isn't
// one of the terminal states. Kept in sync deliberately — if that
// definition ever changes, mirror the change here too.
const [{ open_count }] = (await sql`
SELECT COUNT(*)::int AS open_count
FROM hunter_leads hl
LEFT JOIN hunter_lead_pipeline hlp
ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = ${hunter.id}
WHERE hl.assigned_hunter_user_id = ${hunter.id}
AND hl.hunter_sent_at IS NOT NULL
AND COALESCE(hlp.status, 'new') NOT IN ('closed_won', 'closed_lost', 'no_response')
`) as { open_count: number }[];

const needed = HUNTER_DAILY_QUOTA - open_count;
if (needed <= 0) {
results.push({ hunterUserId: hunter.id, hunterUserName: hunter.name, assignedCount: 0, needed: 0 });
continue;
}

// Pool: violation-only, never assigned to anyone yet, oldest first —
// see requirement 1 above. Deliberately NOT filtered on
// assignment_approved (requirement 2) — that column only gates the
// manual "ส่ง" flow.
const pool = (await sql`
SELECT id FROM hunter_leads
WHERE review_status = 'violation' AND assigned_hunter_user_id IS NULL
ORDER BY created_at ASC
LIMIT ${needed}
`) as { id: string }[];

// Compare-and-set per lead (not a single multi-row UPDATE) so this stays
// safe to re-run: a second trigger the same day (or a retry after a
// partial failure) can only top up whatever's still actually
// unassigned, never double-assign a lead this run already gave out.
let assignedCount = 0;
for (const { id: leadId } of pool) {
const rows = await sql`
UPDATE hunter_leads
SET assigned_hunter_user_id = ${hunter.id}, hunter_sent_at = now(), updated_at = now()
WHERE id = ${leadId} AND assigned_hunter_user_id IS NULL
RETURNING id
`;
if (rows.length > 0) assignedCount++;
}

if (assignedCount > 0) {
// Non-fatal by design — a chat-message failure must never undo or
// block the assignment itself, which already committed above.
try {
await sendHunterMessage({
hunterUserId: hunter.id,
sender: "admin",
senderEmail: null,
body: `ระบบมอบหมาย lead ใหม่ให้คุณ ${assignedCount} รายการวันนี้ (ที่เปิดอยู่ตอนนี้ ${
open_count + assignedCount
}/${HUNTER_DAILY_QUOTA}) เข้าไปดูได้ที่แท็บ Pipeline`,
});
} catch (e) {
console.error(`distributeDailyHunterLeads: notify failed for hunter ${hunter.id}:`, e);
}
}

results.push({ hunterUserId: hunter.id, hunterUserName: hunter.name, assignedCount, needed });
}

return results;
}

// Hunter Lead Referral Attribution (2569-09-05): validates the `lead`
// cookie (see middleware.ts) against a real, currently-assigned hunter_leads
// row before lib/currentBusiness.ts ever writes it to
// businesses.referred_by_hunter_lead_id — same "don't trust a
// client-controlled cookie" posture as isActiveHunterUserId does for
// `ref` (lib/hunterUsers.ts). Requires assigned_hunter_user_id to match the
// SAME hunter the `ref` cookie already resolved to, not just any hunter —
// otherwise a stale or hand-crafted `lead` id from a DIFFERENT Hunter's
// link could get silently paired with this one's referral, misattributing
// whose Pipeline card advances and whose "กำลังใช้งาน" badge lights up.
export async function isLeadAssignedToHunter(leadId: string, hunterUserId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM hunter_leads WHERE id = ${leadId} AND assigned_hunter_user_id = ${hunterUserId} LIMIT 1
  `;
  return !!row;
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
} catch (e: any) {
// Same FK situation as deleteHunterLead above (lead already assigned
// to a sales rep via sales_lead_assignments.hunter_lead_id, or a
// hunter_lead_pipeline / hunter_commissions row referencing it) —
// surface a plain-language reason rather than the raw DB error.
// 23503 = Postgres foreign_key_violation; anything else is a generic
// failure so an unrelated DB error isn't mislabeled as "assigned".
const isFk = e?.code === "23503";
failed.push({
id,
error: isFk ? "ลบไม่ได้เพราะมีข้อมูลผูกอยู่ (มอบหมายให้เซลล์/มีค่าคอมมิชชั่นแล้ว)" : "ลบไม่สำเร็จ",
});
}
}
return { deletedIds, failed };
}
