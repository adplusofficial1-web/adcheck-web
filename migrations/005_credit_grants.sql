-- Audit trail for free/promotional credits an AD Plus admin grants a
-- clinic directly (Admin > เครดิต, app/admin/credits/page.tsx) — e.g. as
-- a pilot incentive or goodwill gesture, separate from a paid package
-- purchase (business_packages) or the normal monthly credits_remaining
-- reset. Every grant here also bumps businesses.credits_remaining by the
-- same amount (see lib/creditGrants.ts:grantCredits) — this table exists
-- purely so "who got what, when, and why" isn't lost the moment that
-- happens, since a plain UPDATE to credits_remaining leaves no trace of
-- its own.
CREATE TABLE credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  reason text,
  -- Admin's email (from ADMIN_EMAILS / next-auth session), same pattern as
  -- compliance_rules.created_by in migrations/002_compliance_rules.sql.
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_grants_business ON credit_grants (business_id, created_at DESC);
