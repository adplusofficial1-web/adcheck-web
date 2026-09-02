import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { setHunterUserActive, setHunterUserAssignmentApproved } from "@/lib/hunterUsers";
import { isValidUuid } from "@/lib/validation";

// PATCH /api/admin/hunter-users/[id] — the per-row toggles on
// components/admin/HunterUsersManager.tsx. Mirrors
// app/api/admin/sales-users/[id]/route.ts. Body is ONE of:
//   { active: boolean }             — enable/disable /hunter access
//                                     (deactivating also un-sends the
//                                     Hunter's open leads, see
//                                     lib/hunterUsers.ts:setHunterUserActive)
//   { assignmentApproved: boolean } — Bug Audit 4 (2569-09-02): approve /
//                                     suspend this Hunter for admin-"ส่ง"
//                                     lead assignment, see
//                                     migrations/020_hunter_assignment_approval.sql
// Re-add via POST /api/admin/hunter-users with the same email to rename
// (see createHunterUser's ON CONFLICT DO UPDATE).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => null as any);
  const hasActive = typeof body?.active === "boolean";
  const hasApproved = typeof body?.assignmentApproved === "boolean";
  if (!hasActive && !hasApproved) {
    return NextResponse.json({ error: "ต้องระบุ active หรือ assignmentApproved เป็น boolean" }, { status: 400 });
  }

  try {
    const hunterUser = hasActive
      ? await setHunterUserActive(params.id, body.active)
      : await setHunterUserAssignmentApproved(params.id, body.assignmentApproved);
    if (!hunterUser) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ hunterUser });
  } catch (e) {
    console.error(`PATCH /api/admin/hunter-users/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
