import { NextResponse } from "next/server";
import { getCurrentSalesUser } from "@/lib/currentSalesUser";
import { updateSalesLeadAssignment, isSalesStatus, type SalesStatus } from "@/lib/salesLeads";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

// PATCH /api/sales/leads/[id] — a sales rep updating their own status/note
// on one assigned lead (the status buttons + note field on /sales). `id`
// here is the sales_lead_assignments row id, not the hunter_leads id — the
// UI never needs to know the underlying hunter_leads id at all.
//
// Ownership is enforced inside updateSalesLeadAssignment's WHERE clause
// (sales_user_id = this rep), not a separate SELECT-then-check, so one rep
// can never edit another's assignment — a mismatched id is
// indistinguishable from a nonexistent one (both 404), which also avoids
// confirming to a rep whether some other id even exists.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const salesUser = await getCurrentSalesUser();
  if (!salesUser) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => null as any);

  let salesStatus: SalesStatus | undefined;
  if (body?.salesStatus !== undefined) {
    if (!isSalesStatus(body.salesStatus)) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    salesStatus = body.salesStatus;
  }

  let notes: string | null | undefined;
  if (body?.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "โน้ตไม่ถูกต้อง" }, { status: 400 });
    }
    notes = typeof body.notes === "string" ? stripNulBytes(body.notes) : null;
  }

  if (salesStatus === undefined && notes === undefined) {
    return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });
  }

  try {
    const updated = await updateSalesLeadAssignment(params.id, salesUser.id, {
      salesStatus,
      notes,
    });
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json({ lead: updated });
  } catch (e) {
    console.error(`PATCH /api/sales/leads/${params.id} failed:`, e);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
