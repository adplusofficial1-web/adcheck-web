import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { checkAdImageUrl, CheckAdError } from "@/lib/automationCheckAd";
import {
  getHunterLead,
  markHunterLeadRunning,
  appendHunterLeadResult,
  markHunterLeadDone,
  markHunterLeadFailed,
} from "@/lib/hunterLeads";
import { isValidUuid } from "@/lib/validation";

// POST /api/admin/hunter/[id]/run — the "Marketing > Hunter" equivalent of
// clicking upload-and-wait, except it runs every image_urls entry for one
// lead through the exact same AI review as the external n8n endpoint (see
// lib/automationCheckAd.ts), sequentially, in this one request.
//
// RESUMABILITY: only images that don't already have a result are
// reviewed — result_urls is always appended to, never rebuilt from
// scratch, so re-running a lead after a partial failure (e.g. image 2 of
// 3 failed to fetch) redoes just the missing ones instead of double-
// charging credits for images that already succeeded.
//
// Deliberately synchronous (the admin waits for the response) rather than
// fire-and-forget-with-polling like app/api/submissions/route.ts — a
// Hunter lead is at most 3 images, so worst case this is 3 sequential AI
// calls, well within a normal request timeout, and it keeps this whole
// feature to one route instead of needing a second status-polling
// endpoint too.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const lead = await getHunterLead(params.id);
  if (!lead) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  if (lead.image_urls.length === 0) {
    return NextResponse.json({ error: "ยังไม่มีลิงก์รูปให้ตรวจสอบ" }, { status: 400 });
  }

  // Already has a result for every image_urls entry — nothing to do.
  // (Re-running a fully 'done' lead is a no-op rather than an error, so
  // the button can stay enabled without an admin needing to check status
  // first.)
  const alreadyDone = lead.result_urls.length;
  if (alreadyDone >= lead.image_urls.length) {
    return NextResponse.json({ lead });
  }

  await markHunterLeadRunning(params.id);

  // Only review the images that don't have a result yet — see the
  // RESUMABILITY comment above. Same order as image_urls, so
  // result_urls[i] always corresponds to image_urls[i] once complete.
  const pending = lead.image_urls.slice(alreadyDone);

  for (const imageUrl of pending) {
    try {
      const result = await checkAdImageUrl(imageUrl, { caption: lead.clinic_name });
      await appendHunterLeadResult(params.id, result.resultUrl);
    } catch (e) {
      const message = e instanceof CheckAdError ? e.message : "internal_error";
      console.error(`Hunter automation run failed for lead ${params.id} on image "${imageUrl}":`, e);
      await markHunterLeadFailed(params.id, message);
      const updated = await getHunterLead(params.id);
      return NextResponse.json({ error: message, lead: updated }, { status: e instanceof CheckAdError ? e.status : 500 });
    }
  }

  await markHunterLeadDone(params.id);
  const updated = await getHunterLead(params.id);
  return NextResponse.json({ lead: updated });
}
