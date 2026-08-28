import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";
import { isValidUuid } from "@/lib/validation";

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

  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "submission not found" }, { status: 404 });
  }

  // Scoped to every business id this session may act on — itself, plus any
  // clinic it manages in Agency mode (see lib/agency.ts) — from the query
  // itself. This endpoint previously had no ownership check, so any
  // signed-in user who guessed a submission id could poll another
  // business's in-progress review.
  const accessibleIds = await getAccessibleBusinessIds(business.id);
  let [submission] = (await sql`
    SELECT id, status, credits_used, created_at
    FROM submissions
    WHERE id = ${params.id} AND business_id = ANY(${accessibleIds}::uuid[])
  `) as any[];

  if (!submission) {
    return NextResponse.json({ error: "submission not found" }, { status: 404 });
  }

  // FIX (bug audit #3): the background review loop
  // (processSubmissionImages in ../../route.ts) runs fire-and-forget after
  // the POST response is sent — if the Node process restarts/crashes mid-
  // review (a deploy, an OOM, a host restart), nothing ever flips this row
  // out of 'processing', and the Processing screen
  // (components/ProcessingScreen.tsx) polls forever with no way to
  // recover. Self-heal here instead of adding new infrastructure (a job
  // queue, a cron sweep): any poll that finds a 'processing' row older
  // than a generous timeout — well past how long even a full
  // MAX_UPLOAD_IMAGES-image batch should ever take — flips it to 'failed'
  // right in this read path, so the client's existing "ล้มเหลว" handling
  // takes over on its very next poll instead of spinning indefinitely.
  const STALE_PROCESSING_MINUTES = 5;
  if (submission.status === "processing") {
    const ageMs = Date.now() - new Date(submission.created_at).getTime();
    if (ageMs > STALE_PROCESSING_MINUTES * 60 * 1000) {
      const [updated] = (await sql`
        UPDATE submissions SET status = 'failed'
        WHERE id = ${submission.id} AND status = 'processing'
        RETURNING id, status, credits_used, created_at
      `) as any[];
      if (updated) {
        submission = updated;
      } else {
        // The UPDATE matched 0 rows — status changed between the SELECT
        // above and this UPDATE (e.g. it finished a beat before this ran).
        // Re-read rather than assume 'failed' or keep the stale in-memory
        // 'processing' value, so a real terminal status is never clobbered
        // or misreported.
        [submission] = (await sql`
          SELECT id, status, credits_used, created_at FROM submissions WHERE id = ${submission.id}
        `) as any[];
      }
    }
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
