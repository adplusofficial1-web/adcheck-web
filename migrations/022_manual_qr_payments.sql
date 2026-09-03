-- Manual QR PromptPay / bank-transfer checkout (2569-09-03): interim
-- payment path while ADCheck's Omise merchant account is still pending
-- approval (min. ~30 days) -- see lib/paymentMode.ts. Every checkout
-- renders a dynamic PromptPay QR (lib/promptpay.ts) against AD Plus's own
-- juristic Tax ID + bank account instead of a card/Omise charge; the
-- customer transfers manually and uploads a slip image, and an AD Plus
-- admin reviews it (app/admin/manual-payments) before credits are granted.
-- Unlike a card/Omise charge (which is confirmed instantly by the gateway
-- itself), nothing here can auto-verify that money actually moved -- this
-- table is the queue of "customer says they paid, needs a human to check
-- the bank app and confirm" requests, and only an approve here ever
-- inserts into transactions/business_packages (see lib/qrPayments.ts).
CREATE TABLE manual_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  amount_thb numeric NOT NULL CHECK (amount_thb > 0),
  -- Reserved (via the same transactions_invoice_seq sequence every other
  -- checkout path uses -- see lib/invoiceNumber.ts) the moment the
  -- customer submits their slip, not when an admin approves it, so the
  -- invoice number shown to the customer on the "รอตรวจสอบ" screen is the
  -- same one that ends up on their eventual transactions row.
  invoice_number text NOT NULL UNIQUE,
  -- Stored as base64 text in this same table, same convention as
  -- compliance_rules' original-file column (see lib/complianceRules.ts) --
  -- this app has no separate blob/object storage, and slip images are
  -- small (a phone screenshot of a bank app, typically well under 1MB).
  slip_base64 text NOT NULL,
  slip_media_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Set only once approved -- the row this request's credits were actually
  -- granted through (see lib/qrPayments.ts:approveManualPaymentRequest).
  transaction_id uuid REFERENCES transactions(id),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin review queue: pending requests first, oldest first (first-come,
-- first-reviewed) -- see components/admin/ManualPaymentsManager.tsx.
CREATE INDEX idx_manual_payment_requests_status ON manual_payment_requests (status, created_at ASC);

-- A business checking its own pending/past manual-payment requests (e.g.
-- a "รอตรวจสอบ" banner on /dashboard or /settings), newest first.
CREATE INDEX idx_manual_payment_requests_business ON manual_payment_requests (business_id, created_at DESC);
