import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isOmiseConfigured, retrieveCharge } from "@/lib/omise";

// Configure this URL (https://adcheck.pro/api/webhooks/omise) in the Omise
// dashboard once the account exists — Webhooks & Notifications settings.
//
// Only needed for the 3-D Secure step-up path: a normal synchronous charge
// (the common case, and the only path scripts/runAutoBilling.ts's MIT
// charges take) is already handled inline by whoever called chargeCustomer.
// This endpoint exists purely to catch the async result when a bank
// redirected the customer to authenticate first (see authorizeUri handling
// in app/api/billing/card/route.ts).
//
// Omise webhooks are NOT HMAC-signed, so the only safe pattern is: never
// trust the POST body's amount/status/business fields directly — pull out
// just the charge id, then ask Omise's own API (with our secret key, which
// an attacker can't forge) what that charge's real status is, and act on
// THAT response. Worst case if this endpoint is hit with a bogus id, the
// retrieveCharge call 404s and nothing happens.
export async function POST(req: Request) {
  if (!isOmiseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null as any);
  const chargeId: string | undefined = body?.data?.id;
  if (!chargeId || typeof chargeId !== "string") {
    return NextResponse.json({ ok: true });
  }

  let charge: any;
  try {
    charge = await retrieveCharge(chargeId);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!(charge.status === "successful" || charge.paid)) {
    // Still pending, or ended up failed — nothing to grant. A failed 3DS
    // charge just means the customer's card stays bound but uncharged;
    // they can retry from the checkout page.
    return NextResponse.json({ ok: true });
  }

  // Idempotent by construction: idx_transactions_omise_charge_id is a
  // unique index, so whichever caller (this webhook, or the original
  // synchronous request) inserts first wins and every later attempt for the
  // same charge — a Omise webhook retry, an overlapping race — just
  // no-ops here.
  const [existing] = await sql`SELECT id FROM transactions WHERE omise_charge_id = ${charge.id}`;
  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const businessId = charge.metadata?.business_id;
  const planId = charge.metadata?.plan_id;
  if (!businessId || !planId) {
    return NextResponse.json({ ok: true });
  }

  const [plan] = (await sql`SELECT * FROM plans WHERE id = ${planId}`) as any[];
  if (!plan) {
    return NextResponse.json({ ok: true });
  }

  const invoiceNumber = `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}`;
  const [transaction] = (await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number, omise_charge_id)
    VALUES (${businessId}, ${planId}, ${plan.price_thb}, 0, ${plan.price_thb}, 'บัตรเครดิต/เดบิต', 'สำเร็จ', ${invoiceNumber}, ${charge.id})
    ON CONFLICT (omise_charge_id) DO NOTHING
    RETURNING id
  `) as any[];
  if (!transaction) {
    return NextResponse.json({ ok: true });
  }

  await sql`
    INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
    VALUES (${businessId}, ${planId}, ${transaction.id}, ${plan.monthly_image_credits}, ${plan.monthly_image_credits}, now(), now() + interval '30 days')
  `;
  await sql`
    UPDATE businesses
    SET plan_id = ${planId}, credits_reset_at = now() + interval '30 days', updated_at = now(),
        auto_renew_enabled = true, billing_retry_count = 0
    WHERE id = ${businessId}
  `;

  return NextResponse.json({ ok: true });
}
