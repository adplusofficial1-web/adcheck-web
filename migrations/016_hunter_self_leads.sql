-- Self-sourced Hunter leads (2569-09-01, per user request "เพิ่มปุ่ม ที่สามารถ
-- เพิ่มคลินิกที่หามาเองได้ ลงใน pipeline"): unlike hunter_leads (the shared
-- admin-curated queue — see migrations/009_hunter_queue.sql), a row here
-- belongs to exactly ONE Hunter and never appears anywhere else — no admin
-- review, no "ส่ง" gate, no AI ad-check. It exists purely so a Hunter can
-- track a clinic they found on their own inside their own Pipeline board,
-- alongside admin-sent leads (see listHunterLeadsForHunter in
-- lib/hunterPipeline.ts, which now merges this table in). Since a row here
-- is already 100% private to one Hunter, pipeline_status/notes live
-- directly on this table instead of a separate join table like
-- hunter_lead_pipeline (that indirection exists only because hunter_leads
-- rows are shared across every Hunter — not the case here).
CREATE TABLE IF NOT EXISTS hunter_self_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_user_id UUID NOT NULL REFERENCES hunter_users(id) ON DELETE CASCADE,
  clinic_name TEXT NOT NULL,
  province TEXT,
  source_link TEXT,
  pipeline_status TEXT NOT NULL DEFAULT 'new'
    CHECK (pipeline_status IN ('new', 'contacted', 'interested', 'closed_won', 'closed_lost', 'no_response')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hunter_self_leads_hunter
  ON hunter_self_leads (hunter_user_id, created_at DESC);
