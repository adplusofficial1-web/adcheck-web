import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner, hasActiveAgencyPlan } from "@/lib/agency";
import { reviewImage } from "@/lib/reviewImage";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { MAX_UPLOAD_IMAGES, MAX_FILE_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from "@/lib/uploadLimits";
import { isValidUuid, stripNulBytes } from "@/lib/validation";

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

  // FIX (bug audit #12): the upload page's own copy promises "JPG, PNG,
  // PDF ไม่เกิน 10MB ต่อไฟล์" but nothing server-side ever checked that —
  // only the browser-side resize step did, which a direct POST can skip
  // entirely. `base64`/`mediaType` are only required when an image is
  // actually attached (a caption-only, text-only review is valid with
  // neither set — see IncomingImage above), so only attached images are
  // checked here.
  for (const img of images) {
    if (!img.base64) continue;
    if (!img.mediaType || !ALLOWED_MEDIA_TYPES.includes(img.mediaType)) {
      return NextResponse.json(
        { error: `ไฟล์ "${img.filename}" ไม่ใช่ชนิดที่รองรับ (JPG, PNG, PDF เท่านั้น)` },
        { status: 400 }
      );
    }
    const rawBase64 = img.base64.includes(",") ? img.base64.split(",")[1] : img.base64;
    // Decoded byte size from a base64 string's length, without actually
    // allocating the buffer — base64 encodes 3 bytes as 4 characters, minus
    // 1-2 bytes for trailing '=' padding.
    const padding = rawBase64.endsWith("==") ? 2 : rawBase64.endsWith("=") ? 1 : 0;
    const approxBytes = (rawBase64.length * 3) / 4 - padding;
    if (approxBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `ไฟล์ "${img.filename}" มีขนาดเกิน 10MB` },
        { status: 400 }
      );
    }
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
  // FIX (bug audit — Low: malformed-UUID 500s): a non-UUID businessId used
  // to reach getBusinessByIdForOwner's query and throw a raw Postgres
  // error instead of the normal "ไม่พบคลินิกนี้" 404 below.
  if (targetId !== undefined && !isValidUuid(targetId)) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }
  const target = targetId ? await getBusinessByIdForOwner(targetId, business.id) : business;
  if (!target) {
    return NextResponse.json({ error: "ไม่พบคลินิกนี้" }, { status: 404 });
  }
  // Uploading on behalf of a child clinic (targetId set and it isn't the
  // signed-in account itself) additionally requires the AGENCY account's
  // own package to be an active code='agency' plan — see
  // lib/agency.ts:hasActiveAgencyPlan. Checked here too (not just hidden
  // in the UI) so a direct POST can't bypass it.
  if (targetId && target.id !== business.id && !(await hasActiveAgencyPlan(business))) {
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
  //
  // FIX (bug audit #1 + #2): reserve the credits atomically UP FRONT —
  // before the submission row even exists, before any AI work starts —
  // instead of the old pattern of a soft, non-atomic read-only check here
  // followed by a separate deduction only after every image finished
  // processing (many seconds to minutes later, with no shared transaction
  // between the two). Two concurrent submissions for the same business can
  // no longer both pass a stale check and jointly overdraw the balance —
  // see lib/credits.ts:reserveCredits for how the atomicity is achieved.
  const reserved = await reserveCredits(business.id, images.length);
  if (!reserved) {
    return NextResponse.json({ error: "insufficient credits" }, { status: 402 });
  }

  let submission;
  try {
    [submission] = await sql`
      INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
      VALUES (${target.id}, 'processing', ${images.length}, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
      RETURNING id, share_token
    `;
  } catch (e) {
    // Credits were already reserved above — give them back if the
    // submission row itself couldn't even be created, so a DB hiccup here
    // never silently costs the business credits for a submission that
    // never existed.
    console.error("Failed to create submission row after reserving credits:", e);
    await refundCredits(business.id, images.length);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }

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
  // credits are always reserved/refunded against the signed-in account's
  // own row.
  processSubmissionImages(submission.id, business, images).catch(async (e) => {
    console.error(`processSubmissionImages crashed for submission ${submission.id}:`, e);
    try {
      await sql`UPDATE submissions SET status = 'failed' WHERE id = ${submission.id}`;
    } catch (updateErr) {
      console.error(`Failed to mark submission ${submission.id} as failed:`, updateErr);
    }
    // Credits were reserved upfront (reserveCredits, above) — if the whole
    // batch crashed outside processOneImage's own per-image error handling,
    // none of it was genuinely reviewed, so give every reserved credit
    // back rather than charging for a submission that never completed.
    try {
      await refundCredits(business.id, images.length);
    } catch (refundErr) {
      console.error(`Failed to refund credits for crashed submission ${submission.id}:`, refundErr);
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
  // Count of images that never got a genuine AI review (the reviewImage()
  // call itself threw and fell back to the synthetic "please resubmit"
  // flag below) — refunded at the end (bug audit #14) so a business isn't
  // charged for a review that didn't actually happen, without needing to
  // track which specific package/credit paid for which image.
  let unreviewedCount = 0;

  // One image's full review → derive-status → store cycle. Called by the
  // worker pool below, potentially several of these in flight at once — see
  // that loop's comment for why sharing `overall` and `submissionId` across
  // concurrent calls is safe.
  async function processOneImage(img: IncomingImage, i: number) {
    let result;
    let reviewFailed = false;
    try {
      // strip a data: URL prefix if present, keep just the base64 payload
      const rawBase64 = img.base64?.includes(",") ? img.base64.split(",")[1] : img.base64;
      result = await reviewImage({
        base64Image: rawBase64,
        mediaType: img.mediaType,
        caption: img.caption,
        filename: img.filename,
      });
      // FIX (bug audit round 2 #10): reviewImage() can return normally
      // (no throw) for a result that never actually called the AI — e.g.
      // the knowledge-base-search-came-up-empty fallback. Route that
      // through the same refund accounting as a thrown error so the
      // business isn't charged for an image whose content was never
      // genuinely inspected.
      if (result.reviewFailed) reviewFailed = true;
    } catch (e: any) {
      console.error(`reviewImage failed for ${img.filename}:`, e);
      reviewFailed = true;
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
    // FIX (bug audit #16): a non-empty flags array whose severity value(s)
    // don't exactly match either recognized string used to fall through to
    // "passed" here — a real blind spot if the model ever returns a
    // severity that's off-enum (typo'd wording, a value from an older
    // prompt version, etc.). The model DID flag something in that case;
    // silently clearing it to "passed" is worse than being cautious about
    // it, so any non-empty, unrecognized-severity flags array now derives
    // to "caution" instead of "passed".
    let derivedStatus: "passed" | "caution" | "violation" = hasViolation
      ? "violation"
      : hasCaution
      ? "caution"
      : result.flags.length > 0
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

    if (reviewFailed) unreviewedCount++;

    // TEMPORARY: store the image inline as a data URL until Cloudflare R2 is
    // enabled and wired up as real object storage. Fine for a demo/low-volume
    // use, but this bloats the database — swap for an R2 URL once available.
    const storedImageUrl = img.base64 && img.mediaType
      ? (img.base64.startsWith("data:") ? img.base64 : `data:${img.mediaType};base64,${img.base64}`)
      : "https://storage.adcheck.app/demo/" + encodeURIComponent(img.filename);

    // FIX (bug audit #4): these writes used to be unguarded — an exception
    // here (a transient DB error, a constraint violation) rejected the
    // shared Promise.all in the worker pool below, which the outer .catch
    // in POST then turned into marking the WHOLE submission 'failed', even
    // if every other image in the batch had already been reviewed and
    // saved successfully. Now a write failure for one image is logged and
    // that image's result is simply missing from the results page, instead
    // of nuking the entire batch's outcome.
    try {
      // FIX (bug audit round 2 #6): filename/caption are user-supplied free
      // text and Postgres text columns reject a raw NUL byte outright — the
      // same class of incident already handled for the knowledge base and
      // issue-report forms (see lib/validation.ts:stripNulBytes) was never
      // applied here, so a NUL in either field would throw inside this
      // try/catch, silently dropping the image from the results with no
      // credit refund even though the review itself had already succeeded.
      const cleanFilename = stripNulBytes(img.filename);
      const cleanCaption = img.caption ? stripNulBytes(img.caption) : img.caption;
      const [savedImage] = await sql`
        INSERT INTO submission_images (submission_id, image_url, filename, caption, status, sort_order)
        VALUES (${submissionId}, ${storedImageUrl}, ${cleanFilename}, ${cleanCaption || null}, ${result.status}, ${i})
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
    } catch (e) {
      console.error(`Failed to save review results for ${img.filename} (submission ${submissionId}):`, e);
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

  // FIX (bug audit round 2 #3): this UPDATE used to have no WHERE-status
  // guard and no try/catch of its own. If it threw (a transient DB blip)
  // AFTER every image in the batch had already been genuinely reviewed and
  // saved (the per-image try/catch above already committed those rows),
  // the exception used to propagate up to the POST handler's outer
  // `.catch`, which marks the WHOLE submission 'failed' and refunds EVERY
  // reserved credit — over-refunding (most images really were reviewed)
  // while burying real, already-saved results behind a 'failed' status.
  //
  // It's also the same statement that, unguarded, could resurrect a
  // submission the watchdog in app/api/submissions/[id]/status/route.ts
  // had already marked 'failed' (and refunded credits_used for) if this
  // background loop was just slow rather than actually dead — flipping it
  // back to a "completed" status the customer was already refunded for.
  //
  // The `AND status = 'processing'` guard makes this a no-op once the
  // watchdog has won that race, so a slow-but-not-dead run can never
  // resurrect an already-refunded submission. Catching locally (instead of
  // letting a real DB error propagate) means a transient failure here no
  // longer triggers an immediate, wrong-amount refund — the submission
  // simply stays 'processing' and the SAME watchdog picks it up on the next
  // status poll, marking it 'failed' and refunding credits_used exactly
  // once, consistently, instead of this function computing its own
  // (in this failure case, incorrect) refund amount.
  let statusUpdated = false;
  try {
    const [row] = (await sql`
      UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
      WHERE id = ${submissionId} AND status = 'processing'
      RETURNING id
    `) as any[];
    statusUpdated = Boolean(row);
  } catch (e) {
    console.error(
      `Failed to set final status for submission ${submissionId} (images/flags were already saved successfully — the watchdog in .../status/route.ts will settle this submission's status and refund on the next poll):`,
      e
    );
  }

  // Credits for this submission were already reserved atomically up front
  // (reserveCredits, called from POST above, before this function ever
  // ran) — see lib/credits.ts for why that replaced the old
  // check-then-deduct-later pattern. All that's left to settle here is
  // giving back credits for any image that never got a genuine AI review
  // (bug audit #14) — a resubmit after an AI outage shouldn't be a second
  // full charge on top of the first.
  //
  // Only when THIS run's own status update actually landed (statusUpdated):
  // if the watchdog beat us to 'failed' above, it already refunded the full
  // credits_used amount for this submission — refunding unreviewedCount on
  // top of that would double-refund the images that individually failed
  // review.
  if (statusUpdated && unreviewedCount > 0) {
    await refundCredits(business.id, unreviewedCount);
  }
}
