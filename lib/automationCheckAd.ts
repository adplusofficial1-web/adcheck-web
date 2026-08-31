import { sql, getOrCreateAutomationBusiness } from "@/lib/db";
import { reviewImage } from "@/lib/reviewImage";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { MAX_FILE_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from "@/lib/uploadLimits";
import { stripNulBytes } from "@/lib/validation";

// Shared core of "review one or more ad images given only their public
// URLs", used by three callers:
//   - app/api/automation/check-ad/route.ts — the external n8n-facing HTTP
//     endpoint (x-api-key auth), one image in, one submission, unchanged in
//     behavior after this extraction. Uses checkAdImageUrl().
//   - app/api/admin/hunter/[id]/run/route.ts — the admin "run automation"
//     button for a Hunter lead. Uses checkAdImageUrls() so all of a lead's
//     (up to 3) images land in ONE shared submission — see that function's
//     comment for why this changed from one-submission-per-image.
//
// Pulled out of check-ad/route.ts verbatim (same fetch/size/content-type
// checks, same reviewImage() call, same flags/status derivation, same
// credit reserve/refund accounting against the shared "AdCheck Automation
// (Internal)" business) so results from either caller are identical and
// indistinguishable in the database afterward — see that route's own
// comment for the full reasoning behind each step.

// NOTE (2026-08-31): opts.model is optional and defaults to reviewImage()'s
// own default ("claude-sonnet-5") when omitted. checkAdImageUrl() (the
// external n8n / customer-facing endpoint) is called with no model, so it
// keeps using Sonnet 5 unchanged. checkAdImageUrls() (Hunter-only — see the
// caller list above) is passed model: "claude-haiku-4-5" explicitly by both
// its callers, after a side-by-side quality/speed comparison
// (scripts/compareModels.ts) showed Haiku 4.5 acceptable for this
// lower-stakes, internal lead-review path.
export type CheckAdResult = {
  submissionId: string;
  resultUrl: string;
  status: "passed" | "caution" | "violation";
  flags: any[];
};

// One image's outcome inside a multi-image batch (checkAdImageUrls) — same
// per-image status/flags as CheckAdResult, but without its own
// resultUrl/submissionId since a batch shares ONE submission (and hence one
// resultUrl) across every image in it.
export type CheckAdBatchImageResult = {
  imageUrl: string;
  status: "passed" | "caution" | "violation";
  flags: any[];
  failed: boolean; // true if this specific image's fetch/review step failed
};

export type CheckAdBatchResult = {
  submissionId: string;
  resultUrl: string;
  images: CheckAdBatchImageResult[];
};

export class CheckAdError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// --- Internal: fetch one image's bytes over HTTP ------------------------
type FetchedImage = { base64Image: string; mediaType: string; filename: string };

async function fetchImageBytes(imageUrl: string): Promise<FetchedImage> {
  // FIX (found during manual pipeline test, 2026-08-30): a bare fetch()
  // with no User-Agent header gets a flat 400 from at least Wikimedia's
  // CDN (and several other image hosts do the same) — they treat a
  // missing UA as a signal of a low-effort scraper rather than a normal
  // HTTP client, regardless of what the request is actually for. This
  // sends a normal browser-style UA (and Accept) so a legitimate public
  // image URL doesn't get rejected purely on that basis. This does NOT
  // change what this route is legally allowed to fetch — it still only
  // works against a URL that's already publicly servable with no auth;
  // it does nothing to get past login walls, rate limits, or any other
  // access control a host actually enforces.
  let fetchRes: Response;
  try {
    fetchRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });
  } catch {
    throw new CheckAdError("failed to fetch imageUrl", 400);
  }
  if (!fetchRes.ok) {
    throw new CheckAdError(`failed to fetch imageUrl (status ${fetchRes.status})`, 400);
  }

  const contentType = fetchRes.headers.get("content-type")?.split(";")[0]?.trim() || "";
  if (!ALLOWED_MEDIA_TYPES.includes(contentType)) {
    throw new CheckAdError(`unsupported content-type "${contentType}" (JPG, PNG, PDF only)`, 400);
  }

  const declaredLength = fetchRes.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_FILE_SIZE_BYTES) {
    throw new CheckAdError("image exceeds max file size", 400);
  }

  if (!fetchRes.body) {
    throw new CheckAdError("imageUrl returned no body", 400);
  }
  const reader = fetchRes.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FILE_SIZE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // best-effort
        }
        throw new CheckAdError("image exceeds max file size", 400);
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const base64Image = buffer.toString("base64");
  const filename = imageUrl.split("/").pop()?.split("?")[0] || "automation-image";

  return { base64Image, mediaType: contentType, filename };
}

// --- Internal: review one already-fetched image and store it against an
// EXISTING submission row (sort_order lets several images share one
// submission) ------------------------------------------------------------
async function reviewAndStoreImage(
  submissionId: string,
  sortOrder: number,
  fetched: FetchedImage,
  caption: string | undefined,
  model?: string
): Promise<{ status: "passed" | "caution" | "violation"; flags: any[]; reviewFailed: boolean }> {
  const { base64Image, mediaType, filename } = fetched;

  let result: any;
  let reviewFailed = false;
  try {
    result = await reviewImage({ base64Image, mediaType, caption, filename, model });
    if (result.reviewFailed) reviewFailed = true;
  } catch (e: any) {
    console.error(`reviewImage failed for automation submission ${submissionId} image ${sortOrder}:`, e);
    reviewFailed = true;
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

  if (!Array.isArray(result.flags)) result.flags = [];
  result.flags = result.flags.filter((f: any) => f && f.quoted_text);

  const hasViolation = result.flags.some((f: any) => f.severity === "ห้ามเด็ดขาด");
  const hasCaution = result.flags.some((f: any) => f.severity === "ควรระวัง");
  let derivedStatus: "passed" | "caution" | "violation" = hasViolation
    ? "violation"
    : hasCaution
    ? "caution"
    : result.flags.length > 0
    ? "caution"
    : "passed";

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
      `reviewImage returned status "${result.status}" with zero flags for automation submission ${submissionId} image ${sortOrder} — keeping as "${derivedStatus}" with a synthetic review flag instead of downgrading to "passed"`
    );
  } else if (result.status !== derivedStatus) {
    console.warn(
      `reviewImage status/flags mismatch for automation submission ${submissionId} image ${sortOrder}: model said "${result.status}", derived "${derivedStatus}" from ${result.flags.length} flag(s)`
    );
  }
  result.status = derivedStatus;

  const storedImageUrl = `data:${mediaType};base64,${base64Image}`;
  const cleanFilename = stripNulBytes(filename);
  const cleanCaption = caption ? stripNulBytes(caption) : caption;

  try {
    const [savedImage] = await sql`
      INSERT INTO submission_images (submission_id, image_url, filename, caption, status, sort_order)
      VALUES (${submissionId}, ${storedImageUrl}, ${cleanFilename}, ${cleanCaption || null}, ${result.status}, ${sortOrder})
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
        VALUES (${submissionId}, ${savedImage.id}, ${f.quoted_text}, ${f.category ?? null}, ${f.legal_ref ?? null}, ${f.severity ?? "ควรระวัง"}, ${f.confidence_level ?? "ปานกลาง"}, ${f.topic ?? null}, ${combinedExplanation})
      `;
    }
  } catch (e) {
    console.error(`Failed to save review results for automation submission ${submissionId} image ${sortOrder}:`, e);
  }

  return { status: result.status, flags: result.flags, reviewFailed };
}

// --- Public: single image, own submission (external n8n endpoint) -------
export async function checkAdImageUrl(
  imageUrl: string,
  opts?: { caption?: string; model?: string }
): Promise<CheckAdResult> {
  const caption = opts?.caption ? stripNulBytes(opts.caption) : undefined;

  const fetched = await fetchImageBytes(imageUrl);

  const business = await getOrCreateAutomationBusiness();
  if (!business) {
    console.error("getOrCreateAutomationBusiness() returned no row");
    throw new CheckAdError("internal_error", 500);
  }

  const reserved = await reserveCredits(business.id, 1);
  if (!reserved) {
    throw new CheckAdError("insufficient credits", 402);
  }

  let submission;
  try {
    [submission] = await sql`
      INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
      VALUES (${business.id}, 'processing', 1, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
      RETURNING id, share_token
    `;
  } catch (e) {
    console.error("Failed to create submission row after reserving credits:", e);
    await refundCredits(business.id, 1);
    throw new CheckAdError("internal_error", 500);
  }

  const { status, flags, reviewFailed } = await reviewAndStoreImage(submission.id, 0, fetched, caption, opts?.model);

  const finalStatus = status === "passed" ? "passed" : "needs_review";
  try {
    await sql`
      UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
      WHERE id = ${submission.id} AND status = 'processing'
    `;
  } catch (e) {
    console.error(`Failed to set final status for automation submission ${submission.id}:`, e);
  }

  if (reviewFailed) {
    await refundCredits(business.id, 1);
  }

  return {
    submissionId: submission.id,
    resultUrl: `https://adcheck.pro/share/${submission.share_token}`,
    status,
    flags,
  };
}

// --- Public: multiple images, ONE shared submission ----------------------
// Used by the Hunter "run automation" button (app/api/admin/hunter/[id]/run
// /route.ts) so a lead's up-to-3 images land on a single public share page
// (adcheck.pro/share/{token}) instead of one separate link per image — the
// share page (app/share/[token]/page.tsx) already renders every image
// under one submission in one page, so this only needed a batching layer
// here, no changes to that page.
//
// CHANGE (2026-08-31): previously each Hunter image called checkAdImageUrl
// separately, creating 3 submissions/3 share links per lead
// (hunter_leads.result_urls, plural). Replaced with this single-submission
// batch so a lead now has ONE result_url — see migrations/010 and
// lib/hunterLeads.ts for the corresponding schema/column change.
//
// Credits are reserved for the WHOLE batch up front (imageUrls.length, same
// as app/api/submissions/route.ts does for a normal multi-image upload),
// not per image — if reservation fails, nothing runs at all. If fetching
// one particular image fails partway through, that single credit is
// refunded (not the whole batch) and that image is recorded as failed
// (CheckAdBatchImageResult.failed) rather than aborting the remaining
// images — a bad link for image 2 of 3 shouldn't block images 1 and 3 from
// still getting reviewed and shown on the same share page.
export async function checkAdImageUrls(
  imageUrls: string[],
  opts?: { caption?: string; model?: string }
): Promise<CheckAdBatchResult> {
  if (imageUrls.length === 0) {
    throw new CheckAdError("imageUrls must not be empty", 400);
  }
  const caption = opts?.caption ? stripNulBytes(opts.caption) : undefined;

  const business = await getOrCreateAutomationBusiness();
  if (!business) {
    console.error("getOrCreateAutomationBusiness() returned no row");
    throw new CheckAdError("internal_error", 500);
  }

  const reserved = await reserveCredits(business.id, imageUrls.length);
  if (!reserved) {
    throw new CheckAdError("insufficient credits", 402);
  }

  let submission;
  try {
    [submission] = await sql`
      INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
      VALUES (${business.id}, 'processing', ${imageUrls.length}, 'คู่มือและประกาศ สบส./อย. ที่เกี่ยวข้อง')
      RETURNING id, share_token
    `;
  } catch (e) {
    console.error("Failed to create submission row after reserving credits:", e);
    await refundCredits(business.id, imageUrls.length);
    throw new CheckAdError("internal_error", 500);
  }

  const images: CheckAdBatchImageResult[] = [];
  let unreviewedCount = 0;

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    try {
      const fetched = await fetchImageBytes(imageUrl);
      const { status, flags, reviewFailed } = await reviewAndStoreImage(submission.id, i, fetched, caption, opts?.model);
      if (reviewFailed) unreviewedCount++;
      images.push({ imageUrl, status, flags, failed: false });
    } catch (e) {
      // A single image's fetch failing (bad/expired link, unsupported
      // content-type, etc.) shouldn't sink the other images already
      // reserved/paid-for in this same batch — record it and refund just
      // this one credit, same as app/api/submissions/route.ts refunds
      // per-unreviewed-image rather than all-or-nothing.
      const message = e instanceof CheckAdError ? e.message : "internal_error";
      console.error(`checkAdImageUrls: image ${i} ("${imageUrl}") failed for submission ${submission.id}:`, e);
      unreviewedCount++;
      images.push({ imageUrl, status: "caution", flags: [], failed: true });
    }
  }

  const overallStatus: "passed" | "caution" | "violation" = images.some((i) => i.status === "violation")
    ? "violation"
    : images.some((i) => i.status === "caution")
    ? "caution"
    : "passed";

  const finalStatus = overallStatus === "passed" ? "passed" : "needs_review";
  try {
    await sql`
      UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
      WHERE id = ${submission.id} AND status = 'processing'
    `;
  } catch (e) {
    console.error(`Failed to set final status for automation submission ${submission.id}:`, e);
  }

  if (unreviewedCount > 0) {
    await refundCredits(business.id, unreviewedCount);
  }

  return {
    submissionId: submission.id,
    resultUrl: `https://adcheck.pro/share/${submission.share_token}`,
    images,
  };
}
