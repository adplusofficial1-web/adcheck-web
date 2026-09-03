import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { updateHunterLeadImages, deleteHunterLead, HunterLeadBusyError } from "@/lib/hunterLeads";
import { isSafePublicHttpUrl } from "@/lib/automationCheckAd";
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
    // CHANGE (2569-09-02, Bug Audit 4): tightened from "parses as a URL".
    // `new URL("ht")` throws but `new URL("http://a")` and
    // `new URL("javascript:x")` don't — and since the UI auto-runs the
    // review the moment 3 slots are saved, a half-typed "https://scont"
    // used to be accepted as slot 3 and immediately burn credits on a
    // guaranteed-to-fail fetch. Now: http(s) only, a real-looking public
    // hostname (dot + >=2-letter TLD), and no loopback/private/link-local
    // targets — the same SSRF rule the fetch itself enforces
    // (lib/automationCheckAd.ts:isSafePublicHttpUrl), applied here at save
    // time so the admin sees the bad link right away instead of as a
    // failed run. The fetch/content-type check still happens at run time.
    for (const u of imageUrls) {
      if (!isSafePublicHttpUrl(u)) {
        return NextResponse.json(
          { error: `ลิงก์รูปไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https:// และเป็นลิงก์สาธารณะ): "${u}"` },
          { status: 400 }
        );
      }
    }

    const note = typeof body?.note === "string" ? stripNulBytes(body.note) : undefined;

    const updated = await updateHunterLeadImages(params.id, imageUrls, note);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    return NextResponse.json({ lead: updated });
  } catch (e) {
    // Mid-run edit (see lib/hunterLeads.ts:HunterLeadBusyError) — an
    // expected state, not a failure: tell the admin to wait for the run.
    if (e instanceof HunterLeadBusyError) {
      return NextResponse.json({ error: "กำลังตรวจสอบอยู่ แก้ลิงก์ได้เมื่อตรวจเสร็จ" }, { status: 409 });
    }
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
