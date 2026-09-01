import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listHunterUsers, createHunterUser } from "@/lib/hunterUsers";
import { stripNulBytes } from "@/lib/validation";

// GET /api/admin/hunter-users — roster of Hunter freelancers, for
// components/admin/HunterUsersManager.tsx on /admin/marketing/hunter.
// POST /api/admin/hunter-users — add a Hunter freelancer (the small inline
// form in that same component). See lib/hunterUsers.ts:createHunterUser
// for why this reactivates on a repeat email instead of erroring. Mirrors
// app/api/admin/sales-users/route.ts exactly.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const hunterUsers = await listHunterUsers();
    return NextResponse.json({ hunterUsers });
  } catch (e) {
    console.error("GET /api/admin/hunter-users failed:", e);
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
    const hunterUser = await createHunterUser(email, name);
    return NextResponse.json({ hunterUser });
  } catch (e) {
    console.error("POST /api/admin/hunter-users failed:", e);
    return NextResponse.json({ error: "เพิ่ม Hunter ไม่สำเร็จ" }, { status: 500 });
  }
}
