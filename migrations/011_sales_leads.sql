-- Sales Lead Distribution (Admin > Marketing > Hunter -> per-sales-rep
-- queues) — see claude/Sales Lead Distribution - Design.md (project docs)
-- for the full feature writeup this migration implements.
--
-- Three pieces:
--   1. hunter_leads gets two new columns so a completed lead's AI review
--      OUTCOME (not just that it has a result_url) is queryable — the
--      sales pool needs to filter to only leads that actually found a
--      compliance problem (caution/violation), never a clean 'passed' lead.
--   2. sales_users — the whitelist of Google accounts allowed into the new
--      /sales area. Deliberately a DB table, not an env var allowlist like
--      ADMIN_EMAILS (lib/platformAdmin.ts) — the sales roster is expected
--      to change far more often than the small, rarely-changing platform
--      admin list, so it needs to be editable from the admin UI, not a
--      Render env var + redeploy.
--   3. sales_lead_assignments — the actual "lead X belongs to sales rep Y"
--      mapping, one row per lead ever handed out. hunter_lead_id is UNIQUE
--      so a lead can only ever be assigned once, permanently, to whichever
--      sales rep the daily distribution job (scripts/salesLeadDistributionJob.ts)
--      gave it to first — this is what makes the distribution query safe to
--      run repeatedly without double-assigning the same lead.

-- A completed Hunter lead's overall AI review outcome and how many
-- individual flags it triggered. Filled in at the same two places that
-- already call markHunterLeadDone (scripts/hunterAutoFillJob.ts and
-- app/api/admin/hunter/[id]/run/route.ts) — see lib/hunterLeads.ts. Left
-- NULL for any lead completed before this migration (or never completed at
-- all); the sales distribution pool query only ever selects rows where
-- review_status IS NOT NULL, so old/incomplete rows are simply invisible
-- to it rather than needing a backfill.
ALTER TABLE hunter_leads
  ADD COLUMN IF NOT EXISTS review_status TEXT
    CHECK (review_status IN ('passed', 'caution', 'violation')),
  ADD COLUMN IF NOT EXISTS flag_count INT;

-- Sales reps — added/deactivated by a platform admin from the new "เซลล์ &
-- การกระจาย Lead" section on the Hunter page (components/admin/SalesOverview.tsx),
-- never self-signup. `active = false` is a soft-disable (keeps their
-- history/assignments intact) rather than deleting the row — matches
-- hunter_leads' own "never lose history" spirit, and lets the distribution
-- job simply skip inactive reps without touching what they already have.
CREATE TABLE IF NOT EXISTS sales_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per lead ever handed to a sales rep. hunter_lead_id is UNIQUE —
-- once a lead is assigned it belongs to that rep permanently, which is
-- exactly what lets scripts/salesLeadDistributionJob.ts's pool query
-- ("hunter_leads with no matching sales_lead_assignments row yet") stay
-- correct without any extra locking: a lead already picked up by one rep
-- can never be picked up again by another rep's turn in the same run.
CREATE TABLE IF NOT EXISTS sales_lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_lead_id UUID NOT NULL UNIQUE REFERENCES hunter_leads(id),
  sales_user_id UUID NOT NULL REFERENCES sales_users(id),
  -- Sales-side status the rep updates themselves from /sales — separate
  -- from hunter_leads.status (that one is about the Hunter/AI review
  -- pipeline, this one is about the human sales process on top of it).
  sales_status TEXT NOT NULL DEFAULT 'new'
    CHECK (sales_status IN ('new', 'contacted', 'interested', 'closed_won', 'closed_lost', 'no_response')),
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL until the rep changes sales_status away from the 'new' default —
  -- lets the Hunter-page activity feed (GET /api/admin/sales-overview)
  -- show only *actual* status changes ("เซลล์ A เปลี่ยน ... เมื่อ ...")
  -- rather than every freshly-assigned lead looking like recent activity.
  status_updated_at TIMESTAMPTZ
);

-- Powers both the daily distribution job's "how many open leads does this
-- rep already have" count (needed = 10 - openCount) and the /sales page's
-- own lead list query.
CREATE INDEX IF NOT EXISTS idx_sales_assignments_user_status
  ON sales_lead_assignments (sales_user_id, sales_status);

-- Powers the pool query's "leads not yet assigned to anyone" anti-join and
-- the Hunter-page activity feed's recency ordering.
CREATE INDEX IF NOT EXISTS idx_sales_assignments_status_updated
  ON sales_lead_assignments (status_updated_at DESC);
