-- Hunter queue "ส่ง" workflow (2026-09-01): a checked lead (status='done')
-- doesn't automatically become visible to Hunter freelancers on /hunter —
-- the admin explicitly clicks "ส่ง" on the คิว Hunter row first. This column
-- tracks that: NULL = not sent yet, non-null = sent (and when).
--
-- lib/hunterLeads.ts:listHunterLeadsPublicView() (used by GET /api/hunter/leads,
-- the read-only feed on /hunter) filters on hunter_sent_at IS NOT NULL —
-- see app/api/admin/hunter/[id]/send/route.ts for the admin-side toggle.
ALTER TABLE hunter_leads ADD COLUMN hunter_sent_at timestamptz;
