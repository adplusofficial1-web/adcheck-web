import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getHunterLead, markHunterLeadSent, unmarkHunterLeadSent } from "@/lib/hunterLeads";
import { isValidUuid } from "@/lib/validation";

// POST /api/admin/hunter/[id]/send — the "ส่ง" button in HunterImport.tsx's
// คิว Hunter table. Marks a checked lead (status='done') as "ส่งสำเร็จ",
// which is what makes it show up on the read-only Hunter Freelancer page
// (/hunter) — see lib/hunterLeads.ts:listHunterLeadsPublicView(), which
// filters on hunter_sent_at IS NOT NULL. Nothing is sent automatically or
// as soon as a check finishes; the admin explicitly decides when a
// clinic's result is ready to hand to Hunter freelancers (confirmed with
// user 2026-09-01: "แอดมินกดปุ่ม ส่ง เอง").
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const lead = await getHunterLead(params.id);
  if (!lead) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  if (lead.status !== "done") {
    return NextResponse.json({ error: "ต้องตรวจสอบเสร็จก่อนถึงจะส่งได้" }, { status: 400 });
  }

  try {
    const updated = await markHunterLeadSent(params.id);
    if (!updated) return NextResponse.json({ error: "ส่งไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ lead: updated });
  } catch (e) {
    console.error(`POST /api/admin/hunter/${params.id}/send failed:`, e);
    return NextResponse.json({ error: "ส่งไม่สำเร็จ" }, { status: 500 });
  }
}

// DELETE /api/admin/hunter/[id]/send — "ยกเลิกส่ง": pulls a lead back out
// of the Hunter freelancer's visible list without touching the lead or its
// result itself, in case it was sent by mistake.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  try {
    const updated = await unmarkHunterLeadSent(params.id);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ lead: updated });
  } catch (e) {
    console.error(`DELETE /api/admin/hunter/${params.id}/send failed:`, e);
    return NextResponse.json({ error: "ยกเลิกการส่งไม่สำเร็จ" }, { status: 500 });
  }
}
