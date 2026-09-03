import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { isValidUuid } from "@/lib/validation";
import { getManualPaymentSlip } from "@/lib/qrPayments";

// GET /api/admin/manual-payments/[id]/slip — the uploaded transfer-slip
// image/PDF for one request, served on demand rather than embedded in the
// list response (see lib/qrPayments.ts:getManualPaymentSlip) so the queue
// stays small even with several pending requests. Same
// base64-in-Postgres-to-bytes pattern as
// app/api/admin/knowledge-base/[id]/file/route.ts.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const slip = await getManualPaymentSlip(params.id);
  if (!slip) {
    return NextResponse.json({ error: "ไม่พบสลิปสำหรับรายการนี้" }, { status: 404 });
  }

  const bytes = Buffer.from(slip.slip_base64, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": slip.slip_media_type || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
