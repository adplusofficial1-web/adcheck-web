import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { isOmiseConfigured, createCustomerWithCard, chargeCustomer } from "@/lib/omise";

// Binds a card via Omise (create Customer + Card from a one-time Omise.js
// token) and immediately charges it for the selected plan — this is the
// Customer-Initiated Transaction (CIT) that establishes the recurring
// relationship. Every later month's charge is a Merchant-Initiated
// Transaction (MIT) run by scripts/runAutoBilling.ts against the same
// stored customer/card id, with no further action from the customer.
//
// Mirrors app/api/checkout/route.ts's PAYMENT_GATEWAY_ENABLED gate, but
// keyed off isOmiseConfigured() instead of a hardcoded flag — the moment
// OMISE_SECRET_KEY + NEXT_PUBLIC_OMISE_PUBLIC_KEY are set on Render, this
// route (and the checkout UI, see CheckoutForm.tsx) activate on their own,
// no further deploy needed.
export async function POST(req: Request) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isOmiseConfigured()) {
    return NextResponse.json(
      {
        error:
          "ระบบชำระเงินยังไม่เปิดให้บริการในขณะนี้ กรุณาติดต่อทีมงานเพื่อดำเนินการชำระเงินและเติมเครดิต",
      },
      { status: 503 }
    );
  }

  const { token, consent, planCode } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "ไม่พบข้อมูลบัตร กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
  // Consent is enforced server-side, not just a disabled button in the UI —
  // required for card-network MIT rules and Thai consumer-protection rules
  // around recurring billing (see the earlier conversation on this).
  if (consent !== true) {
    return NextResponse.json(
      { error: "กรุณายืนยันความยินยอมให้ตัดเงินอัตโนมัติก่อนผูกบัตร" },
      { status: 400 }
    );
  }

  const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
  if (!plan) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  let bound;
  try {
    bound = await createCustomerWithCard(token, business.contact_email ?? undefined);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "ไม่สามารถบันทึกบัตรได้ กรุณาตรวจสอบข้อมูลบัตรอีกครั้ง" },
      { status: 400 }
    );
  }

  // One saved card per business for now — replace any previous default
  // rather than accumulating unused rows every time someone re-checks out.
  await sql`UPDATE payment_methods SET is_default = false WHERE business_id = ${business.id}`;
  await sql`
    INSERT INTO payment_methods
      (business_id, brand, last4, exp_month, exp_year, is_default, omise_customer_id, omise_card_id)
    VALUES
      (${business.id}, ${bound.brand}, ${bound.last4}, ${bound.expMonth}, ${bound.expYear}, true, ${bound.omiseCustomerId}, ${bound.omiseCardId})
  `;

  const chargeResult = await chargeCustomer(bound.omiseCustomerId, bound.omiseCardId, Number(plan.price_thb), {
    description: `AdCheck ${plan.name} — ${business.name}`,
    indicator: "CIT",
    metadata: { business_id: business.id, plan_id: plan.id },
  });

  // Some Thai-issued cards require a 3-D Secure step-up on this first
  // charge. The card is already bound above, so nothing is lost if the
  // customer abandons the bank's auth page — they can just retry the
  // charge. Final confirmation (and credit-granting) happens in
  // app/api/webhooks/omise/route.ts once Omise reports the real outcome.
  if (chargeResult.pending3ds) {
    return NextResponse.json({
      ok: false,
      requires3ds: true,
      authorizeUri: chargeResult.pending3ds,
    });
  }

  if (!chargeResult.success) {
    return NextResponse.json(
      { error: chargeResult.failureMessage || "การตัดบัตรไม่สำเร็จ กรุณาตรวจสอบวงเงินหรือใช้บัตรอื่น" },
      { status: 402 }
    );
  }

  const invoiceNumber = `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}`;
  const [transaction] = (await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number, omise_charge_id)
    VALUES (${business.id}, ${plan.id}, ${plan.price_thb}, 0, ${plan.price_thb}, 'บัตรเครดิต/เดบิต', 'สำเร็จ', ${invoiceNumber}, ${chargeResult.chargeId})
    ON CONFLICT (omise_charge_id) DO NOTHING
    RETURNING id
  `) as any[];

  // ON CONFLICT DO NOTHING means a webhook retry (or a rare double-submit)
  // for the exact same charge id already recorded this — nothing left to
  // grant a second time.
  if (!transaction) {
    return NextResponse.json({ ok: true, invoiceNumber });
  }

  await sql`
    INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
    VALUES (${business.id}, ${plan.id}, ${transaction.id}, ${plan.monthly_image_credits}, ${plan.monthly_image_credits}, now(), now() + interval '30 days')
  `;

  await sql`
    UPDATE businesses
    SET plan_id = ${plan.id}, credits_reset_at = now() + interval '30 days', updated_at = now(),
        auto_renew_enabled = true, billing_retry_count = 0
    WHERE id = ${business.id}
  `;

  return NextResponse.json({ ok: true, invoiceNumber });
}
