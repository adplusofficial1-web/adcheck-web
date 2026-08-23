import { NextResponse } from "next/server";
import { sql, getDemoBusiness } from "@/lib/db";
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

  const business = await getDemoBusiness();
  if (!business) {
    return NextResponse.json({ error: "demo business not found" }, { status: 500 });
  }
  if (business.credits_remaining < images.length) {
    return NextResponse.json({ error: "insufficient credits" }, { status: 402 });
  }

  const [submission] = await sql`
    INSERT INTO submissions (business_id, status, credits_used, rules_version_ref)
    VALUES (${business.id}, 'processing', ${images.length}, 'คู่มือ สบส. ฉบับปรับปรุง 7 เม.ย. 2569')
    RETURNING id, share_token
  `;

  let overall: "passed" | "caution" | "violation" = "passed";
  const errors: string[] = [];

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
      errors.push(`${img.filename}: ${e.message}`);
      result = { status: "caution" as const, confidence: 0, flags: [] };
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
    const derivedStatus: "passed" | "caution" | "violation" = hasViolation
      ? "violation"
      : hasCaution
      ? "caution"
      : "passed";
    if (result.status !== derivedStatus) {
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
      VALUES (${submission.id}, ${storedImageUrl}, ${img.filename}, ${img.caption || null}, ${result.status}, ${i})
      RETURNING id
    `;

    for (const f of result.flags) {
      if (!f || !f.quoted_text) continue;
      await sql`
        INSERT INTO review_flags (submission_id, submission_image_id, quoted_text, category, legal_ref, severity, confidence_level, explanation, detailed_explanation)
        VALUES (${submission.id}, ${savedImage.id}, ${f.quoted_text}, ${f.category ?? null}, ${f.legal_ref ?? null}, ${f.severity ?? "ควรระวัง"}, ${f.confidence_level ?? "ปานกลาง"}, ${f.topic ?? null}, ${f.detailed_explanation ?? null})
      `;
    }
  }

  const finalStatus = overall === "passed" ? "passed" : "needs_review";

  await sql`
    UPDATE submissions SET status = ${finalStatus}, ai_confidence = 90, completed_at = now()
    WHERE id = ${submission.id}
  `;
  await sql`
    UPDATE businesses SET credits_remaining = credits_remaining - ${images.length}, updated_at = now()
    WHERE id = ${business.id}
  `;

  return NextResponse.json({ id: submission.id, errors: errors.length ? errors : undefined });
}
