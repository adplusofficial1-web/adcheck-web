import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import {
  getHunterCommissionStats,
  getHunterCommissionLedger,
  getHunterDailyCommission,
  getHunterMonthlyCommission,
} from "@/lib/hunterCommission";
import { countClosedWonByHunter } from "@/lib/hunterPipeline";

// GET /api/hunter/commissions — everything the /hunter page's "ภาพรวม" and
// "ค่าคอมมิชชั่น & การรับเงิน" tabs need in one request: summary stats,
// the daily/monthly chart series, and the full ledger. See
// lib/hunterCommission.ts for how each figure is derived — none of this
// touches hunter_leads/hunter_lead_pipeline at all except closedWonCount,
// which is purely descriptive (see countClosedWonByHunter's own doc
// comment for why it's independent of the commission figures here).
export async function GET() {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [stats, ledger, daily, monthly, closedWonCount] = await Promise.all([
      getHunterCommissionStats(hunterUser.id),
      getHunterCommissionLedger(hunterUser.id),
      getHunterDailyCommission(hunterUser.id),
      getHunterMonthlyCommission(hunterUser.id),
      countClosedWonByHunter(hunterUser.id),
    ]);

    return NextResponse.json({
      stats: { ...stats, closedWonCount },
      ledger,
      chart: { daily, monthly },
    });
  } catch (e) {
    console.error("GET /api/hunter/commissions failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
