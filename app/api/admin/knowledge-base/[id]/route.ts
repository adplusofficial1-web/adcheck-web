import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getComplianceRule, updateComplianceRule, deleteComplianceRule } from "@/lib/complianceRules";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

// PATCH /api/admin/knowledge-base/[id] — edit content/title/category, or
// flip is_active (the "ปิดใช้งานชั่วคราว" toggle) / always_include.
// Partial update: only fields present in the body are changed.
//
// FIX (bug audit round 2 #4/#9): unlike every sibling admin route (GET/POST
// in ../route.ts, .../issue-reports/[id]/route.ts), this file had no
// isValidUuid check and no try/catch — a malformed id threw a raw Postgres
// "invalid input syntax for type uuid" with no catch, producing an empty,
// non-JSON response body (the same "Unexpected end of JSON input" failure
// those other routes' own comments describe fixing). Also added: NUL-byte
// stripping on content (matches the POST handler in ../route.ts) and
// explicit rejection of an empty title/content, since
// updateComplianceRule()'s COALESCE treats an empty string as a real
// (non-null) value — the edit form could silently save a blank rule with
// no error, unlike the "add new rule" form which already validates this.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const existing = await getComplianceRule(params.id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "กรุณาระบุชื่อเรื่อง" }, { status: 400 });
    }
    const content = typeof body.content === "string" ? stripNulBytes(body.content).trim() : undefined;
    if (content !== undefined && !content) {
      return NextResponse.json({ error: "กรุณาระบุเนื้อหา" }, { status: 400 });
    }

    const rule = await updateComplianceRule(params.id, {
      title,
      category: body.category !== undefined ? (body.category ? String(body.category).trim() : null) : undefined,
      content,
      alwaysInclude: typeof body.alwaysInclude === "boolean" ? body.alwaysInclude : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });
    return NextResponse.json({ rule });
  } catch (e: any) {
    console.error(`PATCH /api/admin/knowledge-base/${params.id} failed:`, e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

// DELETE /api/admin/knowledge-base/[id] — hard delete. There's no
// "referenced by past reviews" constraint on this table (unlike
// review_flags -> submissions), so this is safe to actually remove rather
// than soft-delete; use the is_active toggle via PATCH instead if the goal
// is "stop using this for new reviews but keep it around for reference".
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const existing = await getComplianceRule(params.id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    await deleteComplianceRule(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(`DELETE /api/admin/knowledge-base/${params.id} failed:`, e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
