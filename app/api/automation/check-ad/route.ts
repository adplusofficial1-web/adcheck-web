import { NextResponse } from "next/server";
import { checkAdImageUrl, CheckAdError } from "@/lib/automationCheckAd";
import { stripNulBytes } from "@/lib/validation";

export const runtime = "nodejs";

// ---------------------------------------------------------------------
// PURPOSE
// ---------------------------------------------------------------------
// This route lets an n8n workflow (or any other server-to-server caller)
// submit exactly ONE ad image, given only its public URL (e.g. straight
// from Meta's ad CDN, as pulled by an n8n "Facebook Ads" node), for the
// same AI compliance review the browser upload flow performs — WITHOUT a
// human ever sitting at a browser. This is deliberately NOT the same
// endpoint a signed-in clinic's browser hits (app/api/submissions/route.ts):
// that route trusts a NextAuth session cookie (getCurrentBusiness()) to
// decide who's asking and who to bill, which an n8n workflow simply does
// not have and has no reasonable way to obtain (it isn't a human who can
// complete a Google OAuth login flow).
//
// AUTH MODEL
// ---------------------------------------------------------------------
// Instead of a session, this route requires a static shared secret in the
// `x-api-key` request header, compared against process.env.AUTOMATION_API_KEY.
// This is intentionally simple (no rotation, no per-caller keys, no OAuth)
// because the only caller is meant to be a small number of trusted internal
// n8n workflows configured with this one secret as a credential — not a
// public-facing integration surface. If AUTOMATION_API_KEY is unset (e.g.
// forgotten in an environment's config) this route FAILS CLOSED — every
// request is rejected as unauthorized — rather than silently accepting
// requests because "no key was configured to check against". The key
// itself is never logged anywhere in this file, including in error paths,
// since it's a long-lived credential shared across every automation call.
//
// BILLING MODEL
// ---------------------------------------------------------------------
// Every call here draws 1 credit from a dedicated internal business row
// (see lib/db.ts:getOrCreateAutomationBusiness) rather than from any real
// clinic's balance — n8n isn't acting "as" any particular clinic, it's a
// standalone automation pipeline. That row is a REAL business row inside
// the exact same credits_remaining / business_packages accounting as every
// other clinic (see reserveCredits/refundCredits in lib/credits.ts) — it is
// NOT a free/unmetered special case. It starts with only the normal free
// signup bonus new business rows get; someone needs to grant it a real
// package/credits via the existing admin credit-grant flow
// (app/api/admin/credits) or every call here will 402 with
// "insufficient credits" exactly like any ordinary business that ran out —
// that's intentional, not a bug, since it keeps this path fully inside the
// same trusted accounting instead of carving out a side channel.
//
// RELATIONSHIP TO app/api/submissions/route.ts
// ---------------------------------------------------------------------
// This is best understood as a single-image, SYNCHRONOUS variant of that
// route. The real submissions endpoint accepts up to MAX_UPLOAD_IMAGES
// images, reserves credits for all of them up front, and reviews them in
// the background (fire-and-forget, up to REVIEW_CONCURRENCY at once) while
// the browser polls a status endpoint for progress — appropriate for a
// human watching a progress bar. n8n instead wants one image in, one
// verdict out, in the SAME HTTP response (no separate polling step in the
// workflow), so this route awaits reviewImage() directly rather than
// kicking off background work.
//
// CHANGE: the actual fetch/review/store logic below used to live directly
// in this file. It's now shared with app/api/admin/hunter/[id]/run/route.ts
// (the admin "run automation" button for a Hunter lead) via
// lib/automationCheckAd.ts:checkAdImageUrl() — extracted verbatim, no
// behavior change here, so results from either caller are still
// indistinguishable in the database.
export async function POST(req: Request) {
  try {
    // --- Auth -----------------------------------------------------------
    // Never log the header value itself (or process.env.AUTOMATION_API_KEY)
    // anywhere below, even in error paths — it's a long-lived shared secret.
    const expectedKey = process.env.AUTOMATION_API_KEY;
    const providedKey = req.headers.get("x-api-key");
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // --- Body validation --------------------------------------------------
    const body = await req.json().catch(() => null as any);
    const imageUrl: unknown = body?.imageUrl;
    const caption: string | undefined =
      typeof body?.caption === "string" ? stripNulBytes(body.caption) : undefined;
    const clinicLabel: string | undefined =
      typeof body?.clinicLabel === "string" ? stripNulBytes(body.clinicLabel) : undefined;

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    const result = await checkAdImageUrl(imageUrl, { caption });

    return NextResponse.json({
      submissionId: result.submissionId,
      resultUrl: result.resultUrl,
      status: result.status,
      flags: result.flags,
      caption: caption ?? null,
      imageUrl,
      clinicLabel: clinicLabel ?? null,
    });
  } catch (e) {
    if (e instanceof CheckAdError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("Unexpected error in POST /api/automation/check-ad:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
