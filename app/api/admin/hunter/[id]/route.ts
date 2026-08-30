import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { updateHunterLeadImages, deleteHunterLead } from "@/lib/hunterLeads";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

const MAX_IMAGE_URLS = 3; // matches the DB CHECK constraint in migrations/009_hunter_queue.sql

// PATCH /api/admin/hunter/[id] — Hunter (or an admin on their behalf)
// filling in the up-to-3 direct image URLs they found for a lead, plus an
// optional note. This is the server-side replacement for editing the
// localStorage row in place.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => null as any);
    const rawUrls: unknown = body?.imageUrls;
    if (!Array.isArray(rawUrls)) {
      return NextResponse.json({ error: "imageUrls must be an array" }, { status: 400 });
    }
    const imageUrls = rawUrls
      .map((u) => (typeof u === "string" ? stripNulBytes(u).trim() : ""))
      .filter((u) => u.length > 0);

    if (imageUrls.length > MAX_IMAGE_URLS) {
      return NextResponse.json({ error: `ใส่ลิงก์รูปได้สูงสุด ${MAX_IMAGE_URLS} รูปต่อคลินิก` }, { status: 400 });
    }
    // Basic shape check only (must at least parse as a URL) — the actual
    // fetch/content-type validation happens server-side inside
    // /api/automation/check-ad when the run route calls it, so there's no
    // reason to duplicate that stricter check here too.
    for (const u of imageUrls) {
      try {
        new URL(u);
      } catch {
        return NextResponse.json({ error: `ลิงก์รูปไม่ถูกต้อง: "${u}"` }, { status: 400 });
      }
    }

    const note = typeof body?.note === "string" ? stripNulBytes(body.note) : undefined;

    const updated = await updateHunterLeadImages(params.id, imageUrls, note);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    return NextResponse.json({ lead: updated });
  } catch (e) {
    console.error(`PATCH /api/admin/hunter/${params.id} failed:`, e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

// DELETE /api/admin/hunter/[id] — the per-row "ลบ" button in
// HunterImport.tsx, removing a lead from the queue entirely. Plain hard
// delete (see lib/hunterLeads.ts:deleteHunterLead) — a Hunter lead is a
// prospecting queue entry, not billing/audit data, so there's no soft-
// delete/undo requirement here the way there would be for a real
// submission or credit transaction.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const deleted = await deleteHunterLead(params.id);
    if (!deleted) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/admin/hunter/${params.id} failed:`, e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
