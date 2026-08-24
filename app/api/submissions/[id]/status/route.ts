export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/submissions/:id/status
 ...

/**
 * GET /api/submissions/:id/status
 *
 * Cheap, read-only polling endpoint for the Processing screen
 * (components/ProcessingScreen.tsx). Reports how far the background review
 * loop in app/api/submissions/route.ts has gotten by reading what it has
 * already written to the DB — it does not do any AI work itself, so it's
 * safe to call every ~1.5s from every viewer of the processing page.
 *
 * `submission_images` rows are inserted one at a time, in `sort_order`, only
 * once that image's review has fully completed (see processSubmissionImages
 * in ../../route.ts) — so `imagesDone` is simply how many rows exist so far,
 * with no separate "in progress" DB state needed. The client already knows
 * the full original filename list (passed via the URL when it redirected
 * here from the upload form) and derives which single image is "currently
 * processing" vs "still queued" from that count — this endpoint doesn't
 * need to know the filenames of images that haven't finished yet.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [submission] = await sql`
    SELECT id, status, credits_used
    FROM submissions
    WHERE id = ${params.id}
  `;

  if (!submission) {
    return NextResponse.json({ error: "submission not found" }, { status: 404 });
  }

  const doneImages = (await sql`
    SELECT filename, status
    FROM submission_images
    WHERE submission_id = ${params.id}
    ORDER BY sort_order ASC
  `) as { filename: string; status: string }[];

  // submissions.status starts as 'processing' and is set to 'passed',
  // 'needs_review', or 'failed' once processSubmissionImages finishes (or
  // crashes) — see app/api/submissions/route.ts.
  return NextResponse.json({
    id: submission.id,
    status: submission.status as "processing" | "passed" | "needs_review" | "failed",
    imagesTotal: submission.credits_used as number,
    imagesDone: doneImages.length,
    doneImages,
  });
}
