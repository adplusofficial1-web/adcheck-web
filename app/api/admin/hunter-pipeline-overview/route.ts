import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getHunterPipelineTotals, listHunterPipelineOverview } from "@/lib/hunterPipeline";

// GET /api/admin/hunter-pipeline-overview — powers the "ภาพรวมสถานะ Pipeline
// ของ Hunter ทุกคน" section on /admin/marketing/hunter: combined totals across
// every Hunter plus the per-Hunter breakdown, in one response (same bundling
// reasoning as GET /api/admin/sales-overview / GET /api/admin/hunter-commissions).
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [totals, byHunter] = await Promise.all([getHunterPipelineTotals(), listHunterPipelineOverview()]);
    return NextResponse.json({ totals, byHunter });
  } catch (e) {
    console.error("GET /api/admin/hunter-pipeline-overview failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
