import { NextResponse } from "next/server";
import { sql, getOrCreateAutomationBusiness } from "@/lib/db";
import { reviewImage } from "@/lib/reviewImage";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { MAX_FILE_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from "@/lib/uploadLimits";
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
// kicking off background work. Everything else — the flags/status
// derivation logic (including the "model said non-passed but returned an
// empty flags array" guard), the reviewImage-failure fallback synthetic
// flag + credit refund, and how a submission_images row is shaped/stored —
// is copied faithfully from that route's processOneImage() rather than
// reinvented, so results from either path are indistinguishable to anyone
// looking at the DB or the shared results page afterward.
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

    // --- Fetch the image server-side ---------------------------------------
    // Never trust client-provided base64 here — n8n only ever has a URL
    // (e.g. Meta's ad CDN URL for the creative), so the bytes have to be
    // pulled down by this server, not handed to us directly. Mirrors the
    // same content-type/size checks app/api/submissions/route.ts applies to
    // browser-uploaded base64 (see its ALLOWED_MEDIA_TYPES/MAX_FILE_SIZE_BYTES
    // checks), just against a fetched response instead of a data URL.
    let fetchRes: Response;
    try {
      fetchRes = await fetch(imageUrl);
    } catch (e) {
      return NextResponse.json({ error: "failed to fetch imageUrl" }, { status: 400 });
    }
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `failed to fetch imageUrl (status ${fetchRes.status})` },
        { status: 400 }
      );
    }

    const contentType = fetchRes.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!ALLOWED_MEDIA_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: `unsupported content-type "${contentType}" (JPG, PNG, PDF only)` },
        { status: 400 }
      );
    }

    // Content-Length is only a hint (it can be absent, or a lie) — check it
    // when present as a cheap early rejection, but the authoritative check
    // is the actual byte cap enforced while reading the body below.
    const declaredLength = fetchRes.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "image exceeds max file size" }, { status: 400 });
    }

    if (!fetchRes.body) {
      return NextResponse.json({ error: "imageUrl returned no body" }, { status: 400 });
    }
    const reader = fetchRes.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        // Enforce the real cap while streaming, not just from the
        // (possibly absent/untrustworthy) Content-Length header above —
        // stop pulling bytes the moment the cap is exceeded rather than
        // buffering an unbounded response into memory.
        if (totalBytes > MAX_FILE_SIZE_BYTES) {
          try {
            await reader.cancel();
          } catch {
            // best-effort — nothing to do if the underlying stream can't be cancelled
          }
          return NextResponse.json({ error: "image exceeds max file size" }, { status: 400 });
        }
        chunks.push(value);
      }
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const base64Image = buffer.toString("base64");
    const mediaType = contentType;

    // --- Resolve the internal automation business ---------------------------
    const business = await getOrCreateAutomationBusiness();
    if (!business) {
      console.error("getOrCreateAutomationBusiness() returned no row");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    // --- Reserve 1 credit, same accounting as app/api/submissions/route.ts --
    const reserved = await reserveCredits(business.id, 1);
    if (!reserved) {
      return NextResponse.json({ error: "insufficient credits" }, { status: 402 });
    }

    // --- Create the submission row -----------------------------------------
    const filename = imageUrl.split("/").pop()?.split("?")[0] || "automation-image";
    let submission;
    try {
      [submission] = await sql`
        INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
        VALUES (${business.id}, 'processing', 1, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
        RETURNING id, share_token
      `;
    } catch (e) {
      // Credits were already reserved above — give them back if the
      // submission row itself couldn't even be created, mirroring
      // app/api/submissions/route.ts's own handling of this failure mode.
      console.error("Failed to create submission row after reserving credits:", e);
      await refundCredits(business.id, 1);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    // --- Review synchronously (single image, caller wants the result now) --
    let result: any;
    let reviewFailed = false;
    try {
      result = await reviewImage({
        base64Image,
        mediaType,
        caption,
        filename,
      });
      // Mirrors processOneImage in app/api/submissions/route.ts: reviewImage()
      // can return normally with reviewFailed=true (e.g. the knowledge-base
      // fallback) without ever calling the AI — route that through the same
      // refund accounting as a thrown error.
      if (result.reviewFailed) reviewFailed = true;
    } catch (e: any) {
      console.error(`reviewImage failed for automation submission ${submission.id}:`, e);
      reviewFailed = true;
      // Same synthetic fallback flag as the real endpoint — never let a
      // failed AI call fall through as an empty flags array, which
      // downstream would silently derive to "passed".
      result = {
        status: "caution" as const,
        confidence: 0,
        flags: [
          {
            quoted_text: caption || filename,
            category: "ข้อผิดพลาดของระบบ",
            legal_ref: "-",
            severity: "ควรระวัง" as const,
            confidence_level: "ต่ำ" as const,
            topic: "ระบบ AI ไม่สามารถตรวจสอบภาพนี้ได้",
            detailed_explanation: `การเรียกระบบ AI เพื่อตรวจสอบภาพนี้ล้มเหลว (${
              e?.message || "ไม่ทราบสาเหตุ"
            }) จึงยังไม่ได้ตรวจสอบเนื้อหาจริงตามกฎหมาย/ระเบียบที่เกี่ยวข้อง ผลที่แสดงนี้ไม่ใช่ผลตรวจสอบที่สมบูรณ์`,
            suggested_correction: "กรุณาส่งภาพนี้ตรวจใหม่อีกครั้ง หากยังล้มเหลวซ้ำให้ติดต่อทีมขาน",
          },
        ],
      };
    }

    // Defensive: same as processOneImage — never let a malformed/missing
    // `flags` field from the model crash this request.
    if (!Array.isArray(result.flags)) result.flags = [];
    result.flags = result.flags.filter((f: any) => f && f.quoted_text);

    // Derive status purely from flag severities, never trusting the model's
    // top-level `status` field on its own — identical logic to
    // processOneImage in app/api/submissions/route.ts.
    const hasViolation = result.flags.some((f: any) => f.severity === "ห้ามเด็ดขาด");
    const hasCaution = result.flags.some((f: any) => f.severity === "ควรระวัง");
    let derivedStatus: "passed" | "caution" | "violation" = hasViolation
      ? "violation"
      : hasCaution
      ? "caution"
      : result.flags.length > 0
      ? "caution"
      : "passed";

    // CRITICAL (same guard as app/api/submissions/route.ts): never let an
    // EMPTY flags array silently override a non-"passed" model verdict —
    // that would hide a real flagged ad as compliant. Keep the model's
    // status and attach a synthetic flag so it still visibly lands in
    // manual review instead of disappearing into "passed".
    if (result.flags.length === 0 && result.status !== "passed") {
      derivedStatus = result.status === "violation" ? "violation" : "caution";
      result.flags = [
        {
          quoted_text: caption || filename,
          category: "ต้องตรวจสอบเพิ่มเติม",
          legal_ref: "-",
          severity: derivedStatus === "violation" ? "ห้ามเด็ดขาด" : "ควรระวัง",
          confidence_level: "ต่ำ",
          topic: "AI ระบุว่าพบความเสี่ยงแต่ไม่ได้ระบุรายละเอียด",
          detailed_explanation:
            "ระบบ AI ประเมินว่าภาพนี้มีความเสี่ยงไม่ผ่านเกณฑ์ แต่ไม่ได้ระบุข้อความหรือจุดที่มีปัญหาอย่างเจาะจงในรอบนี้ " +
            "จึงยังไม่สามารถแสดงเหตุผลและมาดรากฎหมายที่เกี่ยวข้องได้ครบถ้วน",
          suggested_correction: "กรุณาให้เจ้าหน้าที่ตรวจสอบภาพนี้ด้วยตนเอง หรือกดส่งภาพนี้ตรวจซ้ำอีกครั้ง",
        },
      ];
      console.warn(
        `reviewImage returned status "${result.status}" with zero flags for automation submission ${submission.id} — keeping as "${derivedStatus}" with a synthetic review flag instead of downgrading to "passed"`
      );
    } else if (result.status !== derivedStatus) {
      console.warn(
        `reviewImage status/flags mismatch for automation submission ${submission.id}: model said "${result.status}", derived "${derivedStatus}" from ${result.flags.length} flag(s)`
      );
    }
    result.status = derivedStatus;

    // --- Store the image + flags, same shape as app/api/submissions/route.ts
    // TEMPORARY: stored inline as a data URL, same as the real endpoint —
    // see the TEMPORARY comment there for the plan to move to R2 later.
    const storedImageUrl = `data:${mediaType};base64,${base64Image}`;
    const cleanFilename = stripNulBytes(filename);
    const cleanCaption = caption ? stripNulBytes(caption) : caption;

    try {
      const [savedImage] = await sql`
        INSERT INTO submission_images (submission_id, image_url, filename, caption, status, sort_order)
        VALUES (${submission.id}, ${storedImageUrl}, ${cleanFilename}, ${cleanCaption || null}, ${result.status}, 0)
        RETURNING id
      `;

      for (const f of result.flags) {
        if (!f || !f.quoted_text) continue;
        const reasonPart = f.detailed_explanation ? f.detailed_explanation.trim() : "";
        const fixPart = f.suggested_correction ? f.suggested_correction.trim() : "";
        const combinedExplanation =
          reasonPart && fixPart
            ? `${reasonPart}\n\nวิธีแก้ไข: ${fixPart}`
            : reasonPart || (fixPart ? `วิธีแก้ไข: ${fixPart}` : null);

        await sql`
          INSERT INTO review_flags (submission_id, submission_image_id, quoted_text, category, legal_ref, severity, confidence_level, explanation, detailed_explanation)
          VALUES (${submission.id}, ${savedImage.id}, ${f.quoted_text}, ${f.category ?? null}, ${f.legal_ref ?? null}, ${f.severity ?? "ควรระวัง"}, ${f.confidence_level ?? "ปานกลาง"}, ${f.topic ?? null}, ${combinedExplanation})
        `;
      }
    } catch (e) {
      console.error(`Failed to save review results for automation submission ${submission.id}:`, e);
    }

    // --- Finalize the submission row ----------------------------------------
    // submissions.status is a strict enum used elsewhere (the dashboard's
    // "si.status = 'passed'" filter, the status-polling route's TypeScript
    // union) that only ever holds 'processing' | 'passed' | 'needs_review' |
    // 'failed' — it does NOT accept the 3-value per-image 'caution'/
    // 'violation' status used elsewhere in this file. Collapse to the same
    // 2-value convention the real endpoint uses (app/api/submissions/route.ts's
    // `finalStatus`), even though this route's JSON response still returns
    // the more granular per-image status ('passed'/'caution'/'violation')
    // to the caller — submissions.status is the coarse dashboard-facing
    // status; result.status is this image's real verdict.
    const finalStatus = result.status === "passed" ? "passed" : "needs_review";
    try {
      await sql`
        UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
        WHERE id = ${submission.id} AND status = 'processing'
      `;
    } catch (e) {
      console.error(`Failed to set final status for automation submission ${submission.id}:`, e);
    }

    // Refund the reserved credit if this image never actually got a genuine
    // AI review — same reasoning as unreviewedCount in
    // app/api/submissions/route.ts: an outage or knowledge-base miss isn't a
    // review that happened, so it isn't chargeable.
    if (reviewFailed) {
      await refundCredits(business.id, 1);
    }

    return NextResponse.json({
      submissionId: submission.id,
      resultUrl: `https://adcheck.pro/share/${submission.share_token}`,
      status: result.status,
      flags: result.flags,
      caption: caption ?? null,
      imageUrl,
      clinicLabel: clinicLabel ?? null,
    });
  } catch (e) {
    console.error("Unexpected error in POST /api/automation/check-ad:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
