import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { isValidUuid } from "@/lib/validation";
import { approveManualPaymentRequest, rejectManualPaymentRequest } from "@/lib/qrPayments";
import { recordHunterCommissionSafely } from "@/lib/hunterCommission";

// PATCH /api/admin/manual-payments/[id] — the approve/reject action on
// components/admin/ManualPaymentsManager.tsx. Body:
//   { action: "approve" }
//   { action: "reject", note?: string }
//
// Approve is the only path in this whole manual-QR flow that ever grants
// credits (see lib/qrPayments.ts:approveManualPaymentRequest) — everything
// up to here (app/api/checkout/qr/submit/route.ts) only ever files a
// pending request. Mirrors app/api/billing/card/route.ts's ordering:
// commission is recorded AFTER the credit grant, via the never-throwing
// wrapper, so a Hunter-commission bug can never block or undo a purchase
// that's already been confirmed and credited.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => null as any);
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "ต้องระบุ action เป็น approve หรือ reject" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      const result = await approveManualPaymentRequest(params.id, adminEmail);
      await recordHunterCommissionSafely(result.businessId, result.transactionId, result.amountThb);
      return NextResponse.json({ ok: true });
    }

    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    await rejectManualPaymentRequest(params.id, adminEmail, note);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(`PATCH /api/admin/manual-payments/${params.id} failed:`, e);
    return NextResponse.json({ error: e?.message || "ดำเนินการไม่สำเร็จ" }, { status: 400 });
  }
}
