import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { updateMarketingContact, deleteMarketingContact } from "@/lib/marketingAssociations";

// PATCH/DELETE /api/admin/marketing/[id]/contacts/[contactId] — edit or
// remove one person from an association's contact list. `id` (the
// association) isn't needed by either handler since contactId already
// uniquely identifies the row, but it's kept in the path to mirror the
// nested resource shape of the GET/POST route next to it.
export async function PATCH(req: Request, { params }: { params: { id: string; contactId: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    if (!firstName) return NextResponse.json({ error: "กรุณาระบุชื่อผู้ติดต่อ" }, { status: 400 });

    const contact = await updateMarketingContact(params.contactId, {
      firstName,
      lastName: typeof body.lastName === "string" ? body.lastName.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      role: typeof body.role === "string" ? body.role.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    });
    if (!contact) return NextResponse.json({ error: "ไม่พบผู้ติดต่อนี้" }, { status: 404 });
    return NextResponse.json({ contact });
  } catch (e: any) {
    console.error("PATCH /api/admin/marketing/[id]/contacts/[contactId] failed:", e);
    return NextResponse.json({ error: e?.message || "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; contactId: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const ok = await deleteMarketingContact(params.contactId);
    if (!ok) return NextResponse.json({ error: "ไม่พบผู้ติดต่อนี้" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/admin/marketing/[id]/contacts/[contactId] failed:", e);
    return NextResponse.json({ error: e?.message || "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
