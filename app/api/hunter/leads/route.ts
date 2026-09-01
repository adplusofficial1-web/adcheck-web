import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { listHunterLeadsForHunter, createHunterSelfLead } from "@/lib/hunterPipeline";
import { stripNulBytes } from "@/lib/validation";

// GET /api/hunter/leads — the read-only feed for the Hunter Freelancer
// Page's Pipeline tab (/hunter, components/hunter/HunterPipelineTab.tsx).
// Gated by lib/currentHunterUser.ts (an active hunter_users row), not
// getCurrentPlatformAdminEmail — this is a deliberately separate,
// narrower audience from GET /api/admin/hunter (the full admin queue
// with edit/delete/run controls). Everyone hunting still sees the same
// shared list of sent clinics (Hunter leads aren't assigned to
// individual people the way sales leads are) — but each row now also
// carries THIS Hunter's own private pipeline_status/notes (see
// lib/hunterPipeline.ts:listHunterLeadsForHunter and
// migrations/014_hunter_referral_commissions.sql for why that's a
// separate per-Hunter table rather than a shared column on hunter_leads).
//
// CHANGE (Hunter Referral Commission, 2569-09-01): switched from
// lib/hunterLeads.ts's listHunterLeadsPublicView() (no per-Hunter status)
// to listHunterLeadsForHunter(hunterUser.id), which LEFT JOINs
// hunter_lead_pipeline for this Hunter and also includes
// review_status/flag_count so the Pipeline tab can show the same
// severity badge sales reps already see.
export async function GET() {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const leads = await listHunterLeadsForHunter(hunterUser.id);
    return NextResponse.json({ leads });
  } catch (e) {
    console.error("GET /api/hunter/leads failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/hunter/leads — a Hunter adding a clinic they found on their
// own into their private Pipeline (per user request, 2569-09-01, "เพิ่มปุ่ม
// ที่สามารถเพิ่มคลินิกที่หามาเองได้ ลงใน pipeline"). Deliberately separate
// from the admin's Excel-import flow (lib/hunterLeads.ts:importHunterLeads)
// — this never touches hunter_leads at all, only this Hunter's own
// hunter_self_leads row (see migrations/016_hunter_self_leads.sql and
// lib/hunterPipeline.ts:createHunterSelfLead for why).
export async function POST(req: Request) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null as any);
  const clinicName = typeof body?.clinicName === "string" ? stripNulBytes(body.clinicName).trim() : "";
  if (!clinicName) {
    return NextResponse.json({ error: "กรุณาระบุชื่อคลินิก" }, { status: 400 });
  }
  const province =
    typeof body?.province === "string" ? stripNulBytes(body.province).trim() || undefined : undefined;
  const sourceLink =
    typeof body?.sourceLink === "string" ? stripNulBytes(body.sourceLink).trim() || undefined : undefined;

  try {
    const lead = await createHunterSelfLead(hunterUser.id, { clinicName, province, sourceLink });
    return NextResponse.json({ lead });
  } catch (e) {
    console.error("POST /api/hunter/leads failed:", e);
    return NextResponse.json({ error: "เพิ่มคลินิกไม่สำเร็จ" }, { status: 500 });
  }
}
