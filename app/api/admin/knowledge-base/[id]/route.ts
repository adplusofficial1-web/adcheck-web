import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getComplianceRule, updateComplianceRule, deleteComplianceRule } from "@/lib/complianceRules";

// PATCH /api/admin/knowledge-base/[id] — edit content/title/category, or
// flip is_active (the "ปิดใช้งานชั่วคราว" toggle) / always_include.
// Partial update: only fields present in the body are changed.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await getComplianceRule(params.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const rule = await updateComplianceRule(params.id, {
    title: typeof body.title === "string" ? body.title.trim() : undefined,
    category: body.category !== undefined ? (body.category ? String(body.category).trim() : null) : undefined,
    content: typeof body.content === "string" ? body.content.trim() : undefined,
    alwaysInclude: typeof body.alwaysInclude === "boolean" ? body.alwaysInclude : undefined,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
  });
  return NextResponse.json({ rule });
}

// DELETE /api/admin/knowledge-base/[id] — hard delete. There's no
// "referenced by past reviews" constraint on this table (unlike
// review_flags -> submissions), so this is safe to actually remove rather
// than soft-delete; use the is_active toggle via PATCH instead if the goal
// is "stop using this for new reviews but keep it around for reference".
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await getComplianceRule(params.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteComplianceRule(params.id);
  return NextResponse.json({ ok: true });
}
