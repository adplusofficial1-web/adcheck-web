—ส่ง—เพิ่มปุ่มที่สามารถเพิ่มคลินิกที่หามาเองได้ลงใน———————————รวมของ———ภาพรวมและค่าคอมมิชชั่นปิดได้——import { sql } from "@/lib/db";
import type { HunterLeadReviewStatus } from "@/lib/hunterLeads";

// A Hunter's own PRIVATE working status + notes per clinic — see
// migrations/014_hunter_referral_commissions.sql for why this can't live on
// hunter_leads itself (every active Hunter sees the same shared "ส่ง" queue;
// multiple Hunters can independently work the same clinic, each with their
// own status/notes, and only whichever one's referral link the clinic
// actually signs up through gets paid — see lib/hunterCommission.ts, which
// is entirely independent of this table).

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
  notes: string;
  source: "admin" | "self";
};

// Powers GET /api/hunter/leads: every lead this Hunter has been sent (same
// "sent" WHERE clause as the old listHunterLeadsPublicView), LEFT JOINed
// against this Hunter's own hunter_lead_pipeline row if one exists yet, PLUS
// every clinic this Hunter has added themselves (hunter_self_leads — see
// migrations/016_hunter_self_leads.sql). A sent lead with no
// hunter_lead_pipeline row yet reads as the default 'new' state with empty
// notes — matches the convention sales_lead_assignments.sales_status uses
// (every freshly assigned lead starts 'new' without a separate "have you
// touched this yet" flag). Also includes review_status/flag_count for admin
// leads (always null for self-sourced ones, since those never go through an
// AI check) so the Pipeline tab can show the same severity badge sales reps
// already see on their own leads. The two queries are combined in JS rather
// than a SQL UNION since they read from unrelated tables with a genuinely
// different shape (self leads own their pipeline_status/notes directly;
// admin leads get theirs via the LEFT JOIN) — simpler than forcing both
// through one UNION-compatible column list.
export async function listHunterLeadsForHunter(hunterUserId: string): Promise<HunterPipelineLead[]> {
  const adminRows = (await sql`
    SELECT
      hl.id, hl.clinic_name, hl.province, hl.source_link, hl.result_url, hl.created_at,
      hl.review_status, hl.flag_count,
      COALESCE(hlp.status, 'new') AS pipeline_status,
      COALESCE(hlp.notes, '') AS notes,
      'admin' AS source
    FROM hunter_leads hl
    LEFT JOIN hunter_lead_pipeline hlp
      ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = ${hunterUserId}
    WHERE hl.hunter_sent_at IS NOT NULL
  `) as HunterPipelineLead[];

  const selfRows = (await sql`
    SELECT
      id, clinic_name, province, source_link, created_at,
      NULL::text AS result_url, NULL::text AS review_status, NULL::int AS flag_count,
      pipeline_status, notes,
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
    RETURNING id, clinic_name, province, source_link, created_at, pipeline_status, notes
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
// its id (unlike admin leads, which every active Hunter can see and
// privately work — self leads are exclusive to whoever added them).
export async function updateHunterSelfLead(
  hunterUserId: string,
  id: string,
  update: { status?: HunterPipelineStatus; notes?: string }
): Promise<{ status: HunterPipelineStatus; notes: string } | null> {
  const [row] = (await sql`
    UPDATE hunter_self_leads SET
      pipeline_status = COALESCE(${update.status ?? null}, pipeline_status),
      notes = COALESCE(${update.notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id} AND hunter_user_id = ${hunterUserId}
    RETURNING pipeline_status AS status, notes
  `) as { status: HunterPipelineStatus; notes: string }[];
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
export async function upsertHunterLeadPipeline(
  hunterUserId: string,
  hunterLeadId: string,
  update: { status?: HunterPipelineStatus; notes?: string }
): Promise<{ status: HunterPipelineStatus; notes: string } | null> {
  const [row] = (await sql`
    INSERT INTO hunter_lead_pipeline (hunter_user_id, hunter_lead_id, status, notes)
    VALUES (${hunterUserId}, ${hunterLeadId}, ${update.status ?? "new"}, ${update.notes ?? ""})
    ON CONFLICT (hunter_user_id, hunter_lead_id) DO UPDATE SET
      status = COALESCE(${update.status ?? null}, hunter_lead_pipeline.status),
      notes = COALESCE(${update.notes ?? null}, hunter_lead_pipeline.notes),
      updated_at = now()
    RETURNING status, notes
  `) as { status: HunterPipelineStatus; notes: string }[];
  return row ?? null;
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
