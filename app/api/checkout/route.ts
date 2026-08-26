import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// No real payment gateway (Omise/Stripe/2C2P) is wired up yet —
// payment_methods only stores display-only mock card info (brand/last4),
// not a real charge token. This endpoint used to simulate a successful
// charge and grant credits regardless, which meant anyone could "buy" a
// package and get free credits without ever actually paying. Until a real
// gateway is connected, checkout must always fail here, before any
// business_packages/transactions row is written — no channel, plan, or
// business is special-cased around this.
//
// To re-enable once a gateway is connected: replace this early return with
// a real charge call, and only reach the transaction/business_packages
// INSERTs below on a confirmed successful charge.
const PAYMENT_GATEWAY_ENABLED = false;

export async function POST(req: Request) {
  const { planCode, channel } = await req.json();

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!PAYMENT_GATEWAY_ENABLED) {
    return NextResponse.json(
      {
        error:
          "ระบบชำระเงินยังไม่เปิดให้บริการในขณะนี้ กรุณาติดต่อทีมงานเพื่อดำเนินการชำระเงินและเติมเครดิต",
      },
      { status: 503 }
    );
  }

  // Always bills the signed-in business itself — there's no per-clinic
  // package any more. Buying planCode='agency' funds the shared credit
  // pool every clinic in that agency's network draws from (see
  // lib/agency.ts:hasActiveAgencyPlan and app/api/submissions/route.ts).
  const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
  if (!plan) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  const invoiceNumber = `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}`;

  const [transaction] = await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number)
    VALUES (${business.id}, ${plan.id}, ${plan.price_thb}, 0, ${plan.price_thb}, ${channel}, 'สำเร็จ', ${invoiceNumber})
    RETURNING id
  `;

  // A new, independent 30-day credit pool — added alongside any package(s)
  // already active, never replacing them.
  await sql`
    INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
    VALUES (${business.id}, ${plan.id}, ${transaction.id}, ${plan.monthly_image_credits}, ${plan.monthly_image_credits}, now(), now() + interval '30 days')
  `;

  await sql`
    UPDATE businesses
    SET plan_id = ${plan.id}, credits_reset_at = now() + interval '30 days', updated_at = now()
    WHERE id = ${business.id}
  `;

  return NextResponse.json({ ok: true, invoiceNumber });
}
