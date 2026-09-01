import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listHunterLeads, markHunterLeadSent } from "@/lib/hunterLeads";

// POST /api/admin/hunter/send-all — "ส่งทั้งหมด" button in HunterImport.tsx
// (2569-09-01, Automatic Hunter Lead Assignment).
//
// Used to not exist at all: the client (sendAllQueued in HunterImport.tsx)
// just fired Promise.all(...) over the per-lead POST
// /api/admin/hunter/[id]/send endpoint — fine back when "ส่ง" was a plain
// shared broadcast flag, but now every "ส่ง" also picks the least-loaded
// active Hunter (lib/hunterLeads.ts:markHunterLeadSent ->
// pickHunterForAssignment). Firing every lead's pick+assign in PARALLEL
// would let them all read the same stale "who's least loaded" snapshot at
// once and could dump an entire batch onto a single Hunter instead of
// spreading it out.
//
// This route loops SEQUENTIALLY server-side instead: each iteration's
// UPDATE has already committed by the time the next iteration's pick
// query runs, so pickHunterForAssignment always sees every prior
// assignment in this same batch — a batch of N queued leads actually
// spreads across active Hunters the same way N separate "ส่ง" clicks
// would, one at a time. Computes the target list itself (every lead with
// status='done' and hunter_sent_at still NULL) rather than trusting a
// list of ids from the client, since the whole point is "ส่งทั้งหมด" means
// everything currently queued, not whatever the client's possibly-stale
// local state thinks that is.
//
// Continues past an individual lead's failure (most likely: zero active
// Hunters — see markHunterLeadSent, which throws when
// pickHunterForAssignment finds none) rather than aborting the whole
// batch, and reports both which ids actually got sent and which failed
// (with why) so the admin can see the outcome — same "report partial
// success" shape as bulkDeleteHunterLeads in lib/hunterLeads.ts.
export async function POST() {
const adminEmail = await getCurrentPlatformAdminEmail();
if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

const leads = await listHunterLeads();
const targets = leads.filter((l) => l.status === "done" && !l.hunter_sent_at);

const sent: { id: string; assigned_hunter_user_id: string | null }[] = [];
const failed: { id: string; error: string }[] = [];

for (const lead of targets) {
try {
const updated = await markHunterLeadSent(lead.id);
if (updated) {
sent.push({ id: updated.id, assigned_hunter_user_id: updated.assigned_hunter_user_id });
} else {
failed.push({ id: lead.id, error: "ส่งไม่สำเร็จ" });
}
} catch (e) {
console.error(`POST /api/admin/hunter/send-all failed for lead ${lead.id}:`, e);
failed.push({ id: lead.id, error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" });
}
}

return NextResponse.json({ sent, failed });
}
