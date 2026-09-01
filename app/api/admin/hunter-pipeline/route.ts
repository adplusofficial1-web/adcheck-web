import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getHunterPipelineOverview } from "@/lib/hunterPipeline";

export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const overview = await getHunterPipelineOverview();
    return NextResponse.json({ overview });
  } catch (e) {
    console.error("GET /api/admin/hunter-pipeline failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
