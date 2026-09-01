import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listHunterAdminOverview, listHunterPayoutQueue } from "@/lib/hunterCommission";

// GET /api/admin/hunter-commissions — powers the "Hunter — ภาพรวมและ
// ค่าคอมมิชชั่น" section on /admin/marketing/hunter: the per-Hunter
// overview table and the full payout queue (pending + already-paid, newest
// first) in one response, same bundling reasoning as
// GET /api/admin/sales-overview.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [overview, payouts] = await Promise.all([listHunterAdminOverview(), listHunterPayoutQueue()]);
    return NextResponse.json({ overview, payouts });
  } catch (e) {
    console.error("GET /api/admin/hunter-commissions failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
