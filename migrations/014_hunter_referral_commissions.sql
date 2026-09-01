-- Hunter Referral Commission + private Pipeline (2569-09-01) — see project
-- doc "Sales Lead Distribution - Design.md" for the sales-side design this
-- mirrors, and the conversation this migration comes from for why Hunter's
-- version differs: hunter_leads (migrations/009_hunter_queue.sql) has NO
-- per-Hunter ownership — every active Hunter freelancer sees the SAME
-- "ส่ง" queue (listHunterLeadsPublicView), unlike sales_lead_assignments
-- which the daily distribution cron hands out one-to-one. So attribution
-- here can't be "whoever the lead was assigned to" — it has to be
-- "whichever Hunter's own referral link the clinic actually signed up
-- through" (see businesses.referred_by_hunter_user_id below), and the
-- working-status a Hunter tracks per clinic (contacted/interested/etc.)
-- has to be a PRIVATE per-Hunter table, not a column on the shared
-- hunter_leads row — confirmed with the user: multiple Hunters can see and
-- work the same sent clinic independently, each with their own private
-- notes/status, and only the one whose referral link the clinic actually
-- used gets paid.

-- Set once, permanently, the first time a Google account ever becomes a
-- business (see lib/currentBusiness.ts / lib/db.ts:createBusinessForEmail)
-- — never re-attributed later, even if this Hunter is deactivated
-- afterward (same reasoning the Sales design doc gives for its own
-- still-unbuilt sales_users equivalent: commission keeps calculating on
-- history regardless of current roster status).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referred_by_hunter_user_id UUID REFERENCES hunter_users(id);

-- One row per successful payment that a referred business makes, while
-- referred_by_hunter_user_id is set. Rates mirror the Sales design doc's
-- only settled figures (30% on a business's first-ever successful
-- transactions row, 5% on every one after that, forever, including
-- monthly auto-renewals) — see lib/hunterCommission.ts for where these
-- are applied and how to change them if Hunter's rate should ever differ
-- from Sales'.
--
-- transaction_id is UNIQUE so this is safe to call more than once for the
-- same transaction (e.g. a webhook retry racing the synchronous request
-- that already recorded it) — ON CONFLICT DO NOTHING at the call site.
CREATE TABLE IF NOT EXISTS hunter_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_user_id UUID NOT NULL REFERENCES hunter_users(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
  payment_sequence INT NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL,
  commission_thb NUMERIC(10,2) NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hunter_commissions_hunter_status
  ON hunter_commissions (hunter_user_id, payout_status);

-- A Hunter's own PRIVATE working status + notes for one hunter_leads row
-- — see the migration header above for why this can't just be a column on
-- hunter_leads itself. Lazily created on the Hunter's first status change
-- or note (see lib/hunterPipeline.ts) — a lead with no row here for a
-- given Hunter simply reads as the default 'new' state, same convention
-- sales_lead_assignments.sales_status uses for its own status enum.
-- UNIQUE(hunter_user_id, hunter_lead_id) is what makes the upsert in
-- lib/hunterPipeline.ts safe to call repeatedly without ever creating a
-- second row for the same Hunter+lead pair.
CREATE TABLE IF NOT EXISTS hunter_lead_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_user_id UUID NOT NULL REFERENCES hunter_users(id),
  hunter_lead_id UUID NOT NULL REFERENCES hunter_leads(id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'interested', 'closed_won', 'closed_lost', 'no_response')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hunter_user_id, hunter_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_hunter_lead_pipeline_hunter
  ON hunter_lead_pipeline (hunter_user_id, status);

-- Personal details + payout destination — added directly onto hunter_users
-- (a 1:1 settings form, same spirit as businesses' own contact/profile
-- columns) rather than a separate table, since every field here has
-- exactly one value per Hunter. `name` (already on hunter_users since
-- migrations/012_hunter_users.sql) doubles as the freelancer's full name;
-- everything below is new.
ALTER TABLE hunter_users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS line_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_address TEXT,
  ADD COLUMN IF NOT EXISTS payout_method TEXT CHECK (payout_method IN ('promptpay', 'bank')),
  ADD COLUMN IF NOT EXISTS payout_promptpay_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS payout_bank_account_name TEXT;
