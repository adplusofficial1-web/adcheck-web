-- Hunter Lead Referral Attribution (2569-09-05) — per user request "ถ้ามี
-- เข้าสู่ระบบ จาก referral อยากให้ Hunter มีโชว์ว่า ลูกค้ากำลังใช้งาน และ
-- จำนวนครั้งที่ใช้ไป แล้วย้าย Pipeline ให้อัตโนมัติ".
--
-- businesses.referred_by_hunter_user_id (migrations/014) already says WHICH
-- HUNTER a signup traces back to, but a single Hunter can have many
-- hunter_leads cards on their Pipeline board at once — that column alone
-- can't say WHICH card the signup belongs to, which is required to know
-- which specific lead card to show "กำลังใช้งาน" on and which specific
-- hunter_lead_pipeline row to auto-advance. Set once, permanently, the same
-- moment (and by the same lazy-create call) referred_by_hunter_user_id is —
-- see lib/currentBusiness.ts / lib/db.ts:createBusinessForEmail — never
-- re-attributed later, same "set once" contract as that column.
--
-- References hunter_leads (the admin-sent queue) only, never
-- hunter_self_leads — a self-sourced lead has no result_url, so
-- components/hunter/HunterPipelineTab.tsx's outreach-message button (the
-- only place a referral link with a lead id embedded is ever generated)
-- never renders for one in the first place.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referred_by_hunter_lead_id UUID REFERENCES hunter_leads(id);

-- Powers the Pipeline tab's per-lead "ลูกค้ากำลังใช้งาน" lookup (LEFT JOIN
-- businesses ON referred_by_hunter_lead_id = hunter_leads.id — see
-- lib/hunterPipeline.ts:listHunterLeadsForHunter) without a full table scan.
CREATE INDEX IF NOT EXISTS idx_businesses_referred_by_hunter_lead
  ON businesses (referred_by_hunter_lead_id)
  WHERE referred_by_hunter_lead_id IS NOT NULL;
