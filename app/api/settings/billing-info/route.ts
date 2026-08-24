import { NextResponse } from "next/server";
import { sql, getDemoBusiness } from "@/lib/db";

export async function PATCH(req: Request) {
  const body = await req.json();
  const billingName: string | undefined =
    typeof body.billing_name === "string" ? body.billing_name.trim() : undefined;
  const taxId: string | undefined = typeof body.tax_id === "string" ? body.tax_id.trim() : undefined;
  const billingAddress: string | undefined =
    typeof body.billing_address === "string" ? body.billing_address.trim() : undefined;

  const business = await getDemoBusiness();
  if (!business) {
    return NextResponse.json({ error: "demo business not found" }, { status: 500 });
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
}
