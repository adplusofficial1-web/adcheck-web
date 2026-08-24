import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";

// Three separate belt-and-suspenders opt-outs, because any one alone left
// this route serving a stale, frozen snapshot for a submission id polled
// while it was still "processing":
// - dynamic: without this, Next's App Router can statically cache this
//   route handler's own response the first time a given URL is hit.
// - fetchCache: the `sql` tagged-template calls below (lib/db.ts, via
//   @neondatabase/serverless's neon()) run over HTTP fetch() under the
//   hood — Next's fetch Data Cache can cache THAT inner request too,
//   independently of the route-level dynamic setting above.
// - noStore(): an explicit runtime opt-out of all caching for this
//   request, as a final guarantee regardless of which layer above catches
//   it (or doesn't).
// Net effect: every poll always re-reads current DB state, so imagesDone
// and status reflect what the background review loop in ../../route.ts
// has actually written, not whatever the first poll happened to see.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
  noStore();

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
  return NextResponse.json(
    {
      id: submission.id,
      status: submission.status as "processing" | "passed" | "needs_review" | "failed",
      imagesTotal: submission.credits_used as number,
      imagesDone: doneImages.length,
      doneImages,
    },
    // Explicit response header as a final, framework-independent guarantee
    // that nothing between this server and the browser (a CDN, a proxy)
    // caches a "processing" snapshot past the moment it's actually true.
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
