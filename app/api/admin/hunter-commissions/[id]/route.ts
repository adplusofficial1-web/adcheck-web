import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { markHunterCommissionPaid } from "@/lib/hunterCommission";
import { isValidUuid } from "@/lib/validation";

// PATCH /api/admin/hunter-commissions/[id] — the "ทำเครื่องหมายว่าจ่ายแล้ว"
// button in the admin payout queue. `id` is a hunter_commissions row id.
// Only ever moves pending -> paid (see markHunterCommissionPaid's WHERE
// clause) — there's no "undo" from here by design, matching how a real
// bank transfer isn't undone by clicking a button after the fact; fixing a
// mistaken mark-paid is a direct DB action, not a UI affordance.
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const updated = await markHunterCommissionPaid(params.id);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้ หรือจ่ายไปแล้ว" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`PATCH /api/admin/hunter-commissions/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
