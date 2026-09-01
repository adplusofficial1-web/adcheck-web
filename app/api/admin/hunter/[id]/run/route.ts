import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { checkAdImageUrls, CheckAdError } from "@/lib/automationCheckAd";
import {
  getHunterLead,
  markHunterLeadRunning,
  markHunterLeadDone,
  markHunterLeadFailed,
} from "@/lib/hunterLeads";
import { isValidUuid } from "@/lib/validation";

// POST /api/admin/hunter/[id]/run — the "Marketing > Hunter" equivalent of
// clicking upload-and-wait, except it runs every image_urls entry for one
// lead through the exact same AI review as the external n8n endpoint (see
// lib/automationCheckAd.ts), sequentially, in this one request.
//
// CHANGE (2026-08-31): all of a lead's (up to 3) images are now reviewed as
// ONE shared submission (checkAdImageUrls) instead of one submission per
// image — so a lead has a single "ดูผลตรวจสอบ" link
// (adcheck.pro/share/{token} with all images on one page) rather than a
// separate link per image. Per-image fetch/review failures inside the
// batch are still handled individually (that credit refunded, others still
// reviewed) — see checkAdImageUrls' own comment — but at the LEAD level
// there is no more partial "2 of 3 done, retry only the third" state: a
// re-run always redoes the whole batch, since it's cheap (≤3 images) and
// keeps this route simple. Re-running a 'done' lead is only reachable by
// first editing its image_urls (which resets it to 'ready' — see
// lib/hunterLeads.ts:updateHunterLeadImages), so this isn't a
// re-review-everything-for-free loophole from the UI.
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

  // Already has a combined result — nothing to do. (Re-running a fully
  // 'done' lead is a no-op rather than an error, so the button can stay
  // enabled without an admin needing to check status first. To force a
  // fresh review, edit the image_urls — see updateHunterLeadImages.)
  if (lead.status === "done" && lead.result_url) {
    return NextResponse.json({ lead });
  }

  await markHunterLeadRunning(params.id);

  try {
    // Haiku 4.5 (2026-08-31): same model as the Hunter auto-fill cron job
    // (scripts/hunterAutoFillJob.ts) — kept consistent so a lead reviewed by
    // this manual button behaves the same as one reviewed automatically.
    // See lib/automationCheckAd.ts's top-of-file note for the comparison
    // that justified this; the customer-facing endpoint is unaffected.
    const result = await checkAdImageUrls(lead.image_urls, { caption: lead.clinic_name, model: "claude-haiku-4-5" });
    // Sales Lead Distribution (2026-09-01): persist the overall
    // review_status/flag_count alongside result_url, so this lead is
    // immediately eligible for (or excluded from) the sales pool query —
    // see lib/salesLeads.ts.
    await markHunterLeadDone(params.id, result.resultUrl, result.overallStatus, result.flagCount);
    const updated = await getHunterLead(params.id);
    return NextResponse.json({ lead: updated });
  } catch (e) {
    const message = e instanceof CheckAdError ? e.message : "internal_error";
    console.error(`Hunter automation run failed for lead ${params.id}:`, e);
    await markHunterLeadFailed(params.id, message);
    const updated = await getHunterLead(params.id);
    return NextResponse.json({ error: message, lead: updated }, { status: e instanceof CheckAdError ? e.status : 500 });
  }
}
