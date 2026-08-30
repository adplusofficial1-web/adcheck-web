import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { stripNulBytes } from "@/lib/validation";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const billingName: string | undefined =
      typeof body.billing_name === "string" ? stripNulBytes(body.billing_name).trim() : undefined;
    const taxId: string | undefined =
      typeof body.tax_id === "string" ? stripNulBytes(body.tax_id).trim() : undefined;
    const billingAddress: string | undefined =
      typeof body.billing_address === "string" ? stripNulBytes(body.billing_address).trim() : undefined;

    const business = await getCurrentBusiness();
    if (!business) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [updated] = await sql`
      UPDATE businesses
      SET
        billing_name = COALESCE(${billingName ?? null}, billing_name),
        tax_id = COALESCE(${taxId ?? null}, tax_id),
        billing_address = COALESCE(${billingAddress ?? null}, billing_address),
        updated_at = now()
      WHERE id = ${business.id}
      RETURNING id, billing_name, tax_id, billing_address
    `;

    return NextResponse.json({ business: updated });
  } catch (e: any) {
    console.error("PATCH /api/settings/billing-info failed:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
