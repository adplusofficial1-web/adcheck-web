import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { getHunterLead, markHunterLeadSent, unmarkHunterLeadSent, NO_ACTIVE_HUNTER_MESSAGE } from "@/lib/hunterLeads";
import { isValidUuid } from "@/lib/validation";

// POST /api/admin/hunter/[id]/send — the "ส่ง" button in HunterImport.tsx's
// คิว Hunter table. Marks a checked lead (status='done') as "ส่งสำเร็จ",
// which is what makes it show up on the read-only Hunter Freelancer page
// (/hunter). Nothing is sent automatically or as soon as a check finishes;
// the admin explicitly decides when a clinic's result is ready to hand to
// Hunter freelancers (confirmed with user 2026-09-01: "แอดมินกดปุ่ม ส่ง เอง").
//
// CHANGE (2569-09-01, Automatic Hunter Lead Assignment — fixes a real bug
// reported by the site owner: the same admin-sent clinics were showing up
// for every active Hunter at once): markHunterLeadSent (lib/hunterLeads.ts)
// now also picks exactly ONE active Hunter and assigns the lead to them —
// see lib/hunterPipeline.ts:listHunterLeadsForHunter for the read-side half
// of this fix, and migrations/017_hunter_lead_assignment.sql for the
// column. That function throws a plain Error when there is no active
// Hunter at all to assign to, instead of returning null (which this route
// already treated as "ส่งไม่สำเร็จ") — caught below and surfaced as a 400
// with the thrown message so the admin sees exactly why the send didn't
// go through, rather than a generic 500.
//
// CHANGE (2569-09-02, Bug Audit 4): markHunterLeadSent's UPDATE now also
// requires hunter_sent_at IS NULL, so a second "ส่ง" on an already-sent
// lead (double-click, two admins) no longer silently REASSIGNS it to a
// different Hunter — it returns null here and the route answers 409
// "ถูกส่งไปแล้ว". The pre-checks moved inside the try/catch so a DB error
// there is a generic JSON 500, not an unhandled throw.
export async function POST(req: Request, { params }: { params: { id: string } }) {
const adminEmail = await getCurrentPlatformAdminEmail();
if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

if (!isValidUuid(params.id)) {
return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
}

try {
const lead = await getHunterLead(params.id);
if (!lead) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
if (lead.status !== "done") {
return NextResponse.json({ error: "ต้องตรวจสอบเสร็จก่อนถึงจะส่งได้" }, { status: 400 });
}
if (lead.hunter_sent_at) {
return NextResponse.json({ error: "รายการนี้ถูกส่งไปแล้ว" }, { status: 409 });
}

const updated = await markHunterLeadSent(params.id);
// null = the guarded UPDATE matched 0 rows: someone else sent it (or it
// left 'done') between the read above and the write.
if (!updated) return NextResponse.json({ error: "รายการนี้ถูกส่งไปแล้ว" }, { status: 409 });
return NextResponse.json({ lead: updated });
} catch (e) {
console.error(`POST /api/admin/hunter/${params.id}/send failed:`, e);
// No active Hunter to assign to (markHunterLeadSent's pre-check) is a
// distinct, expected failure mode worth its own clear message —
// everything else stays a generic 500 like before.
const message = e instanceof Error ? e.message : "";
if (message === NO_ACTIVE_HUNTER_MESSAGE) {
return NextResponse.json({ error: NO_ACTIVE_HUNTER_MESSAGE }, { status: 400 });
}
return NextResponse.json({ error: "ส่งไม่สำเร็จ" }, { status: 500 });
}
}

// DELETE /api/admin/hunter/[id]/send — "ยกเลิกส่ง": pulls a lead back out
// of the Hunter freelancer's visible list without touching the lead or its
// result itself, in case it was sent by mistake. Also clears
// assigned_hunter_user_id (see unmarkHunterLeadSent) so a re-send picks a
// Hunter fresh rather than reusing the old assignment.
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
