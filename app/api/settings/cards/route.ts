import { NextResponse } from "next/server";
import { sql, getPaymentMethods } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

const BRAND_ALLOWLIST = ["Visa", "Mastercard", "American Express", "Discover", "บัตร"];

export async function GET() {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cards = await getPaymentMethods(business.id);
  return NextResponse.json({ cards });
}

// IMPORTANT: the request body must never contain the full card number —
// only the non-sensitive metadata the client already derived from it
// (brand, last 4 digits, expiry). The full PAN is read from the form,
// used once in the browser to compute those three fields, and discarded —
// it is never sent over the network or written to the database. See
// components/settings/CardsSection.tsx for where that derivation happens.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const brand: string = typeof body.brand === "string" ? body.brand : "บัตร";
    const last4: string = typeof body.last4 === "string" ? body.last4 : "";
    const expMonth: number = Number(body.exp_month);
    const expYear: number = Number(body.exp_year);

    if (!/^\d{4}$/.test(last4)) {
      return NextResponse.json({ error: "เลขบัตร 4 หลักสุดท้ายไม่ถูกต้อง" }, { status: 400 });
    }
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
      return NextResponse.json({ error: "เดือนหมดอายุไม่ถูกต้อง" }, { status: 400 });
    }
    if (!Number.isInteger(expYear) || expYear < new Date().getUTCFullYear()) {
      return NextResponse.json({ error: "ปีหมดอายุไม่ถูกต้อง" }, { status: 400 });
    }
    const safeBrand = BRAND_ALLOWLIST.includes(brand) ? brand : "บัตร";

    const business = await getCurrentBusiness();
    if (!business) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const existing = await getPaymentMethods(business.id);
    const isFirstCard = existing.length === 0;

    const [card] = await sql`
      INSERT INTO payment_methods (business_id, brand, last4, exp_month, exp_year, is_default)
      VALUES (${business.id}, ${safeBrand}, ${last4}, ${expMonth}, ${expYear}, ${isFirstCard})
      RETURNING id, brand, last4, exp_month, exp_year, is_default
    `;

    return NextResponse.json({ card });
  } catch (e: any) {
    console.error("POST /api/settings/cards failed:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
