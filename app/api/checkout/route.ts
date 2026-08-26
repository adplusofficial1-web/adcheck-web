import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner } from "@/lib/agency";

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
  const { planCode, channel, businessId } = await req.json();

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // businessId lets an Agency account pay for a specific clinic it manages
  // (see app/agency/settings — "ซื้อ/เติมแพ็กเกจให้คลินิกนี้") instead of
  // always billing the signed-in account itself. getBusinessByIdForOwner
  // only resolves ids that are either the signed-in business or one of its
  // child clinics, so this can't be used to pay into (or read the plan of)
  // a business that isn't ours.
  const target = businessId ? await getBusinessByIdForOwner(businessId, business.id) : business;
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }

  const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
  if (!plan) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  const invoiceNumber = `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}`;

  await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number)
    VALUES (${target.id}, ${plan.id}, ${plan.price_thb}, 0, ${plan.price_thb}, ${channel}, 'สำเร็จ', ${invoiceNumber})
  `;

  await sql`
    UPDATE businesses
    SET
      plan_id = ${plan.id},
      credits_remaining = ${plan.monthly_image_credits},
      credits_reset_at = now() + interval '30 days',
      updated_at = now()
    WHERE id = ${target.id}
  `;

  return NextResponse.json({ ok: true, invoiceNumber });
}
