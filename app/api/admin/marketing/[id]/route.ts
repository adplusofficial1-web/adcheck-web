import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { updateMarketingAssociation, deleteMarketingAssociation } from "@/lib/marketingAssociations";

// PATCH/DELETE /api/admin/marketing/[id] — edit-panel save and delete for
// one card on the board (components/admin/MarketingTracker.tsx).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อสมาคม" }, { status: 400 });

    // FIX (bug audit round 2, low): unlike the POST handler in ../route.ts
    // (which falls back to `|| 1`), a bare Number(body.phase) here becomes
    // NaN for a missing/non-numeric phase, and updateMarketingAssociation's
    // `phase < 1 || phase > 4` guard never catches NaN (every comparison
    // against NaN is false) — only reachable via a raw API call, since the
    // UI's <select> always sends 1-4, but worth matching the POST path's
    // guard for consistency.
    const phase = Number(body.phase) || 1;
    const association = await updateMarketingAssociation(params.id, {
      name,
      contact: typeof body.contact === "string" ? body.contact.trim() || null : null,
      phase,
      status: body.status,
      nextFollowup: typeof body.nextFollowup === "string" ? body.nextFollowup || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    });
    if (!association) return NextResponse.json({ error: "ไม่พบสมาคมนี้" }, { status: 404 });
    return NextResponse.json({ association });
  } catch (e: any) {
    console.error("PATCH /api/admin/marketing/[id] failed:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const ok = await deleteMarketingAssociation(params.id);
    if (!ok) return NextResponse.json({ error: "ไม่พบสมาคมนี้" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/admin/marketing/[id] failed:", e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
