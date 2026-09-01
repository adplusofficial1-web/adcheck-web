import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listSalesUsers, createSalesUser } from "@/lib/salesLeads";
import { stripNulBytes } from "@/lib/validation";

// GET /api/admin/sales-users — plain roster list (used by the "เพิ่มเซลล์"
// section's own state on first load; the polling overview endpoint below
// is what the live monitor actually refreshes from).
// POST /api/admin/sales-users — add a sales rep (the small inline form on
// components/admin/SalesOverview.tsx). See lib/salesLeads.ts:createSalesUser
// for why this reactivates on a repeat email instead of erroring.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const salesUsers = await listSalesUsers();
    return NextResponse.json({ salesUsers });
  } catch (e) {
    console.error("GET /api/admin/sales-users failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null as any);
  const email = typeof body?.email === "string" ? stripNulBytes(body.email).trim() : "";
  const name = typeof body?.name === "string" ? stripNulBytes(body.name).trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "กรุณาระบุชื่อ" }, { status: 400 });
  }

  try {
    const salesUser = await createSalesUser(email, name);
    return NextResponse.json({ salesUser });
  } catch (e) {
    console.error("POST /api/admin/sales-users failed:", e);
    return NextResponse.json({ error: "เพิ่มเซลล์ไม่สำเร็จ" }, { status: 500 });
  }
}
