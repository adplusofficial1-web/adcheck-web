import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// CHANGE (multi-package credits): buying a package used to always RESET
// credits_remaining to the purchased plan's monthly allotment, overwriting
// whatever was left from a previous purchase. It now INSERTs a new row
// into business_packages instead — each purchase gets its own 30-day pool
// that stacks on top of (never replaces) whatever credits were already
// usable, per explicit direction. A business's total spendable credits is
// computed live as legacy balance + every still-active package's
// credits_remaining — see lib/db.ts:withActivePackageCredits, which every
// page already reads through (Nav, upload, the submissions credit check),
// so nothing else needed to change to show/use the combined total.
// lib/credits.ts:deductCredits is the matching read side — it spends the
// soonest-expiring package first, and only expired packages ever drop out
// of the total (no separate reset/cleanup job needed).
//
// businesses.plan_id / credits_reset_at are still updated below to the
// LATEST purchase — kept purely as a "most recent plan" cache so existing
// code that reads them directly (lib/agency.ts's hasActiveAgencyPlan /
// getPlanCycleStatus, and the plan name/price shown in the settings page
// header) keeps working unmodified. They are NOT used for credits math
// any more — business_packages is the source of truth for that.
//
// NOTE: there is no real payment gateway wired up yet — payment_methods
// only stores display-only mock card info (brand/last4), not a real
// Omise/Stripe/2C2P token — so this endpoint simulates a successful charge
// and issues a fake invoice number, same as it always has. Recurring
// auto-charge off a saved card (so a package renews itself automatically)
// is a separate follow-up once a real gateway is connected.
export async function POST(req: Request) {
  const { planCode, channel } = await req.json();

  // Always bills the signed-in business itself — there's no per-clinic
  // package any more. Buying planCode='agency' funds the shared credit
  // pool every clinic in that agency's network draws from (see
  // lib/agency.ts:hasActiveAgencyPlan and app/api/submissions/route.ts).
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
