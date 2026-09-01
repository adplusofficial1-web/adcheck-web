import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { bulkDeleteHunterLeads } from "@/lib/hunterLeads";
import { isValidUuid } from "@/lib/validation";

const MAX_BULK_DELETE = 500; // same ceiling as MAX_IMPORT_ROWS in ../route.ts

// DELETE /api/admin/hunter/bulk — the checkbox multi-select "ลบที่เลือก"
// button in HunterImport.tsx (2026-09-01, per user request: "มีปุ่มติ๊กที่
// สามารถลบเป็นกลุ่มได้"). A sibling static segment of ./[id]/route.ts's
// single-id DELETE, not a replacement for it — Next.js resolves the
// static "bulk" segment ahead of the dynamic "[id]" one, so both routes
// coexist without conflict.
//
// Deletes each id individually via lib/hunterLeads.ts:bulkDeleteHunterLeads
// rather than one multi-row statement, so a lead that's already been
// assigned to a sales rep (see the FK note on deleteHunterLead) fails on
// its own instead of rolling back every other delete the admin selected —
// the response reports both which ids were deleted and which failed, with
// a reason, so the admin isn't left guessing why the count came back lower
// than expected.
export async function DELETE(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => null as any);
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids is required" }, { status: 400 });
    }
    if (ids.length > MAX_BULK_DELETE) {
      return NextResponse.json({ error: `ลบได้สูงสุด ${MAX_BULK_DELETE} รายการต่อครั้ง` }, { status: 400 });
    }

    const validIds = ids.filter((id): id is string => isValidUuid(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: "ไม่มีรายการที่ถูกต้อง" }, { status: 400 });
    }

    const { deletedIds, failed } = await bulkDeleteHunterLeads(validIds);
    return NextResponse.json({ deletedIds, failed });
  } catch (e) {
    console.error("DELETE /api/admin/hunter/bulk failed:", e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
