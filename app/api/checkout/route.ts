import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Buying a package — first purchase, an upgrade, or a manual top-up mid-cycle
// — always RESETS credits_remaining to the purchased plan's monthly
// allotment (never adds on top of whatever's left) and restarts the 30-day
// billing cycle from *this* payment's timestamp via credits_reset_at.
// Buying again mid-cycle (e.g. paid on day 1, buys again on day 10) simply
// moves the next-renewal date to day 10 + 30 and resets credits again — it
// does not stack the two purchases or wait for the original cycle to run
// out. This matches how the package is sold: 30 days from whenever you
// paid, not a fixed calendar-month subscription.
//
// NOTE: there is no real payment gateway wired up yet — payment_methods
// only stores display-only mock card info (brand/last4), not a real
// Omise/Stripe/2C2P token — so this endpoint simulates a successful charge
// and issues a fake invoice number, same as it always has. Recurring
// auto-charge off a saved card (so credits_reset_at keeps renewing itself
// every 30 days without the user manually revisiting /checkout) is a
// separate follow-up once a real gateway is connected.
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

  await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number)
    VALUES (${business.id}, ${plan.id}, ${plan.price_thb}, 0, ${plan.price_thb}, ${channel}, 'สำเร็จ', ${invoiceNumber})
  `;

  await sql`
    UPDATE businesses
    SET
      plan_id = ${plan.id},
      credits_remaining = ${plan.monthly_image_credits},
      credits_reset_at = now() + interval '30 days',
      updated_at = now()
    WHERE id = ${business.id}
  `;

  return NextResponse.json({ ok: true, invoiceNumber });
}
