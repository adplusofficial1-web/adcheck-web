import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner, hasActiveAgencyPlan } from "@/lib/agency";
import { reviewImage } from "@/lib/reviewImage";
import { deductCredits } from "@/lib/credits";
import { MAX_UPLOAD_IMAGES } from "@/lib/uploadLimits";

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
  // The upload form only ever lets someone pick up to MAX_UPLOAD_IMAGES (see
  // app/upload/UploadForm.tsx), but that's a client-side limit only — this
  // guards the same limit here so a direct POST past the UI can't submit an
  // unbounded batch (uncapped AI review cost, uncapped credit deduction).
  if (images.length > MAX_UPLOAD_IMAGES) {
    return NextResponse.json(
      { error: `อัปโหลดได้สูงสุด ${MAX_UPLOAD_IMAGES} ภาพต่อครั้ง` },
      { status: 400 }
    );
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // body.businessId lets an Agency account upload on behalf of a clinic it
  // manages (see app/upload/page.tsx's ?business= param). `target` only
  // affects WHICH clinic the submission/history row is attributed to —
  // billing is separate (see below). getBusinessByIdForOwner only resolves
  // ids that are the signed-in business itself or one of its child clinics.
  const targetId = typeof body.businessId === "string" ? body.businessId : undefined;
  const target = targetId ? await getBusinessByIdForOwner(targetId, business.id) : business;
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }
  // Uploading on behalf of a child clinic (targetId set and it isn't the
  // signed-in account itself) additionally requires the AGENCY account's
  // own package to be an active code='agency' plan — see
  // lib/agency.ts:hasActiveAgencyPlan. Checked here too (not just hidden
  // in the UI) so a direct POST can't bypass it.
  if (targetId && target.id !== business.id && !hasActiveAgencyPlan(business)) {
    return NextResponse.json(
      { error: "บัญชีของคุณยังไม่ได้สมัคร หรือแพ็กเกจ Agency หมดอายุแล้ว กรุณาสมัคร/ต่ออายุก่อนอัพโหลดให้คลินิกในเครือข่าย" },
      { status: 402 }
    );
  }
  // Billing is always against the SIGNED-IN business, never `target`. A
  // child clinic has no package of its own any more — every review across
  // every clinic in an agency's network draws from the agency's own
  // credits_remaining (funded by its single code='agency' package
  // purchase). When target === business (a solo clinic reviewing its own
  // ad, or an agency reviewing for itself) this is the same row anyway, so
  // nothing changes for that case.
  if (business.credits_remaining < images.length) {
    return NextResponse.json({ error: "insufficient credits" }, { status: 402 });
  }

  const [submission] = await sql`
    INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
    VALUES (${target.id}, 'processing', ${images.length}, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
    RETURNING id, share_token
  `;

  // Fire-and-forget: kick off the (potentially slow — several seconds per
  // image, run with a small concurrency cap — see REVIEW_CONCURRENCY below)
  // review loop WITHOUT awaiting it, so the client gets `submission.id` back
  // immediately and can start polling
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
  // Pass `business` (not `target`) — see the billing comment above:
  // credits are always deducted from the signed-in account's own row.
  processSubmissionImages(submission.id, business, images).catch(async (e) => {
    console.error(`processSubmissionImages crashed for submission ${submission.id}:`, e);
    try {
      await sql`UPDATE submissions SET status = 'failed' WHERE id = ${submission.id}`;
    } catch (updateErr) {
      console.error(`Failed to mark submission ${submission.id} as failed:`, updateErr);
    }
  });

  return NextResponse.json({ id: submission.id });
}

// How many images get reviewed at once within one submission. Each image's
// AI call is fully independent (own reviewImage() call, own flags, own
// status — nothing about how one image is judged depends on any other), so
// running several at once changes wall-clock time only, never what the AI
// sees or how it's judged. Capped at a small number rather than firing every
// image at once purely to stay well under Anthropic's per-account concurrent
// request rate limit on a large batch (this app caps submissions at
// MAX_UPLOAD_IMAGES images — see lib/uploadLimits.ts — so with the current
// value, a submission needs at most a few waves at this concurrency).
// Raise this if rate-limit errors are never seen in practice; lower it if
// they are.
const REVIEW_CONCURRENCY = 3;

/**
 * Reviews every image in the submission — up to REVIEW_CONCURRENCY at once —
 * writing each one's results to the DB as soon as it finishes. Runs in the
 * background — see the comment in POST above for why this is safe to not
 * await on this deployment.
 *
 * Per-image review/derivation/storage logic is unchanged from when this ran
 * strictly one image at a time; only the control flow around it changed (see
 * the worker-pool loop at the bottom of this function) to let up to
 * REVIEW_CONCURRENCY images be in flight together instead of one.
 */
async function processSubmissionImages(
  submissionId: string,
  business: { id: string; credits_remaining: number },
  images: IncomingImage[]
) {
  let overall: "passed" | "caution" | "violation" = "passed";

  // One image's full review → derive-status → store cycle. Called by the
  // worker pool below, potentially several of these in flight at once — see
  // that loop's comment for why sharing `overall` and `submissionId` across
  // concurrent calls is safe.
  async function processOneImage(img: IncomingImage, i: number) {
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
            suggested_correction: "กรุณาส่งภาพนี้ตรวจใหม่อีกครั้ง หากยังล้มเหลวซ้ำให้ติดต่อทีมขาน",
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
            "จึงยังไม่สามารถแสดงเหตุผลและมาดรากฎหมายที่เกี่ยวข้องได้ครบถ้วน",
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

  // Worker-pool driver: up to REVIEW_CONCURRENCY calls to processOneImage()
  // in flight at once, each pulling the next not-yet-started index as soon
  // as it's free. Safe to share `overall`/`submissionId` across these
  // concurrently-running calls because:
  //   - Node's event loop is single-threaded — two `await`-ed calls are
  //     interleaved at their await points, never truly running at the same
  //     instant, so the read-modify-write on `overall` below can't race.
  //   - The roll-up itself is monotonic (violation > caution > passed), so
  //     it converges to the same final value regardless of which image
  //     happens to finish first.
  //   - Each image's row uses its own original index `i` for `sort_order`
  //     (not insertion/completion order), so the UI's image order is
  //     unaffected by which image finishes first.
  //   - submission_images/review_flags INSERTs are independent rows per
  //     image — nothing here does a read-modify-write on a shared row that
  //     concurrent calls could clobber.
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < images.length) {
      const i = nextIndex++;
      await processOneImage(images[i], i);
    }
  }
  const workerCount = Math.min(REVIEW_CONCURRENCY, images.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const finalStatus = overall === "passed" ? "passed" : "needs_review";

  await sql`
    UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
    WHERE id = ${submissionId}
  `;
  // CHANGE (multi-package credits): a business's spendable credits can now
  // be spread across several still-active package purchases (see
  // migrations for business_packages) plus a non-expiring legacy balance
  // on the business row itself. deductCredits() spends the
  // soonest-expiring package first and only falls back to the legacy
  // balance once every active package is exhausted — see lib/credits.ts.
  await deductCredits(business.id, images.length);
}
