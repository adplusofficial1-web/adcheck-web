-- Hunter: assignment approval gate + deactivation cleanup + commission void
-- (2569-09-02, Bug Audit 4 — see the corresponding lib/hunterUsers.ts,
-- lib/hunterCommission.ts, lib/hunterPipeline.ts changes).

-- 1. assignment_approved: whether an admin has cleared this Hunter to
-- receive admin-"ส่ง" clinic leads from the automatic picker
-- (lib/hunterLeads.ts:pickHunterForAssignment). Since Hunter signup became
-- self-serve (see the project doc "Hunter Self-Serve Signup Request.md"),
-- ANY Google account can create a hunter_users row on first sign-in — and
-- until now that brand-new, unvetted row was immediately eligible to be
-- handed real clinic leads. This flag keeps self-serve sign-in instant
-- (the Hunter still gets their referral link + self-sourced Pipeline right
-- away) but makes admin-assigned leads opt-in per Hunter:
--   * lib/hunterUsers.ts:autoRegisterHunterUser inserts false
--   * lib/hunterUsers.ts:createHunterUser (admin "เพิ่ม Hunter" form) keeps
--     the default true — an admin adding someone by hand IS the approval
--   * PATCH /api/admin/hunter-users/[id] { assignmentApproved } toggles it
-- DEFAULT true so every pre-existing row (all admin-created or already
-- trusted at the time) stays approved with no manual backfill.
ALTER TABLE hunter_users
  ADD COLUMN IF NOT EXISTS assignment_approved BOOLEAN NOT NULL DEFAULT true;

-- 2. One-off backfill: before migrations/017_hunter_lead_assignment.sql,
-- "ส่ง" set hunter_sent_at with NO assignee (the lead was broadcast to every
-- Hunter). After 017, lib/hunterPipeline.ts:listHunterLeadsForHunter only
-- shows a sent lead to its assigned_hunter_user_id — so any such pre-017
-- row is sent-but-visible-to-nobody. Clearing hunter_sent_at drops them
-- back into the admin queue's "รอคิว" state so "ส่ง"/"ส่งทั้งหมด" can
-- re-assign them properly. Same statement lib/hunterUsers.ts:
-- setHunterUserActive(id, false) now runs for a deactivated Hunter's open
-- leads (see that function's comment).
UPDATE hunter_leads
SET hunter_sent_at = NULL
WHERE hunter_sent_at IS NOT NULL AND assigned_hunter_user_id IS NULL;

-- 3. hunter_commissions: a third payout_status, 'void', for a commission
-- that should never be paid (the underlying transaction was refunded, or
-- the row was recorded by mistake). Before this the only states were
-- pending/paid, so the admin's only option for a refunded payment was a
-- direct DB edit. 'void' rows stay in the table for bookkeeping but are
-- excluded from every pending/paid/total aggregate in
-- lib/hunterCommission.ts. Only reachable from 'pending' (see
-- voidHunterCommission) — a commission already paid out is money that
-- has left the building; reversing it is not a status flip.
--
-- The constraint name is Postgres's auto-generated name for the inline
-- column CHECK in migrations/014_hunter_referral_commissions.sql
-- (<table>_<column>_check); DROP IF EXISTS keeps this re-runnable.
ALTER TABLE hunter_commissions
  DROP CONSTRAINT IF EXISTS hunter_commissions_payout_status_check;
ALTER TABLE hunter_commissions
  ADD CONSTRAINT hunter_commissions_payout_status_check
  CHECK (payout_status IN ('pending', 'paid', 'void'));

ALTER TABLE hunter_commissions
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
