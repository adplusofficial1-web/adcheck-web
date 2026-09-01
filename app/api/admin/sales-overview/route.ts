import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getSalesOverview, getRecentSalesActivity } from "@/lib/salesLeads";

// GET /api/admin/sales-overview — the single endpoint the Hunter page's
// "เซลล์ & การกระจาย Lead" monitor section (components/admin/SalesOverview.tsx)
// polls every 10-15s for its "realtime" view (see the design doc for why
// polling, not websockets/SSE). Bundles the per-rep queue-occupancy table
// and the recent-activity feed into one response so the client only makes
// one request per poll tick instead of two racing ones.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [overview, activity] = await Promise.all([getSalesOverview(), getRecentSalesActivity(20)]);
    return NextResponse.json({ overview, activity });
  } catch (e) {
    console.error("GET /api/admin/sales-overview failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
