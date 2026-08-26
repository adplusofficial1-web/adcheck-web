import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner, hasActiveAgencyPlan } from "@/lib/agency";
import { reviewImage } from "@/lib/reviewImage";

type IncomingImage = {
  filename: string;
  caption: string;
  base64?: string; // data URL or raw base64, optional (falls back to text-only review)
  mediaType?: string;
};

export async function POST(req: Request) {
  const body = await req.json();
  const images: IncomingImage[] = body.images || [];

  if (images.length === 0) {
    return NextResponse.json({ error: "no images" }, { status: 400 });
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // body.businessId lets an Agency account upload on behalf of a clinic it
  // manages (see app/upload/page.tsx's ?business= param) instead of always
  // reviewing against the signed-in account's own credits/history.
  // getBusinessByIdForOwner only resolves ids that are the signed-in
  // business itself or one of its child clinics.
  const targetId = typeof body.businessId === "string" ? body.businessId : undefined;
  const target = targetId ? await getBusinessByIdForOwner(targetId, business.id) : business;
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }
  // Uploading on behalf of a child clinic (targetId set and it isn't the
  // signed-in account itself) additionally requires the AGENCY account's
  // own package to be an active code='agency' plan — see
  // lib/agency.ts:hasActiveAgencyPlan. Checked here too (not just hidden
  // in the UI) so a direct POST can't bypass it. The target clinic's own
  // credits_remaining check right below still applies on top of this.
  if (targetId && target.id !== business.id && !hasActiveAgencyPlan(business)) {
    return NextResponse.json(
      { error: "บัญชีของคุณยังไม่ได้สมัคร หรือแพ็กเกจ Agency หมดอายุแล้ว กรุณาสมัคร/ต่ออายุก่อนอัปโหลดให้คลินิกในเครือข่าย" },
      { status: 402 }
    );
  }
  if (target.credits_remaining < images.length) {
    return NextResponse.json({ error: "insufficient credits" }, { status: 402 });
  }

  const [submission] = await sql`
    INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
    VALUES (${target.id}, 'processing', ${images.length}, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
    RETURNING id, share_token
  `;

  // Fire-and-forget: kick off the (potentially slow — several seconds per
  // image, sequential by design) review loop WITHOUT awaiting it, so the
  // client gets `submission.id` back immediately and can start polling
  // GET /api/submissions/[id]/status for real-time progress instead of
  // staring at a frozen "AI กำลังตรวจสอบ..." button for the whole batch.
  //
  // This relies on the Node process staying alive after the response is
  // sent, which holds on Render (this app runs as a persistent `next start`
  // server, not per-request serverless functions) but would NOT hold on a
  // platform that freezes the process after the response (e.g. Vercel
  // serverless/edge functions) — if this app ever moves to that kind of
  // host, replace this with `unstable_after()`/`after()` from
  // `next/server` (needs `experimental.after` in next.config, Next 14.1+)
  // or a real job queue instead of relying on fire-and-forget.
  //
  // The `.catch` is required even though processSubmissionImages() has its
  // own internal per-image try/catch — it guards against something outside
  // that loop throwing (e.g. the final UPDATE queries below failing), which
  // would otherwise become an unhandled promise rejection that can crash
  // the Node process.
  processSubmissionImages(submission.id, target, images).catch(async (e) => {
    console.error(`processSubmissionImages crashed for submission ${submission.id}:`, e);
    try {
      await sql`UPDATE submissions SET status = 'failed' WHERE id = ${submission.id}`;
    } catch (updateErr) {
      console.error(`Failed to mark submission ${submission.id} as failed:`, updateErr);
    }
  });

  return NextResponse.json({ id: submission.id });
}

/**
 * Reviews every image in the submission, one at a time, writing results to
 * the DB as each one finishes. Runs in the background — see the comment in
 * POST above for why this is safe to not await on this deployment.
 *
 * This is the exact same logic that used to run inline inside POST before
 * responding; only the surrounding control flow changed (extracted into its
 * own function, called without `await`), not the review/derivation/storage
 * logic itself.
 */
async function processSubmissionImages(
  submissionId: string,
  business: { id: string; credits_remaining: number },
  images: IncomingImage[]
) {
  let overall: "passed" | "caution" | "violation" = "passed";

  // Review images one at a time, in order. Slower than running them
  // concurrently, but keeps each image's AI call, DB writes, and error
  // handling fully isolated and easy to reason about — prioritizing accuracy
  // and stability over raw throughput per explicit direction.
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let result;
    try {
      // strip a data: URL prefix if present, keep just the base64 payload
      const rawBase64 = img.base64?.includes(",") ? img.base64.split(",")[1] : img.base64;
      result = await reviewImage({
        base64Image: rawBase64,
        mediaType: img.mediaType,
        caption: img.caption,
        filename: img.filename,
      });
    } catch (e: any) {
      console.error(`reviewImage failed for ${img.filename}:`, e);
      // CRITICAL: never let a failed AI call fall through as an empty
      // flags array. Downstream, status is derived purely from flag
      // severities (see below) — an empty array there silently becomes
      // "passed", which previously made a total AI outage look like every
      // image cleared compliance. Attach a synthetic flag instead so the
      // failure is visible on the results page and the image is routed to
      // "caution" (needs manual review), never a false "passed".
      result = {
        status: "caution" as const,
        confidence: 0,
        flags: [
          {
            quoted_text: img.caption || img.filename,
            category: "ข้อผิดพลาดของระบบ",
            legal_ref: "-",
            severity: "ควรระวัง" as const,
            confidence_level: "ต่ำ" as const,
            topic: "ระบบ AI ไม่สามารถตรวจสอบภาพนี้ได้",
            detailed_explanation: `การเรียกระบบ AI เพื่อตรวจสอบภาพนี้ล้มเหลว (${
              e?.message || "ไม่ทราบสาเหตุ"
            }) จึงยังไม่ได้ตรวจสอบเนื้อหาจริงตามกฎหมาย/ระเบียบที่เกี่ยวข้อง ผลที่แสดงนี้ไม่ใช่ผลตรวจสอบที่สมบูรณ์`,
            suggested_correction: "กรุณาส่งภาพนี้ตรวจใหม่อีกครั้ง หากยังล้มเหลวซ้ำให้ติดต่อทีมงาน",
          },
        ],
      };
    }

    // Defensive: Claude occasionally omits/mistypes `flags` (e.g. on a clean
    // "passed" result) despite the schema requiring it — never let that crash
    // the whole request.
    if (!Array.isArray(result.flags)) result.flags = [];
    result.flags = result.flags.filter((f: any) => f && f.quoted_text);

    // IMPORTANT: do not trust Claude's top-level `status` field on its own —
    // it has repeatedly disagreed with its own `flags` array (e.g. returning
    // "violation" with zero flags), and prompt wording alone can't guarantee
    // a language model keeps two independent fields in sync. Instead, derive
    // the image's status purely from the severities it actually put in
    // `flags`, so the two can never contradict each other.
    const hasViolation = result.flags.some((f: any) => f.severity === "ห้ามเด็ดขาด");
    const hasCaution = result.flags.some((f: any) => f.severity === "ควรระวัง");
    let derivedStatus: "passed" | "caution" | "violation" = hasViolation
      ? "violation"
      : hasCaution
      ? "caution"
      : "passed";

    // CRITICAL: the derivation above has a dangerous blind spot — confirmed
    // happening in production — where Claude sets status to "caution"/
    // "violation" but returns an EMPTY flags array (violating its own
    // instructions). Deriving purely from flags in that case silently
    // downgrades a real violation to "passed", which is worse than trusting
    // status blindly: it hides a flagged ad as compliant. Never let an empty
    // flags array override a non-"passed" model verdict — keep the model's
    // status and attach a synthetic flag so the image still visibly lands
    // in manual review instead of disappearing into "passed".
    if (result.flags.length === 0 && result.status !== "passed") {
      derivedStatus = result.status === "violation" ? "violation" : "caution";
      result.flags = [
        {
          quoted_text: img.caption || img.filename,
          category: "ต้องตรวจสอบเพิ่มเติม",
          legal_ref: "-",
          severity: derivedStatus === "violation" ? "ห้ามเด็ดขาด" : "ควรระวัง",
          confidence_level: "ต่ำ",
          topic: "AI ระบุว่าพบความเสี่ยงแต่ไม่ได้ระบุรายละเอียด",
          detailed_explanation:
            "ระบบ AI ประเมินว่าภาพนี้มีความเสี่ยงไม่ผ่านเกณฑ์ แต่ไม่ได้ระบุข้อความหรือจุดที่มีปัญหาอย่างเจาะจงในรอบนี้ " +
            "จึงยังไม่สามารถแสดงเหตุผลและมาตรากฎหมายที่เกี่ยวข้องได้ครบถ้วน",
          suggested_correction: "กรุณาให้เจ้าหน้าที่ตรวจสอบภาพนี้ด้วยตนเอง หรือกดส่งภาพนี้ตรวจซ้ำอีกครั้ง",
        } as any,
      ];
      console.warn(
        `reviewImage returned status "${result.status}" with zero flags for ${img.filename} — keeping as "${derivedStatus}" with a synthetic review flag instead of downgrading to "passed"`
      );
    } else if (result.status !== derivedStatus) {
      console.warn(
        `reviewImage status/flags mismatch for ${img.filename}: model said "${result.status}", derived "${derivedStatus}" from ${result.flags.length} flag(s)`
      );
    }
    result.status = derivedStatus;

    if (result.status === "violation") overall = "violation";
    else if (result.status === "caution" && overall !== "violation") overall = "caution";

    // TEMPORARY: store the image inline as a data URL until Cloudflare R2 is
    // enabled and wired up as real object storage. Fine for a demo/low-volume
    // use, but this bloats the database — swap for an R2 URL once available.
    const storedImageUrl = img.base64 && img.mediaType
      ? (img.base64.startsWith("data:") ? img.base64 : `data:${img.mediaType};base64,${img.base64}`)
      : "https://storage.adcheck.app/demo/" + encodeURIComponent(img.filename);

    const [savedImage] = await sql`
      INSERT INTO submission_images (submission_id, image_url, filename, caption, status, sort_order)
      VALUES (${submissionId}, ${storedImageUrl}, ${img.filename}, ${img.caption || null}, ${result.status}, ${i})
      RETURNING id
    `;

    for (const f of result.flags) {
      if (!f || !f.quoted_text) continue;
      // The DB has one `detailed_explanation` column (no separate column for
      // a fix suggestion yet — avoids a schema migration for this change).
      // Store both paragraphs in it, clearly labeled and blank-line separated
      // so the results page can split them back into distinct <p> blocks.
      const reasonPart = f.detailed_explanation ? f.detailed_explanation.trim() : "";
      const fixPart = f.suggested_correction ? f.suggested_correction.trim() : "";
      const combinedExplanation =
        reasonPart && fixPart
          ? `${reasonPart}\n\nวิธีแก้ไข: ${fixPart}`
          : reasonPart || (fixPart ? `วิธีแก้ไข: ${fixPart}` : null);

      await sql`
        INSERT INTO review_flags (submission_id, submission_image_id, quoted_text, category, legal_ref, severity, confidence_level, explanation, detailed_explanation)
        VALUES (${submissionId}, ${savedImage.id}, ${f.quoted_text}, ${f.category ?? null}, ${f.legal_ref ?? null}, ${f.severity ?? "ควรระวัง"}, ${f.confidence_level ?? "ปานกลาง"}, ${f.topic ?? null}, ${combinedExplanation})
      `;
    }
  }

  const finalStatus = overall === "passed" ? "passed" : "needs_review";

  await sql`
    UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
    WHERE id = ${submissionId}
  `;
  await sql`
    UPDATE businesses SET credits_remaining = credits_remaining - ${images.length}, updated_at = now()
    WHERE id = ${business.id}
  `;
}
