export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";

/**
 * Real-time "กำลังตรวจสอบภาพ" page. UploadForm redirects here immediately
 * after POST /api/submissions returns { id } (the background review loop
 * is still running server-side at that point — see
 * app/api/submissions/route.ts). ProcessingScreen polls
 * GET /api/submissions/[id]/status and this page hands off to
 * /results/[id] once that reports something other than "processing".
 */
export default async function ProcessingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { files?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  // Scoped to every business id this session may act on — itself, plus any
  // clinic it manages in Agency mode (see lib/agency.ts) — from the query
  // itself (rather than fetching by id and checking afterward) so a
  // signed-in user can never even learn whether a submission id belonging
  // to a business it can't access exists at all.
  const accessibleIds = await getAccessibleBusinessIds(business.id);
  const [submission] = await sql`
    SELECT id FROM submissions WHERE id = ${params.id} AND business_id = ANY(${accessibleIds}::uuid[])
  `;
  if (!submission) notFound();

  // UploadForm passes the original filenames it already has in memory via
  // ?files=<JSON array>, so this page can render every image slot
  // (including ones the background loop hasn't reached yet) without the DB
  // needing to know about not-yet-processed images at all. Falls back to a
  // plain placeholder list if the param is missing/malformed (e.g. someone
  // links to this page directly) so the screen still renders sensibly.
  let imageFilenames: string[] = [];
  try {
    const parsed = searchParams.files ? JSON.parse(searchParams.files) : [];
    if (Array.isArray(parsed) && parsed.every((f) => typeof f === "string")) {
      imageFilenames = parsed;
    }
  } catch {
    // ignore malformed input, fall through to the placeholder below
  }
  if (imageFilenames.length === 0) {
    imageFilenames = ["ภาพที่ 1"];
  }

  return (
    <ProcessingScreen
      submissionId={params.id}
      imageFilenames={imageFilenames}
      creditsRemaining={business?.credits_remaining ?? 0}
    />
  );
}
