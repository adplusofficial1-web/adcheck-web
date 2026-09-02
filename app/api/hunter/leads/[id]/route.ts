import { NextResponse } from "next/server";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
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
// Still checked against the "ส่ง" queue below (hunter_sent_at IS NOT NULL)
// so a Hunter can't set a private status on a lead that was never actually
// sent to freelancers at all — same visibility rule GET /api/hunter/leads
// already enforces.
//
// FIX (Bug Audit 4, 2569-09-02): that check used to stop at "is it sent" —
// it never asked "is it sent to THIS Hunter". After migrations/017 made
// every sent lead belong to exactly one assignee (and GET /api/hunter/leads
// scoped its read accordingly), the write side lagged behind: any active
// Hunter who knew/guessed a lead's UUID could still create a private
// pipeline row on someone else's lead — which then inflated the admin
// Pipeline overview and the picker's load count for that Hunter. The
// ownership check now lives inside upsertHunterLeadPipeline itself
// (assigned_hunter_user_id = this Hunter), and a miss is a 404 exactly
// like a non-existent id, so the response doesn't leak whether the UUID
// exists.
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
      return NextResponse.json({
        pipelineStatus: updated.status,
        notes: updated.notes,
        statusChangedAt: updated.status_changed_at,
      });
    }

    // Returns null when the lead isn't sent-and-assigned-to-this-Hunter —
    // see the FIX note above and upsertHunterLeadPipeline's own guard.
    const updated = await upsertHunterLeadPipeline(hunterUser.id, params.id, { status, notes });
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({
      pipelineStatus: updated.status,
      notes: updated.notes,
      statusChangedAt: updated.status_changed_at,
    });
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
