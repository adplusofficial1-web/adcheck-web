import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listContactsForAssociation, createMarketingContact } from "@/lib/marketingAssociations";

// GET/POST /api/admin/marketing/[id]/contacts — the "รายชื่อผู้ติดต่อ"
// list inside one association's edit panel
// (components/admin/MarketingTracker.tsx). One association can have
// several contacts (นายกสมาคม, เลขาธิการ, ประชาสัมพันธ์, ...) — see
// migrations/008_marketing_association_contacts.sql.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const contacts = await listContactsForAssociation(params.id);
    return NextResponse.json({ contacts });
  } catch (e: any) {
    console.error("GET /api/admin/marketing/[id]/contacts failed:", e);
    return NextResponse.json({ error: e?.message || "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    if (!firstName) return NextResponse.json({ error: "กรุณาระบุชื่อผู้ติดต่อ" }, { status: 400 });

    const contact = await createMarketingContact(params.id, {
      firstName,
      lastName: typeof body.lastName === "string" ? body.lastName.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      role: typeof body.role === "string" ? body.role.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/admin/marketing/[id]/contacts failed:", e);
    return NextResponse.json({ error: e?.message || "เพิ่มผู้ติดต่อไม่สำเร็จ" }, { status: 500 });
  }
}
