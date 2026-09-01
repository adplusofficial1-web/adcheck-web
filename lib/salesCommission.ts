import { sql } from "@/lib/db";

// Sales Commission — see claude/Sales Lead Distribution - Design.md
// ("ค่าคอมมิชชั่นเซลล์") for the full writeup and
// migrations/012_sales_commissions.sql for the schema this reads/writes.
//
// Called from every place a successful payment transaction is recorded
// (app/api/billing/card/route.ts, app/api/webhooks/omise/route.ts,
// scripts/runAutoBilling.ts) — right after that transaction's INSERT
// succeeds, and only for a `status = 'สำเร็จ'` row. A no-op for any business
// that didn't sign up through a sales rep's referral link
// (businesses.referred_by_sales_user_id is NULL — see
// lib/currentBusiness.ts / lib/db.ts:createBusinessForEmail).

export const FIRST_PAYMENT_RATE = 30; // percent — this business's first-ever successful transaction
export const REPEAT_PAYMENT_RATE = 5; // percent — every payment after that, unlimited count, unlimited time

export async function recordSalesCommissionIfApplicable(
  transactionId: string,
  businessId: string,
  amountThb: number
): Promise<void> {
  const [business] = (await sql`
    SELECT referred_by_sales_user_id FROM businesses WHERE id = ${businessId}
  `) as { referred_by_sales_user_id: string | null }[];
  if (!business?.referred_by_sales_user_id) return; // not a sales-referred business — nothing to record

  const [{ count }] = (await sql`
    SELECT count(*)::int AS count FROM sales_commissions WHERE business_id = ${businessId}
  `) as { count: number }[];
  const paymentSequence = count + 1;
  const rate = paymentSequence === 1 ? FIRST_PAYMENT_RATE : REPEAT_PAYMENT_RATE;
  // Round to the nearest satang (THB has no smaller unit).
  const commissionThb = Math.round(amountThb * rate) / 100;

  await sql`
    INSERT INTO sales_commissions
      (transaction_id, business_id, sales_user_id, payment_sequence, commission_rate, amount_thb, commission_thb)
    VALUES
      (${transactionId}, ${businessId}, ${business.referred_by_sales_user_id},
       ${paymentSequence}, ${rate}, ${amountThb}, ${commissionThb})
    ON CONFLICT (transaction_id) DO NOTHING
  `;
}

// Omise Thailand's published card-transaction fee: 3.65% + 7% VAT charged
// on top of that fee (https://www.omise.co/en/pricing/thailand, checked
// 2026-09-01). Applied here so transactions.fee_thb/net_thb reflect what
// the business actually nets, instead of the amount_thb == net_thb every
// call site previously hardcoded (fee_thb was always written as a literal
// 0 — see the bug note in claude/Sales Lead Distribution - Design.md and
// the three call sites this is used from). This is an estimate to the
// nearest satang for internal reporting — Omise's own dashboard/settlement
// reports remain the authoritative source if this ever needs to reconcile
// to the exact satang.
const OMISE_CARD_FEE_RATE = 0.0365;
const VAT_RATE = 0.07;

export function calculateOmiseCardFeeThb(amountThb: number): number {
  const fee = amountThb * OMISE_CARD_FEE_RATE * (1 + VAT_RATE);
  return Math.round(fee * 100) / 100;
}
