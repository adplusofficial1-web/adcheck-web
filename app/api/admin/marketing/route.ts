import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listMarketingAssociations, createMarketingAssociation } from "@/lib/marketingAssociations";

// GET/POST /api/admin/marketing — the association-outreach pipeline board
// at app/admin/marketing/page.tsx. Same forbidden-if-not-platform-admin
// gate as every other /api/admin/* route (see app/api/admin/credits/route.ts).
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const associations = await listMarketingAssociations();
    return NextResponse.json({ associations });
  } catch (e: any) {
    console.error("GET /api/admin/marketing failed:", e);
    return NextResponse.json({ error: e?.message || "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อสมาคม" }, { status: 400 });

    const association = await createMarketingAssociation({
      name,
      contact: typeof body.contact === "string" ? body.contact.trim() || null : null,
      phase: Number(body.phase) || 1,
      status: body.status,
      nextFollowup: typeof body.nextFollowup === "string" ? body.nextFollowup || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      createdBy: adminEmail,
    });
    return NextResponse.json({ association }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/admin/marketing failed:", e);
    return NextResponse.json({ error: e?.message || "เพิ่มสมาคมไม่สำเร็จ" }, { status: 500 });
  }
}
