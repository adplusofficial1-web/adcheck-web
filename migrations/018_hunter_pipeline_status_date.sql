-- Hunter Pipeline: track when a clinic's status last changed (2569-09-02,
-- per user request "ทุกครั้งที่เปลี่ยนสถานะ อยากให้กำกับวันที่ด้วย ทุกครั้งที่
-- เปลี่ยน" while looking at /hunter's Pipeline tab, followed by "เพิ่มในแต่ละ
-- คลินิก" confirming this should show on every card).
--
-- Both tables that back a Hunter's private pipeline_status already had
-- `updated_at`, but that column bumps on ANY write — including a notes-only
-- save (see lib/hunterPipeline.ts's upsertHunterLeadPipeline /
-- updateHunterSelfLead, both of which SET updated_at = now() unconditionally).
-- That makes it useless as "when did the status last change" — editing the
-- notes field would silently move the date even though the stage never
-- moved. status_changed_at is a separate column the application layer only
-- bumps when the incoming status actually differs from the current one (see
-- the corresponding lib/hunterPipeline.ts changes in this same change).
--
-- Backfill: existing rows have no real history of when their status last
-- changed (this column didn't exist before), so `updated_at` — the closest
-- available signal — is used as a one-time best-effort backfill rather than
-- defaulting every existing row to "now" (which would make every clinic
-- already in a pipeline look like it just changed today). New rows going
-- forward get the real, code-maintained value.
--
-- admin-sent leads that have never been touched by this Hunter at all still
-- have NO hunter_lead_pipeline row (see the COALESCE(hlp.status, 'new')
-- pattern in listHunterLeadsForHunter) — for those, the "ส่งมาแล้ว" column's
-- date falls back to hunter_leads.hunter_sent_at in the query itself, not
-- here (there is no row to backfill).

ALTER TABLE hunter_lead_pipeline ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
UPDATE hunter_lead_pipeline SET status_changed_at = updated_at WHERE status_changed_at IS NULL;
ALTER TABLE hunter_lead_pipeline ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE hunter_lead_pipeline ALTER COLUMN status_changed_at SET NOT NULL;

ALTER TABLE hunter_self_leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
UPDATE hunter_self_leads SET status_changed_at = updated_at WHERE status_changed_at IS NULL;
ALTER TABLE hunter_self_leads ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE hunter_self_leads ALTER COLUMN status_changed_at SET NOT NULL;
