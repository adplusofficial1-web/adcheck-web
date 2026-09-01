import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { nextInvoiceNumber } from "@/lib/invoiceNumber";

// The card channel ("บัตรเครดิต/เดบิต") now has a real gateway behind it —
// see app/api/billing/card/route.ts, which tokenizes via Omise.js client-side
// and charges through lib/omise.ts. CheckoutForm.tsx routes that channel
// there instead of here, so it never reaches this handler at all.
//
// This endpoint still covers the other three channels (QR PromptPay,
// Mobile Banking, Direct Debit) which have no gateway wired up yet —
// payment_methods only stores display-only mock card info for anything
// that isn't a bound Omise card. It used to simulate a successful charge
// and grant credits regardless, which meant anyone could "buy" a package
// and get free credits without ever actually paying. Until each of those
// gets its own real integration, checkout for them must always fail here,
// before any business_packages/transactions row is written.
//
// To re-enable a given channel once its gateway is connected: branch on
// `channel` and replace this early return with a real charge call for that
// channel, reaching the transaction/business_packages INSERTs below only
// on a confirmed successful charge.
const PAYMENT_GATEWAY_ENABLED = false;

export async function POST(req: Request) {
  const { planCode, channel, termsAccepted } = await req.json();

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

  // Mirrors the same check in app/api/billing/card/route.ts — CheckoutForm.tsx's
  // checkbox (acceptance of components/DisclaimerBox.tsx) disabling the pay
  // button is only a UI nicety; a direct POST past the UI could skip it.
  // Placed after the gateway-enabled check purely to match that route's
  // ordering; once a real gateway is wired up for one of these channels
  // (see the comment on PAYMENT_GATEWAY_ENABLED above), this still runs
  // before any transaction/business_packages row is written.
  if (termsAccepted !== true) {
    return NextResponse.json(
      { error: "กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการชำระเงิน" },
      { status: 400 }
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

  // FIX (bug audit round 3): see lib/invoiceNumber.ts — a random 4-digit
  // suffix into a UNIQUE column, with no retry logic, is a real collision
  // risk at this business's transaction volume.
  const invoiceNumber = await nextInvoiceNumber();

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
