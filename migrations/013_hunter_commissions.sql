-- Hunter Commission (referral attribution + per-payment commission ledger)
-- — see claude/Hunter Freelancer Page - Design.md and
-- migrations/012_sales_commissions.sql for the Sales Commission feature
-- this deliberately mirrors table-for-table, column-for-column: same
-- problem (an external referrer whose personal link should earn them a
-- cut of whatever the referred clinic ever pays), same shape of solution,
-- just for Hunter freelancers instead of sales reps (user request,
-- 2026-09-01: "ระบบ เซลล์ ให้เรียกว่า Hunter และการทำงานเดียวกัน").
--
-- Two pieces:
--   1. businesses.referred_by_hunter_user_id — permanent attribution of a
--      business to the Hunter freelancer whose referral link
--      (/login?hunterRef=<id>) it signed up through. Set exactly once, at
--      business creation (lib/db.ts:createBusinessForEmail, via
--      lib/currentBusiness.ts's "hunter_ref" cookie check) — never updated
--      afterwards, even if the freelancer is later deactivated.
--   2. hunter_commissions — one row per successful transaction that has an
--      attributed Hunter freelancer, computed at insert time by
--      lib/hunterCommission.ts:recordHunterCommissionIfApplicable(). Same
--      rate as Sales Commission: 30% on a business's first-ever successful
--      transaction, 5% on every one after that — no cap on count or time.
--
-- A business can in principle carry both a sales_user_id AND a
-- hunter_user_id attribution (e.g. someone clicked both referral links
-- before signing in) — the two ledgers are independent and both would
-- record their own commission on the same transaction. Not treated as a
-- conflict to resolve here; that's a product decision for whoever reviews
-- the payout reports, not something this schema needs to prevent.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referred_by_hunter_user_id UUID REFERENCES hunter_users(id);

CREATE TABLE IF NOT EXISTS hunter_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  hunter_user_id UUID NOT NULL REFERENCES hunter_users(id),
  -- 1 = this business's first-ever successful transaction, 2/3/4/... = every
  -- one after that — determines commission_rate (see lib/hunterCommission.ts).
  -- Stored rather than recomputed later so a freelancer's historical
  -- commission never shifts if an earlier transaction were ever deleted.
  payment_sequence INT NOT NULL,
  commission_rate NUMERIC NOT NULL, -- 30.00 or 5.00 (percent)
  amount_thb NUMERIC NOT NULL, -- = transactions.amount_thb at the time this was computed
  commission_thb NUMERIC NOT NULL, -- amount_thb * commission_rate / 100
  payout_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payout_status IN ('unpaid', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hunter_commissions_hunter_user
  ON hunter_commissions (hunter_user_id, payout_status);
CREATE INDEX IF NOT EXISTS idx_hunter_commissions_business
  ON hunter_commissions (business_id);
