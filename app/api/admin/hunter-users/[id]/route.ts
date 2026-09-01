import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { setHunterUserActive } from "@/lib/hunterUsers";
import { isValidUuid } from "@/lib/validation";

// PATCH /api/admin/hunter-users/[id] — the per-row enable/disable toggle
// on components/admin/HunterUsersManager.tsx. Mirrors
// app/api/admin/sales-users/[id]/route.ts exactly. Only ever flips
// `active`; re-add via POST /api/admin/hunter-users with the same email to
// rename (see createHunterUser's ON CONFLICT DO UPDATE).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => null as any);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "active ต้องเป็น boolean" }, { status: 400 });
  }

  try {
    const hunterUser = await setHunterUserActive(params.id, body.active);
    if (!hunterUser) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ hunterUser });
  } catch (e) {
    console.error(`PATCH /api/admin/hunter-users/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
