import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { markHunterCommissionPaid, voidHunterCommission } from "@/lib/hunterCommission";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

// PATCH /api/admin/hunter-commissions/[id] — the per-row actions in the
// admin payout queue (components/admin/HunterCommissionPayoutQueue.tsx).
// `id` is a hunter_commissions row id. Body:
//   (empty) or { action: "paid" }       — "ทำเครื่องหมายว่าจ่ายแล้ว":
//                                         pending -> paid. No "undo" from
//                                         here by design, matching how a
//                                         real bank transfer isn't undone by
//                                         clicking a button after the fact.
//   { action: "void", reason?: string } — Bug Audit 4 (2569-09-02):
//                                         "ยกเลิก (refund)": pending -> void,
//                                         for a refunded/mistaken row. Also
//                                         irreversible from the UI. See
//                                         lib/hunterCommission.ts:voidHunterCommission.
// Both only ever move a 'pending' row (see the WHERE clauses in
// lib/hunterCommission.ts); anything else is reported as 404 "หรือดำเนินการไปแล้ว".
const VOID_REASON_MAX = 500;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  // The original mark-paid client sent no body at all — keep that working
  // by treating "no/unparseable body" as the paid action.
  const body = await req.json().catch(() => null as any);
  const action = typeof body?.action === "string" ? body.action : "paid";
  if (action !== "paid" && action !== "void") {
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    if (action === "void") {
      const reason = typeof body?.reason === "string" ? stripNulBytes(body.reason).trim().slice(0, VOID_REASON_MAX) : "";
      const voided = await voidHunterCommission(params.id, reason);
      if (!voided) {
        return NextResponse.json({ error: "ไม่พบรายการนี้ หรือดำเนินการไปแล้ว" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const updated = await markHunterCommissionPaid(params.id);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้ หรือดำเนินการไปแล้ว" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`PATCH /api/admin/hunter-commissions/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
