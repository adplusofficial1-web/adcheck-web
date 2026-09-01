import { sql } from "@/lib/db";
import type { HunterLeadPublicView, HunterLeadReviewStatus } from "@/lib/hunterLeads";

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

export type HunterPipelineLead = HunterLeadPublicView & {
  review_status: HunterLeadReviewStatus | null;
  flag_count: number | null;
  pipeline_status: HunterPipelineStatus;
  notes: string;
};

// Powers GET /api/hunter/leads: every lead this Hunter has been sent (same
// "sent" WHERE clause as the old listHunterLeadsPublicView), LEFT JOINed
// against this Hunter's own hunter_lead_pipeline row if one exists yet. A
// lead with no row here reads as the default 'new' state with empty notes
// — matches the convention sales_lead_assignments.sales_status uses (every
// freshly assigned lead starts 'new' without a separate "have you touched
// this yet" flag). Also now includes review_status/flag_count (previously
// left out of the Hunter-facing view entirely) so the Pipeline tab can show
// the same severity badge sales reps already see on their own leads.
export async function listHunterLeadsForHunter(hunterUserId: string): Promise<HunterPipelineLead[]> {
  const rows = await sql`
    SELECT
      hl.id, hl.clinic_name, hl.province, hl.source_link, hl.status, hl.result_url, hl.created_at,
      hl.review_status, hl.flag_count,
      COALESCE(hlp.status, 'new') AS pipeline_status,
      COALESCE(hlp.notes, '') AS notes
    FROM hunter_leads hl
    LEFT JOIN hunter_lead_pipeline hlp
      ON hlp.hunter_lead_id = hl.id AND hlp.hunter_user_id = ${hunterUserId}
    WHERE hl.hunter_sent_at IS NOT NULL
    ORDER BY hl.created_at DESC
  `;
  return rows as HunterPipelineLead[];
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
