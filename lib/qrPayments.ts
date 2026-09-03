import { sql } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/invoiceNumber";

// Manual QR PromptPay / bank-transfer checkout (2569-09-03) -- see
// migrations/022_manual_qr_payments.sql and lib/paymentMode.ts for the
// full context. Every function here talks to manual_payment_requests, the
// queue of "customer says they transferred, needs a human to confirm"
// submissions. Nothing here ever grants credits by itself except
// approveManualPaymentRequest, and that only runs from an admin action
// (app/api/admin/manual-payments/[id]/route.ts, gated on
// getCurrentPlatformAdminEmail()).

export type ManualPaymentStatus = "pending" | "approved" | "rejected";

export type ManualPaymentRequest = {
  id: string;
  business_id: string;
  business_name: string;
  business_email: string;
  plan_id: string;
  plan_name: string;
  amount_thb: string | number;
  invoice_number: string;
  slip_media_type: string;
  status: ManualPaymentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

// Reserves an invoice number the same way every other checkout path does
// (lib/invoiceNumber.ts's Postgres sequence -- unique by construction, no
// retry loop needed) at the moment the customer submits their slip, not
// when an admin later approves it, so the number shown on the "รอตรวจสอบ"
// confirmation screen is the exact one that lands on the transactions row
// once approved.
export async function createManualPaymentRequest(params: {
  businessId: string;
  planId: string;
  amountThb: number;
  slipBase64: string;
  slipMediaType: string;
}): Promise<{ id: string; invoiceNumber: string }> {
  const invoiceNumber = await nextInvoiceNumber();
  const [row] = (await sql`
    INSERT INTO manual_payment_requests
      (business_id, plan_id, amount_thb, invoice_number, slip_base64, slip_media_type)
    VALUES
      (${params.businessId}, ${params.planId}, ${params.amountThb}, ${invoiceNumber}, ${params.slipBase64}, ${params.slipMediaType})
    RETURNING id, invoice_number
  `) as any[];
  return { id: row.id, invoiceNumber: row.invoice_number };
}

// The checkout page's own "did I already submit a slip for this plan and
// I'm just waiting?" check -- shown instead of the QR/upload form again so
// a business can't accidentally file two requests for the same purchase
// (see app/checkout/page.tsx).
export async function getPendingManualPaymentForBusiness(businessId: string, planId: string) {
  const rows = await sql`
    SELECT id, invoice_number, amount_thb, created_at
    FROM manual_payment_requests
    WHERE business_id = ${businessId} AND plan_id = ${planId} AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}

// Admin review queue -- oldest first (first submitted, first checked),
// same FIFO reasoning as lib/hunterLeads.ts's queue ordering.
export async function listPendingManualPayments(): Promise<ManualPaymentRequest[]> {
  const rows = await sql`
    SELECT m.id, m.business_id, b.name AS business_name, b.contact_email AS business_email,
      m.plan_id, p.name AS plan_name, m.amount_thb, m.invoice_number, m.slip_media_type,
      m.status, m.reviewed_by, m.reviewed_at, m.review_note, m.created_at
    FROM manual_payment_requests m
    JOIN businesses b ON b.id = m.business_id
    JOIN plans p ON p.id = m.plan_id
    WHERE m.status = 'pending'
    ORDER BY m.created_at ASC
  `;
  return rows as any[];
}

// Already-reviewed requests for the history list under the queue, newest
// first -- same "history table below the action" pattern as
// lib/creditGrants.ts:listCreditGrants.
export async function listReviewedManualPayments(limit = 50): Promise<ManualPaymentRequest[]> {
  const rows = await sql`
    SELECT m.id, m.business_id, b.name AS business_name, b.contact_email AS business_email,
      m.plan_id, p.name AS plan_name, m.amount_thb, m.invoice_number, m.slip_media_type,
      m.status, m.reviewed_by, m.reviewed_at, m.review_note, m.created_at
    FROM manual_payment_requests m
    JOIN businesses b ON b.id = m.business_id
    JOIN plans p ON p.id = m.plan_id
    WHERE m.status <> 'pending'
    ORDER BY m.reviewed_at DESC
    LIMIT ${limit}
  `;
  return rows as any[];
}

// For the admin-only slip image route (app/api/admin/manual-payments/[id]/slip/route.ts)
// -- deliberately its own on-demand fetch rather than embedding the base64
// in the list queries above, so the review queue's JSON payload stays
// small even with several pending requests open at once.
export async function getManualPaymentSlip(id: string) {
  const rows = await sql`
    SELECT slip_base64, slip_media_type FROM manual_payment_requests WHERE id = ${id}
  `;
  return (rows[0] as any) ?? null;
}

// Approves a pending request: grants credits exactly the way every other
// successful checkout does (app/api/checkout/route.ts's non-card-channel
// path -- a new independent 30-day business_packages row, alongside any
// already-active package(s), never overwriting them) and marks the request
// approved, all in one statement.
//
// Same Neon-HTTP-driver constraint as lib/credits.ts:reserveCredits and
// app/api/billing/card/route.ts -- no interactive multi-statement
// transactions, so this has to be one CTE-based statement. The `req` CTE's
// `WHERE status = 'pending'` is what makes this safe to call twice (a
// double-click on "อนุมัติ", a retried request): if the request was
// already approved or rejected, every CTE below it joins against an empty
// set, nothing gets inserted/updated a second time, and `req_update`
// returns no row -- which this function treats as an error rather than a
// silent no-op, so the admin UI can tell the difference between "just
// approved" and "already handled by someone else".
export async function approveManualPaymentRequest(
  requestId: string,
  reviewedBy: string
): Promise<{ transactionId: string; businessId: string; amountThb: number }> {
  const [result] = (await sql`
    WITH req AS (
      SELECT * FROM manual_payment_requests
      WHERE id = ${requestId} AND status = 'pending'
      FOR UPDATE
    ),
    plan AS (
      SELECT pl.* FROM plans pl JOIN req ON pl.id = req.plan_id
    ),
    txn_insert AS (
      INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number)
      SELECT req.business_id, req.plan_id, req.amount_thb, 0, req.amount_thb, 'QR PromptPay (โอนเงิน)', 'สำเร็จ', req.invoice_number
      FROM req
      RETURNING id, business_id, plan_id
    ),
    pkg_insert AS (
      INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
      SELECT t.business_id, t.plan_id, t.id, plan.monthly_image_credits, plan.monthly_image_credits, now(), now() + interval '30 days'
      FROM txn_insert t, plan
      RETURNING id
    ),
    biz_update AS (
      UPDATE businesses b
      SET plan_id = plan.id, credits_reset_at = now() + interval '30 days', updated_at = now()
      FROM plan, txn_insert t
      WHERE b.id = t.business_id
      RETURNING b.id
    ),
    req_update AS (
      UPDATE manual_payment_requests m
      SET status = 'approved', transaction_id = t.id, reviewed_by = ${reviewedBy}, reviewed_at = now()
      FROM txn_insert t
      WHERE m.id = ${requestId}
      RETURNING m.id
    )
    SELECT
      (SELECT id FROM txn_insert) AS transaction_id,
      (SELECT business_id FROM txn_insert) AS business_id,
      (SELECT amount_thb FROM req) AS amount_thb,
      (SELECT id FROM req_update) AS approved
  `) as any[];

  if (!result?.approved) {
    throw new Error("ไม่พบคำขอนี้ หรือถูกตรวจสอบไปแล้ว");
  }
  return {
    transactionId: result.transaction_id,
    businessId: result.business_id,
    amountThb: Number(result.amount_thb),
  };
}

// Rejects a pending request -- no credit grant, optional note shown back
// to the business (e.g. "ยอดโอนไม่ตรง กรุณาติดต่อทีมงาน"). Same
// `WHERE status = 'pending'` double-action guard as approve above.
export async function rejectManualPaymentRequest(
  requestId: string,
  reviewedBy: string,
  note: string | null
): Promise<void> {
  const [row] = (await sql`
    UPDATE manual_payment_requests
    SET status = 'rejected', reviewed_by = ${reviewedBy}, reviewed_at = now(), review_note = ${note}
    WHERE id = ${requestId} AND status = 'pending'
    RETURNING id
  `) as any[];
  if (!row) {
    throw new Error("ไม่พบคำขอนี้ หรือถูกตรวจสอบไปแล้ว");
  }
}
