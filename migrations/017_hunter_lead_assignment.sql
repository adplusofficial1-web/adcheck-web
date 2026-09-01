-- Automatic Hunter Lead Assignment (2569-09-01): fixes a real bug reported
-- by the site owner (screenshot of /hunter's Pipeline tab) — the SAME
-- admin-"ส่ง" clinic leads were showing up for every active Hunter at once.
-- lib/hunterPipeline.ts:listHunterLeadsForHunter() only ever filtered on
-- hunter_leads.hunter_sent_at IS NOT NULL, a single shared broadcast flag
-- with no per-Hunter scoping at all — every active Hunter saw the exact
-- same list and could independently contact the same clinic. This got
-- worse the moment Hunter signup became instant/self-serve (see the
-- project doc "Hunter Self-Serve Signup Request.md") since the roster can
-- now grow without an admin approving each person first.
--
-- Fix (confirmed with the site owner): automatic distribution — one clinic
-- lead assigned to exactly one Hunter, least-loaded Hunter first, tied
-- broken by hunter_users.created_at. Same convention the (separate,
-- not-yet-built) Sales Lead Distribution design uses — see the project doc
-- "Sales Lead Distribution - Design.md". This column records the ONE
-- Hunter a "ส่ง" lead is assigned to, picked automatically by
-- lib/hunterLeads.ts:markHunterLeadSent() at the moment admin clicks "ส่ง"
-- (app/api/admin/hunter/[id]/send/route.ts, POST). NULL = not sent / not
-- yet assigned. Cleared back to NULL by "ยกเลิกส่ง" (same route, DELETE)
-- alongside hunter_sent_at.
--
-- Does NOT touch hunter_self_leads (already private per-Hunter by
-- construction — see migrations/016_hunter_self_leads.sql) or
-- hunter_lead_pipeline (migrations/014_hunter_referral_commissions.sql) — a
-- Hunter's own private status/notes on a lead, independent of who it's
-- assigned to (used here only to compute each Hunter's OPEN load, never
-- written to).
ALTER TABLE hunter_leads
  ADD COLUMN assigned_hunter_user_id UUID REFERENCES hunter_users(id);

CREATE INDEX IF NOT EXISTS idx_hunter_leads_assigned_hunter
  ON hunter_leads (assigned_hunter_user_id);
