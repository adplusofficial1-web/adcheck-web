import { NextResponse } from "next/server";
import { getCurrentSalesUser } from "@/lib/currentSalesUser";
import { getSalesLeadsForUser } from "@/lib/salesLeads";

// GET /api/sales/leads — the lead list on /sales (app/sales/page.tsx).
// Scoped entirely to the signed-in sales rep via getCurrentSalesUser() —
// there is no id/email param to pass, a rep can only ever see their own
// leads, same ownership model as the customer-facing /dashboard reading
// off getCurrentBusiness().
export async function GET() {
  const salesUser = await getCurrentSalesUser();
  if (!salesUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const leads = await getSalesLeadsForUser(salesUser.id);
    return NextResponse.json({ leads });
  } catch (e) {
    console.error("GET /api/sales/leads failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
