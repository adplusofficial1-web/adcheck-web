import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listHunterLeads, markHunterLeadSent, NO_ACTIVE_HUNTER_MESSAGE } from "@/lib/hunterLeads";

// Per-request batch ceiling (2569-09-02, Bug Audit 4). Each send is one
// UPDATE with an aggregate subquery over the whole assigned-lead set (see
// lib/hunterLeads.ts:markHunterLeadSent), run sequentially — a queue of
// 1000+ "รอคิว" leads in one request would risk Render's request timeout
// with the client none the wiser about how far it got. The client
// (HunterImport.tsx sendAllQueued) keeps calling this route with
// { limit } until `remaining` comes back 0, showing progress as it goes.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

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
//
// CHANGE (2569-09-02, Bug Audit 4): accepts an optional { limit } body
// (default DEFAULT_LIMIT, capped at MAX_LIMIT) and reports `remaining` —
// how many queued leads are still unsent after this batch — so the client
// can page through a large queue. The "no active Hunter" case short-
// circuits after the first failure (every later lead would fail the same
// way) and is the only error message forwarded verbatim; everything else
// is a generic Thai string, never e.message. listHunterLeads is inside the
// try/catch now too, so a DB hiccup is a 500 JSON body, not an unhandled
// throw.
export async function POST(req: Request) {
const adminEmail = await getCurrentPlatformAdminEmail();
if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

try {
const body = await req.json().catch(() => null as any);
const rawLimit = Number(body?.limit);
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;

const leads = await listHunterLeads();
const queued = leads.filter((l) => l.status === "done" && !l.hunter_sent_at);
// Oldest first so repeated batches walk the queue in a stable order.
const targets = [...queued].reverse().slice(0, limit);

const sent: { id: string; assigned_hunter_user_id: string | null }[] = [];
const failed: { id: string; error: string }[] = [];

for (const lead of targets) {
try {
const updated = await markHunterLeadSent(lead.id);
if (updated) {
sent.push({ id: updated.id, assigned_hunter_user_id: updated.assigned_hunter_user_id });
} else {
// Already sent by someone else between the list above and now, or
// no longer 'done' — nothing to do for this one.
failed.push({ id: lead.id, error: "รายการนี้ถูกส่งไปแล้วหรือยังไม่พร้อมส่ง" });
}
} catch (e) {
console.error(`POST /api/admin/hunter/send-all failed for lead ${lead.id}:`, e);
const message = e instanceof Error ? e.message : "";
if (message === NO_ACTIVE_HUNTER_MESSAGE) {
failed.push({ id: lead.id, error: NO_ACTIVE_HUNTER_MESSAGE });
break;
}
failed.push({ id: lead.id, error: "ส่งไม่สำเร็จ" });
}
}

const remaining = Math.max(0, queued.length - sent.length);
return NextResponse.json({ sent, failed, remaining });
} catch (e) {
console.error("POST /api/admin/hunter/send-all failed:", e);
return NextResponse.json({ error: "ส่งไม่สำเร็จ" }, { status: 500 });
}
}
