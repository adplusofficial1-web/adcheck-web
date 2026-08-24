export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { getDemoBusiness, sql } from "@/lib/db";

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
  const [submission] = await sql`SELECT id FROM submissions WHERE id = ${params.id}`;
  if (!submission) notFound();

  const business = await getDemoBusiness();

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
