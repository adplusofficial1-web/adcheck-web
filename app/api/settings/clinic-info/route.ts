import { NextResponse } from "next/server";
import { sql, getDemoBusiness } from "@/lib/db";

const VALID_TYPES = ["clinic", "agency"];

// Updates the clinic's operating details. `name` is included so the field
// can also be edited from this section, sharing the same column the
// profile-photo modal (PATCH /api/settings/profile) writes to.
export async function PATCH(req: Request) {
  const body = await req.json();
  const name: string | undefined = typeof body.name === "string" ? body.name.trim() : undefined;
  const type: string | undefined = typeof body.type === "string" ? body.type : undefined;
  const contactEmail: string | undefined =
    typeof body.contact_email === "string" ? body.contact_email.trim() : undefined;
  const phone: string | undefined = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const licenseNumber: string | undefined =
    typeof body.license_number === "string" ? body.license_number.trim() : undefined;
  const address: string | undefined = typeof body.address === "string" ? body.address.trim() : undefined;

  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "ชื่อคลินิกห้ามเว้นว่าง" }, { status: 400 });
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "ประเภทธุรกิจไม่ถูกต้อง" }, { status: 400 });
  }

  const business = await getDemoBusiness();
  if (!business) {
    return NextResponse.json({ error: "demo business not found" }, { status: 500 });
  }

  const [updated] = await sql`
    UPDATE businesses
    SET
      name = COALESCE(${name ?? null}, name),
      type = COALESCE(${type ?? null}, type),
      contact_email = COALESCE(${contactEmail ?? null}, contact_email),
      phone = COALESCE(${phone ?? null}, phone),
      license_number = COALESCE(${licenseNumber ?? null}, license_number),
      address = COALESCE(${address ?? null}, address),
      updated_at = now()
    WHERE id = ${business.id}
    RETURNING id, name, type, contact_email, phone, license_number, address
  `;

  return NextResponse.json({ business: updated });
}
