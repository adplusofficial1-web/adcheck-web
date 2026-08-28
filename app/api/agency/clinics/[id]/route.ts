import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner } from "@/lib/agency";
import { isValidUuid } from "@/lib/validation";

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

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }

  const target = await getBusinessByIdForOwner(params.id, business.id);
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }

  // FIX (bug audit #13): same missing try/catch as the "add clinic" POST
  // in ../route.ts — contact_email is UNIQUE, so editing one clinic's email
  // to match another existing business's email used to surface a raw
  // Postgres error instead of a normal in-UI message.
  try {
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
  } catch (e: any) {
    if (e?.code === "23505") {
      return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น" }, { status: 409 });
    }
    console.error(`Failed to update clinic ${target.id}:`, e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

// Permanently removes a child clinic from this agency's network — the
// businesses/submissions/transactions FK constraints (ON DELETE CASCADE)
// mean this also wipes that clinic's submissions, review flags, payment
// methods, and transaction history. There's no undo, which is why the UI
// (components/agency/ClinicSettingsCard) requires an explicit second
// "ยืนยันลบคลินิก" tap before calling this.
//
// Reuses getBusinessByIdForOwner like PATCH above, but with one extra
// guard: that helper's WHERE clause resolves an id that's EITHER the
// signed-in business itself OR one of its child clinics (by design, so
// PATCH/checkout/upload can target "my own account" too) — deleting the
// signed-in business's own row here would be catastrophic, so this route
// explicitly rejects target.id === business.id even though
// getBusinessByIdForOwner would happily resolve it.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }

  const target = await getBusinessByIdForOwner(params.id, business.id);
  if (!target || target.id === business.id) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }

  await sql`DELETE FROM businesses WHERE id = ${target.id}`;

  return NextResponse.json({ ok: true });
}
