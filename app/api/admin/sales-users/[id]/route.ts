import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { setSalesUserActive } from "@/lib/salesLeads";
import { isValidUuid } from "@/lib/validation";

// PATCH /api/admin/sales-users/[id] — the per-row enable/disable toggle on
// components/admin/SalesOverview.tsx. Only ever flips `active`; a sales
// rep's own name/email are not editable here (re-add via POST
// /api/admin/sales-users with the same email to rename — see
// createSalesUser's ON CONFLICT DO UPDATE).
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
    const salesUser = await setSalesUserActive(params.id, body.active);
    if (!salesUser) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ salesUser });
  } catch (e) {
    console.error(`PATCH /api/admin/sales-users/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
