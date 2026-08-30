import { sql, getOrCreateAutomationBusiness } from "@/lib/db";
import { reviewImage } from "@/lib/reviewImage";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { MAX_FILE_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from "@/lib/uploadLimits";
import { stripNulBytes } from "@/lib/validation";

// Shared core of "review one ad image given only its public URL", used by
// two callers:
//   - app/api/automation/check-ad/route.ts — the external n8n-facing HTTP
//     endpoint (x-api-key auth), unchanged in behavior after this
//     extraction.
//   - app/api/admin/hunter/[id]/run/route.ts — the admin "run automation"
//     button for a Hunter lead, calling this directly in-process rather
//     than making an HTTP round-trip back into this same Next.js app
//     (which would need a hardcoded domain and the shared secret just to
//     talk to itself).
//
// Pulled out of check-ad/route.ts verbatim (same fetch/size/content-type
// checks, same reviewImage() call, same flags/status derivation, same
// credit reserve/refund accounting against the shared "AdCheck Automation
// (Internal)" business) so results from either caller are identical and
// indistinguishable in the database afterward — see that route's own
// comment for the full reasoning behind each step.

export type CheckAdResult = {
  submissionId: string;
  resultUrl: string;
  status: "passed" | "caution" | "violation";
  flags: any[];
};

export class CheckAdError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function checkAdImageUrl(
  imageUrl: string,
  opts?: { caption?: string }
): Promise<CheckAdResult> {
  const caption = opts?.caption ? stripNulBytes(opts.caption) : undefined;

  // --- Fetch the image server-side ---------------------------------------
  let fetchRes: Response;
  try {
    fetchRes = await fetch(imageUrl);
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
  const mediaType = contentType;

  // --- Resolve the internal automation business ---------------------------
  const business = await getOrCreateAutomationBusiness();
  if (!business) {
    console.error("getOrCreateAutomationBusiness() returned no row");
    throw new CheckAdError("internal_error", 500);
  }

  // --- Reserve 1 credit, same accounting as app/api/submissions/route.ts --
  const reserved = await reserveCredits(business.id, 1);
  if (!reserved) {
    throw new CheckAdError("insufficient credits", 402);
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
    console.error("Failed to create submission row after reserving credits:", e);
    await refundCredits(business.id, 1);
    throw new CheckAdError("internal_error", 500);
  }

  // --- Review synchronously ------------------------------------------------
  let result: any;
  let reviewFailed = false;
  try {
    result = await reviewImage({ base64Image, mediaType, caption, filename });
    if (result.reviewFailed) reviewFailed = true;
  } catch (e: any) {
    console.error(`reviewImage failed for automation submission ${submission.id}:`, e);
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
      `reviewImage returned status "${result.status}" with zero flags for automation submission ${submission.id} — keeping as "${derivedStatus}" with a synthetic review flag instead of downgrading to "passed"`
    );
  } else if (result.status !== derivedStatus) {
    console.warn(
      `reviewImage status/flags mismatch for automation submission ${submission.id}: model said "${result.status}", derived "${derivedStatus}" from ${result.flags.length} flag(s)`
    );
  }
  result.status = derivedStatus;

  // --- Store the image + flags ----------------------------------------------
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

  const finalStatus = result.status === "passed" ? "passed" : "needs_review";
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
    status: result.status,
    flags: result.flags,
  };
}
