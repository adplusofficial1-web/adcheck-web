-- Sales Commission (referral attribution + per-payment commission ledger)
-- — see claude/Sales Lead Distribution - Design.md ("ค่าคอมมิชชั่นเซลล์")
-- for the full writeup this migration implements.
--
-- Two pieces:
--   1. businesses.referred_by_sales_user_id — permanent attribution of a
--      business to the sales rep whose referral link (/login?ref=<id>) it
--      signed up through. Set exactly once, at business creation
--      (lib/db.ts:createBusinessForEmail, via lib/currentBusiness.ts's
--      "sales_ref" cookie check) — never updated afterwards, even if the
--      rep is later deactivated or the business's sales_lead_assignments
--      (a separate, per-lead concept) changes hands.
--   2. sales_commissions — one row per successful transaction that has an
--      attributed rep, computed at insert time by
--      lib/salesCommission.ts:recordSalesCommissionIfApplicable(). Rate is
--      30% on a business's first-ever successful transaction, 5% on every
--      one after that — no cap on count or time.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referred_by_sales_user_id UUID REFERENCES sales_users(id);

CREATE TABLE IF NOT EXISTS sales_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  sales_user_id UUID NOT NULL REFERENCES sales_users(id),
  -- 1 = this business's first-ever successful transaction, 2/3/4/... = every
  -- one after that — determines commission_rate (see lib/salesCommission.ts).
  -- Stored rather than recomputed later so a rep's historical commission
  -- never shifts if an earlier transaction were ever deleted.
  payment_sequence INT NOT NULL,
  commission_rate NUMERIC NOT NULL, -- 30.00 or 5.00 (percent)
  amount_thb NUMERIC NOT NULL, -- = transactions.amount_thb at the time this was computed
  commission_thb NUMERIC NOT NULL, -- amount_thb * commission_rate / 100
  payout_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payout_status IN ('unpaid', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_sales_user
  ON sales_commissions (sales_user_id, payout_status);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_business
  ON sales_commissions (business_id);
