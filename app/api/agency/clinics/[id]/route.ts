import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner } from "@/lib/agency";

const VALID_TYPES = ["clinic", "agency"];

// Edits one child clinic's info from the agency's /agency/settings page.
// Ownership-checked via getBusinessByIdForOwner — a signed-in business can
// only touch a row that is itself or a clinic with parent_agency_id
// pointing back at it (mirrors app/api/settings/clinic-info/route.ts,
// which only ever edits the signed-in business's own row).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = await getBusinessByIdForOwner(params.id, business.id);
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
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
    WHERE id = ${target.id}
    RETURNING id, name, type, contact_email, phone, license_number, address
  `;

  return NextResponse.json({ business: updated });
}
