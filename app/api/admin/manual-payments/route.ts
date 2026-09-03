import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listPendingManualPayments, listReviewedManualPayments } from "@/lib/qrPayments";

// GET /api/admin/manual-payments — the review queue on
// app/admin/manual-payments/page.tsx: pending requests (oldest first, so
// the admin works the queue in submission order) plus a short reviewed
// history underneath, same "action + history table" shape as
// app/api/admin/credits/route.ts.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [pending, reviewed] = await Promise.all([
      listPendingManualPayments(),
      listReviewedManualPayments(),
    ]);
    return NextResponse.json({ pending, reviewed });
  } catch (e) {
    console.error("GET /api/admin/manual-payments failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
