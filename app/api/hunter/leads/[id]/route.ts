import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { sql } from "@/lib/db";
import {
  upsertHunterLeadPipeline,
  updateHunterSelfLead,
  deleteHunterSelfLead,
  isHunterPipelineStatus,
  type HunterPipelineStatus,
} from "@/lib/hunterPipeline";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

// PATCH /api/hunter/leads/[id] — a Hunter freelancer updating their OWN
// private pipeline status/notes for one clinic (the status pills + notes
// box on /hunter's Pipeline tab). `id` here is the hunter_leads id (the
// same id GET /api/hunter/leads already returns per row) — unlike
// PATCH /api/sales/leads/[id] (which addresses a sales_lead_assignments
// row the rep already owns), there may be no hunter_lead_pipeline row yet
// for this Hunter+lead pair, so this always upserts rather than requiring
// one to already exist. See lib/hunterPipeline.ts and
// migrations/014_hunter_referral_commissions.sql.
//
// Still checked against the shared "ส่ง" queue below (hunter_sent_at IS NOT
// NULL) so a Hunter can't set a private status on a lead that was never
// actually sent to freelancers at all — same visibility rule
// GET /api/hunter/leads already enforces.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => null as any);

  let status: HunterPipelineStatus | undefined;
  if (body?.status !== undefined) {
    if (!isHunterPipelineStatus(body.status)) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    status = body.status;
  }

  let notes: string | undefined;
  if (body?.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return NextResponse.json({ error: "โน้ตไม่ถูกต้อง" }, { status: 400 });
    }
    notes = stripNulBytes(body.notes);
  }

  if (status === undefined && notes === undefined) {
    return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });
  }

  // CHANGE (2569-09-01, self-sourced leads): body.source tells us which
  // table this id actually lives in — see lib/hunterPipeline.ts's
  // HunterPipelineLead.source. Defaults to the admin path when omitted so
  // any caller written before this change keeps working unchanged.
  const isSelf = body?.source === "self";

  try {
    if (isSelf) {
      const updated = await updateHunterSelfLead(hunterUser.id, params.id, { status, notes });
      if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
      return NextResponse.json({ pipelineStatus: updated.status, notes: updated.notes });
    }

    const [sent] = await sql`
      SELECT 1 FROM hunter_leads WHERE id = ${params.id} AND hunter_sent_at IS NOT NULL
    `;
    if (!sent) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    const updated = await upsertHunterLeadPipeline(hunterUser.id, params.id, { status, notes });
    if (!updated) return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ pipelineStatus: updated.status, notes: updated.notes });
  } catch (e) {
    console.error(`PATCH /api/hunter/leads/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

// DELETE /api/hunter/leads/[id]?source=self — a Hunter removing a clinic
// THEY added themselves from their own Pipeline (per user request,
// 2569-09-01). Only ever deletes a hunter_self_leads row this Hunter owns
// — admin-sent leads (hunter_leads) are never deletable from here at all,
// hence the explicit ?source=self requirement rather than inferring it.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("source") !== "self") {
    return NextResponse.json({ error: "ลบได้เฉพาะคลินิกที่คุณเพิ่มเอง" }, { status: 400 });
  }

  try {
    const deleted = await deleteHunterSelfLead(hunterUser.id, params.id);
    if (!deleted) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/hunter/leads/${params.id} failed:`, e);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
