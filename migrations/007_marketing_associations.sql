-- Pipeline for AD Plus's own outreach to professional associations (ATAP,
-- Thai Association and Academy of Cosmetic Surgery and Medicine, ThPRS,
-- DST, สมาคมโรงพยาบาลเอกชน, etc.) — Admin > Marketing
-- (app/admin/marketing/page.tsx). This is AD Plus's internal growth
-- tracker for the "give free compliance content -> get member
-- distribution -> speak at their events -> formal MOU" outreach sequence,
-- entirely separate from `businesses` (which is clinic/agency customer
-- accounts). Nothing here is customer-facing.
CREATE TABLE marketing_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  -- 1=ส่งข้อมูลฟรี, 2=ลิงก์ทดลองใช้, 3=พูดในงานสมาคม, 4=MOU ส่วนลดทางการ
  phase smallint NOT NULL DEFAULT 1 CHECK (phase BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'sent', 'responded', 'meeting', 'success')),
  next_followup date,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_associations_phase ON marketing_associations (phase, next_followup);
