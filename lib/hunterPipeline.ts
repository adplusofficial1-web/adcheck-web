import { sql } from "@/lib/db";
import type { HunterLeadReviewStatus } from "@/lib/hunterLeads";

// A Hunter's own PRIVATE working status + notes per clinic — see
// migrations/014_hunter_referral_commissions.sql for why this can't live on
// hunter_leads itself (every active Hunter sees the same shared "ส่ง" queue;
// multiple Hunters can independently work the same clinic, each with their
// own status/notes, and only whichever one's referral link the clinic
// actually signs up through gets paid — see lib/hunterCommission.ts, which
// is entirely independent of this table).
//
// CHANGE (2569-09-01, Automatic Hunter Lead Assignment): the comment above
// is now only half true — see listHunterLeadsForHunter below.
// hunter_lead_pipeline is still each Hunter's own private status/notes
// table, but a given admin-sent lead is no longer shared with every active
// Hunter at once; migrations/017_hunter_lead_assignment.sql added
// hunter_leads.assigned_hunter_user_id so a "ส่ง" lead now belongs to
// exactly one Hunter. This table is unaffected by that change (it's
// keyed by hunter_user_id + hunter_lead_id regardless of who the lead is
// assigned to) — it's only ever read here to compute a Hunter's OPEN
// load for the assignment picker (lib/hunterLeads.ts:
// pickHunterForAssignment), never written to by that picker.

export type HunterPipelineStatus = "new" | "contacted" | "interested" | "closed_won" | "closed_lost" | "no_response";

const ALLOWED_STATUS: HunterPipelineStatus[] = [
"new",
"contacted",
"interested",
"closed_won",
"closed_lost",
"no_response",
];

export function isHunterPipelineStatus(v: unknown): v is HunterPipelineStatus {
return typeof v === "string" && (ALLOWED_STATUS as string[]).includes(v);
}

// CHANGE (2569-09-01, per user request "เพิ่มปุ่ม ที่สามารถเพิ่มคลินิกที่
// หามาเองได้ ลงใน pipeline"): a pipeline row can now come from either
// source — `source` tells the Pipeline tab (and the API routes below)
// which table it actually lives in, since admin-sent leads and
// self-sourced leads are updated/deleted through different paths. Dropped
// the HunterLeadPublicView extends + `status` (HunterLeadStatus, the AI
// check pipeline state) — the Pipeline tab never rendered that field, and
// a self-sourced lead has no AI check at all, so keeping it around here
// only invited confusion between two different "status" concepts.
// CHANGE (2569-09-02, per user request "ทุกครั้งที่เปลี่ยนสถานะ อยากให้กำกับ
// วันที่ด้วย ทุกครั้งที่เปลี่ยน" + "เพิ่มในแต่ละคลินิก"): status_changed_at —
// when THIS Hunter last moved this clinic's pipeline_status, so the Pipeline
// tab can show a date/time on every card. Deliberately NOT the same as the
// underlying table's `updated_at`, which also bumps on a notes-only save
// (see upsertHunterLeadPipeline/updateHunterSelfLead below) — that would
// make a card's date move just from editing a note without ever changing
// stage. For an admin-sent lead this Hunter has never touched yet (no
// hunter_lead_pipeline row exists), this falls back to when the admin sent
// it (hunter_leads.hunter_sent_at) — see the query below — since there is
// no per-Hunter status-change event to report yet.
export type HunterPipelineLead = {
id: string;
clinic_name: string;
province: string | null;
source_link: string | null;
created_at: string;
result_url: string | null;
review_status: HunterLeadReviewStatus | null;
flag_count: number | null;
pipeline_status: HunterPipelineStatus;
status_changed_at: string;
notes: string;
source: "admin" | "self";
};

// Powers GET /api/hunter/leads: every lead this Hunter has been sent, LEFT
// JOINed against this Hunter's own hunter_lead_pipeline row if one exists
// yet, PLUS every clinic this Hunter has added themselves (hunter_self_leads
// — see migrations/016_hunter_self_leads.sql).
//
// CHANGE (2569-09-01, Automatic Hunter Lead Assignment — fixes a real bug
// reported by the site owner: the same admin-sent clinics were showing up
// for every active Hunter at once): the admin-lead half of this query used
// to be just `WHERE hl.hunter_sent_at IS NOT NULL` — a single shared
// broadcast flag with NO per-Hunter scoping, so every active Hunter saw
// the exact same list and could independently contact the same clinic.
// Added `AND hl.assigned_hunter_user_id = ${hunterUserId}` so a Hunter
// only ever sees the ONE clinic lead lib/hunterLeads.ts:
// pickHunterForAssignment actually assigned to them — see
// migrations/017_hunter_lead_assignment.sql. Does NOT touch the self-leads
// half below at all (hunter_self_leads was already private-by-construction
// via its own hunter_user_id column, and was never part of this bug).
//
// A sent lead with no hunter_lead_pipeline row yet reads as the default
// 'new' state with empty notes — matches the convention
// sales_lead_assignments.sales_status uses (every freshly assigned lead
// starts 'new' without a separate "have you touched this yet" flag). Also
// includes review_status/flag_count for admin leads (always null for
// self-sourced ones, since those never go through an AI check) so the
// Pipeline tab can show the same severity badge sales reps already see on
// their own leads. The two queries are combined in JS rather than a SQL
// UNION since they read from unrelated tables with a genuinely different
// shape (self leads own their pipeline_status/notes directly; admin leads
// get theirs via the LEFT JOIN) — simpler than forcing both through one
// UNION-compatible column list.
export async function listHunterLeadsForHunter(hunterUserId: string): Promise<HunterPipelineLead[]> {
const adminRows = (await sql`
SELECT
hl.id, hl.clinic_name, hl.province, hl.source_link, hl.result_url, hl.created_at,
hl.review_status, hl.flag_count,
COALESCE(hlp.status, 'new') AS pipeline_status,
COALESCE(hlp.status_changed_at, hl.hunter_sent_at) AS status_changed_at,
COALESCE(hlp.notes, '') AS notes,
'admin' AS source
FROM hunter_leads hl
LEFT JOIN hunter_lead_pipeline hlp
ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = ${hunterUserId}
WHERE hl.hunter_sent_at IS NOT NULL AND hl.assigned_hunter_user_id = ${hunterUserId}
`) as HunterPipelineLead[];

const selfRows = (await sql`
SELECT
id, clinic_name, province, source_link, created_at,
NULL::text AS result_url, NULL::text AS review_status, NULL::int AS flag_count,
pipeline_status, status_changed_at, notes,
'self' AS source
FROM hunter_self_leads
WHERE hunter_user_id = ${hunterUserId}
`) as HunterPipelineLead[];

return [...adminRows, ...selfRows].sort(
(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
}

// Creates a self-sourced lead — powers POST /api/hunter/leads. Returns the
// same shape listHunterLeadsForHunter does so the Pipeline tab can just
// prepend it to its local state without a full reload.
export async function createHunterSelfLead(
hunterUserId: string,
fields: { clinicName: string; province?: string; sourceLink?: string }
): Promise<HunterPipelineLead> {
const [row] = (await sql`
INSERT INTO hunter_self_leads (hunter_user_id, clinic_name, province, source_link)
VALUES (${hunterUserId}, ${fields.clinicName}, ${fields.province ?? null}, ${fields.sourceLink ?? null})
RETURNING id, clinic_name, province, source_link, created_at, pipeline_status, status_changed_at, notes
`) as any[];
return {
...row,
result_url: null,
review_status: null,
flag_count: null,
source: "self",
} as HunterPipelineLead;
}

// Upserts-by-update this Hunter's OWN self-sourced lead — powers
// PATCH /api/hunter/leads/[id] when body.source === "self". The
// `hunter_user_id = ${hunterUserId}` clause is the ownership check: a
// Hunter can never touch another Hunter's self-added row, even by guessing
// its id (admin leads get the equivalent guard via assigned_hunter_user_id
// in upsertHunterLeadPipeline below).
export async function updateHunterSelfLead(
hunterUserId: string,
id: string,
update: { status?: HunterPipelineStatus; notes?: string }
): Promise<{ status: HunterPipelineStatus; notes: string; status_changed_at: string } | null> {
// status_changed_at only moves when the incoming status is both present
// AND actually different from the row's current value — a notes-only save
// (status undefined) or re-selecting the same stage leaves it untouched.
// See the CHANGE note on HunterPipelineLead above for why this can't just
// reuse updated_at.
const [row] = (await sql`
UPDATE hunter_self_leads SET
pipeline_status = COALESCE(${update.status ?? null}, pipeline_status),
notes = COALESCE(${update.notes ?? null}, notes),
status_changed_at = CASE
WHEN ${update.status ?? null}::text IS NOT NULL AND ${update.status ?? null}::text IS DISTINCT FROM pipeline_status
THEN now() ELSE status_changed_at END,
updated_at = now()
WHERE id = ${id} AND hunter_user_id = ${hunterUserId}
RETURNING pipeline_status AS status, notes, status_changed_at
`) as { status: HunterPipelineStatus; notes: string; status_changed_at: string }[];
return row ?? null;
}

// Powers DELETE /api/hunter/leads/[id]?source=self — removing a
// self-added clinic entirely. Never touches hunter_leads (admin-sent
// leads aren't deletable from the Hunter side at all).
export async function deleteHunterSelfLead(hunterUserId: string, id: string): Promise<boolean> {
const rows = await sql`
DELETE FROM hunter_self_leads WHERE id = ${id} AND hunter_user_id = ${hunterUserId} RETURNING id
`;
return rows.length > 0;
}

// Upserts this Hunter's private status/notes for one lead — powers
// PATCH /api/hunter/leads/[id]. UNIQUE(hunter_user_id, hunter_lead_id) (see
// the migration) makes ON CONFLICT ... DO UPDATE safe to call repeatedly
// without ever creating a second row for the same pair. Partial update:
// omitting one field keeps its current (or default) value rather than
// clobbering it — mirrors lib/salesLeads.ts's updateSalesLeadAssignment for
// the same reason (the UI saves status and notes independently, on
// different interactions).
//
// FIX (Bug Audit 4, 2569-09-02): the INSERT now SELECTs its values FROM
// hunter_leads with the exact same predicate listHunterLeadsForHunter's
// admin half uses (sent AND assigned to this Hunter), so the write side
// can no longer reach a lead the read side wouldn't show — previously the
// route only checked hunter_sent_at, so any Hunter could write a private
// status onto another Hunter's lead by id. Zero matching rows -> nothing
// inserted -> returns null, which the route maps to a 404.
export async function upsertHunterLeadPipeline(
hunterUserId: string,
hunterLeadId: string,
update: { status?: HunterPipelineStatus; notes?: string }
): Promise<{ status: HunterPipelineStatus; notes: string; status_changed_at: string } | null> {
// On first INSERT (no row yet for this Hunter+lead pair), the column's
// table-level DEFAULT now() covers status_changed_at — this is genuinely
// the first time THIS Hunter has ever set a status on this lead. On the
// ON CONFLICT branch, same rule as updateHunterSelfLead above: only bump
// when an incoming status is present and actually differs from the
// existing one, so a notes-only save never moves the date.
const [row] = (await sql`
INSERT INTO hunter_lead_pipeline (hunter_user_id, hunter_lead_id, status, notes)
SELECT ${hunterUserId}::uuid, hl.id, ${update.status ?? "new"}::text, ${update.notes ?? ""}::text
FROM hunter_leads hl
WHERE hl.id = ${hunterLeadId}
AND hl.hunter_sent_at IS NOT NULL
AND hl.assigned_hunter_user_id = ${hunterUserId}
ON CONFLICT (hunter_user_id, hunter_lead_id) DO UPDATE SET
status = COALESCE(${update.status ?? null}, hunter_lead_pipeline.status),
notes = COALESCE(${update.notes ?? null}, hunter_lead_pipeline.notes),
status_changed_at = CASE
WHEN ${update.status ?? null}::text IS NOT NULL AND ${update.status ?? null}::text IS DISTINCT FROM hunter_lead_pipeline.status
THEN now() ELSE hunter_lead_pipeline.status_changed_at END,
updated_at = now()
RETURNING status, notes, status_changed_at
`) as { status: HunterPipelineStatus; notes: string; status_changed_at: string }[];
return row ?? null;
}

// Powers the "Pipeline รวม ของ Hunter" admin section — a single combined
// count per pipeline_status across EVERY Hunter's leads (both the shared
// admin-sent queue via hunter_lead_pipeline, and each Hunter's own
// self-sourced clinics via hunter_self_leads). Deliberately NOT built the
// same way listHunterLeadsForHunter is: that function scopes to one
// Hunter's own assigned/self leads with a COALESCE-to-'new' default, which
// is correct for "what does this one Hunter see" but would double/multiply
// count if summed across every Hunter.
//
// FIX (Bug Audit 4, 2569-09-02): the admin-lead half used to be a plain
// `SELECT status FROM hunter_lead_pipeline` — every private row that ever
// existed, regardless of whether its lead is still sent or still assigned
// to that Hunter. That drifted from what Hunters actually see in two ways:
// (a) a lead that was "ยกเลิกส่ง"/re-sent to someone else (or un-sent by
// deactivating its Hunter — see lib/hunterUsers.ts:setHunterUserActive)
// left a stale row still counted under the old Hunter's status, and (b)
// sent leads the assignee hadn't touched yet have NO row at all, so they
// were invisible here even though every Hunter's board shows them under
// "ส่งมาแล้ว". Now: one row per currently-sent admin lead, joined to its
// assignee's private row with the same COALESCE-to-'new' the Hunter's own
// board uses (so untouched leads count as 'new'), and stale rows for other
// Hunters are ignored. The self-leads half is unchanged — those are private
// by construction and each row IS the lead.
export type HunterPipelineOverview = Record<HunterPipelineStatus, number>;

export async function getHunterPipelineOverview(): Promise<HunterPipelineOverview> {
  const rows = (await sql`
    SELECT status, count(*)::int AS count FROM (
      SELECT COALESCE(hlp.status, 'new') AS status
      FROM hunter_leads hl
      LEFT JOIN hunter_lead_pipeline hlp
        ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = hl.assigned_hunter_user_id
      WHERE hl.hunter_sent_at IS NOT NULL AND hl.assigned_hunter_user_id IS NOT NULL
      UNION ALL
      SELECT pipeline_status AS status FROM hunter_self_leads
    ) combined
    GROUP BY status
  `) as { status: HunterPipelineStatus; count: number }[];

  const overview: HunterPipelineOverview = {
    new: 0,
    contacted: 0,
    interested: 0,
    closed_won: 0,
    closed_lost: 0,
    no_response: 0,
  };
  for (const r of rows) overview[r.status] = r.count;
  return overview;
}

// Powers the "Hunter — ภาพรวมและค่าคอมมิชชั่น" admin table's ปิดได้ column —
// purely descriptive context for the admin (how many clinics has this
// Hunter personally marked closed_won), NOT tied to commission at all (that
// only ever comes from businesses.referred_by_hunter_user_id + transactions,
// see lib/hunterCommission.ts) — a Hunter could mark something closed_won
// here without ever actually being the one whose referral link the clinic
// used, or vice versa.
export async function countClosedWonByHunter(hunterUserId: string): Promise<number> {
const [{ count }] = (await sql`
SELECT count(*)::int AS count
FROM hunter_lead_pipeline
WHERE hunter_user_id = ${hunterUserId} AND status = 'closed_won'
`) as { count: number }[];
return count;
}
