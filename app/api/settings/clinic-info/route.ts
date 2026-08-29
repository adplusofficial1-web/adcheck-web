import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

const VALID_TYPES = ["clinic", "agency"];

// Mirrors the DB CHECK constraint (businesses_specialty_check, migrations/
// 004_business_specialty.sql, widened in 006_expand_business_specialty.sql
// to cover the fuller range of facility types มาตรา 38 พ.ร.บ.สถานพยาบาล
// applies to — not just the original 5 case-study verticals). Empty string
// from the settings form means "clear it" (goes to null below) — kept
// distinct from `undefined`, which means "field wasn't sent, leave
// whatever is there alone".
const VALID_SPECIALTIES = [
  "beauty", "dental", "ortho", "pharmacy", "vet", "other",
  "hospital", "general", "diet", "dermatology", "eye", "ent",
  "obgyn", "pediatrics", "fertility", "physical_therapy",
  "traditional_medicine", "rehab", "mental_health",
];

// Updates the clinic's operating details. `name` is included so the field
// can also be edited from this section, sharing the same column the
// profile-photo modal (PATCH /api/settings/profile) writes to.
//
// contact_email is intentionally NOT editable here (and never has been,
// as of Google Login): it's the business's login identity — the same
// column getCurrentBusiness() matches against session.user.email — so
// letting it be changed from a form would silently orphan the account on
// the next sign-in. Any contact_email the client sends is ignored.
export async function PATCH(req: Request) {
  const body = await req.json();
  const name: string | undefined = typeof body.name === "string" ? body.name.trim() : undefined;
  const type: string | undefined = typeof body.type === "string" ? body.type : undefined;
  const phone: string | undefined = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const licenseNumber: string | undefined =
    typeof body.license_number === "string" ? body.license_number.trim() : undefined;
  const address: string | undefined = typeof body.address === "string" ? body.address.trim() : undefined;
  // Not trimmed/lowercased on purpose — it's a fixed set of option values
  // from a <select>, not free text, so anything that isn't an exact match
  // (or the empty-string "unspecified" sentinel) is rejected outright below.
  const specialty: string | undefined = typeof body.specialty === "string" ? body.specialty : undefined;

  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "ชื่อคลินิกห้ามเว้นว่าง" }, { status: 400 });
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "ประเภทธุรกิจไม่ถูกต้อง" }, { status: 400 });
  }
  if (specialty !== undefined && specialty !== "" && !VALID_SPECIALTIES.includes(specialty)) {
    return NextResponse.json({ error: "สาขาความเชี่ยวชาญไม่ถูกต้อง" }, { status: 400 });
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // specialty needs its own CASE rather than the COALESCE(x ?? null, col)
  // pattern the other fields use above: COALESCE can't tell "field wasn't
  // sent, leave column alone" apart from "field was sent as the empty
  // string, clear the column to NULL" — both collapse to SQL NULL. The
  // CASE makes that distinction explicit using `specialtySent` instead.
  const specialtySent = specialty !== undefined;
  const specialtyValue = specialty === "" ? null : specialty ?? null;

  const [updated] = await sql`
    UPDATE businesses
    SET
      name = COALESCE(${name ?? null}, name),
      type = COALESCE(${type ?? null}, type),
      phone = COALESCE(${phone ?? null}, phone),
      license_number = COALESCE(${licenseNumber ?? null}, license_number),
      address = COALESCE(${address ?? null}, address),
      specialty = CASE WHEN ${specialtySent}::boolean THEN ${specialtyValue} ELSE specialty END,
      updated_at = now()
    WHERE id = ${business.id}
    RETURNING id, name, type, contact_email, phone, license_number, address, specialty
  `;

  return NextResponse.json({ business: updated });
}
