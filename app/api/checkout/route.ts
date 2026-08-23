import { NextResponse } from "next/server";
import { sql, getDemoBusiness } from "@/lib/db";

export async function POST(req: Request) {
  const { planCode, channel } = await req.json();

  const business = await getDemoBusiness();
  if (!business) return NextResponse.json({ error: "no business" }, { status: 500 });

  const [plan] = (await sql`SELECT * FROM plans WHERE code = ${planCode}`) as any[];
  if (!plan) return NextResponse.json({ error: "invalid plan" }, { status: 400 });

  const invoiceNumber = `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}`;

  await sql`
    INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number)
    VALUES (${business.id}, ${plan.id}, ${plan.price_thb}, 0, ${plan.price_thb}, ${channel}, 'สำเร็จ', ${invoiceNumber})
  `;

  await sql`
    UPDATE businesses
    SET plan_id = ${plan.id}, credits_remaining = credits_remaining + ${plan.monthly_image_credits}, updated_at = now()
    WHERE id = ${business.id}
  `;

  return NextResponse.json({ ok: true, invoiceNumber });
}
