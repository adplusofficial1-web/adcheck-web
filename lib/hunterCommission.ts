import { sql } from "@/lib/db";

// Hunter Commission — deliberately mirrors lib/salesCommission.ts
// function-for-function (same rates, same "no-op unless attributed" shape)
// per the user's explicit request (2026-09-01: "ระบบ เซลล์ ให้เรียกว่า
// Hunter และการทำงานเดียวกัน") — see
// migrations/013_hunter_commissions.sql for the schema this reads/writes.
//
// Called from every place a successful payment transaction is recorded
// (app/api/billing/card/route.ts, app/api/webhooks/omise/route.ts,
// scripts/runAutoBilling.ts) — right after that transaction's INSERT
// succeeds, alongside (not instead of) recordSalesCommissionIfApplicable.
// A no-op for any business that didn't sign up through a Hunter
// freelancer's referral link (businesses.referred_by_hunter_user_id is
// NULL — see lib/currentBusiness.ts / lib/db.ts:createBusinessForEmail).
//
// calculateOmiseCardFeeThb (fee_thb/net_thb bookkeeping) is intentionally
// NOT duplicated here — it has nothing to do with attribution and every
// call site already imports the one copy from lib/salesCommission.ts.

export const FIRST_PAYMENT_RATE = 30; // percent — this business's first-ever successful transaction
export const REPEAT_PAYMENT_RATE = 5; // percent — every payment after that, unlimited count, unlimited time

export async function recordHunterCommissionIfApplicable(
  transactionId: string,
  businessId: string,
  amountThb: number
): Promise<void> {
  const [business] = (await sql`
    SELECT referred_by_hunter_user_id FROM businesses WHERE id = ${businessId}
  `) as { referred_by_hunter_user_id: string | null }[];
  if (!business?.referred_by_hunter_user_id) return; // not a Hunter-referred business — nothing to record

  const [{ count }] = (await sql`
    SELECT count(*)::int AS count FROM hunter_commissions WHERE business_id = ${businessId}
  `) as { count: number }[];
  const paymentSequence = count + 1;
  const rate = paymentSequence === 1 ? FIRST_PAYMENT_RATE : REPEAT_PAYMENT_RATE;
  // Round to the nearest satang (THB has no smaller unit).
  const commissionThb = Math.round(amountThb * rate) / 100;

  await sql`
    INSERT INTO hunter_commissions
      (transaction_id, business_id, hunter_user_id, payment_sequence, commission_rate, amount_thb, commission_thb)
    VALUES
      (${transactionId}, ${businessId}, ${business.referred_by_hunter_user_id},
       ${paymentSequence}, ${rate}, ${amountThb}, ${commissionThb})
    ON CONFLICT (transaction_id) DO NOTHING
  `;
}
