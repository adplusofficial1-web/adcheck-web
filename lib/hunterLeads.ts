import { sql } from "@/lib/db";

// Admin > Marketing > Hunter's server-side queue — see
// migrations/009_hunter_queue.sql for the full table design writeup and
// why this is a separate table from `submissions`/`submission_images`
// rather than reusing them, and migrations/010_hunter_leads_single_result_url.sql
// for why result_url is a single column, not an array.

export type HunterLeadStatus = "awaiting_images" | "ready" | "running" | "done" | "failed";

export type HunterLead = {
  id: string;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  image_urls: string[];
  note: string | null;
  status: HunterLeadStatus;
  result_url: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const ALLOWED_STATUS: HunterLeadStatus[] = ["awaiting_images", "ready", "running", "done", "failed"];

export function isHunterLeadStatus(v: unknown): v is HunterLeadStatus {
  return typeof v === "string" && (ALLOWED_STATUS as string[]).includes(v);
}

// Every lead, newest first — matches the "คิวที่ส่งแล้ว" table's original
// [...queue].reverse() ordering from the localStorage-only version.
export async function listHunterLeads(): Promise<HunterLead[]> {
  const rows = await sql`SELECT * FROM hunter_leads ORDER BY created_at DESC`;
  return rows as HunterLead[];
}

// Bulk-insert straight from the Excel-import preview (HunterImport.tsx) —
// one row per parsed clinic, status always starts 'awaiting_images' since
// none of them have image_urls yet at this point. Returns how many rows
// were actually created.
export async function importHunterLeads(
  rows: { clinic: string; province: string; link: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  // Plain sequential inserts rather than a single multi-row INSERT — the
  // Excel import batch is at most a few hundred rows (typical Hunter
  // lead-list size), so this isn't a hot path worth the extra query-
  // building complexity of a bulk VALUES statement.
  for (const r of rows) {
    await sql`
      INSERT INTO hunter_leads (clinic_name, province, source_link, status)
      VALUES (${r.clinic}, ${r.province || null}, ${r.link || null}, 'awaiting_images')
    `;
    inserted++;
  }
  return inserted;
}

// Hunter filling in image URLs (and/or a note) for a lead they're
// actively working — up to 3 (enforced by the DB CHECK constraint, see
// migration).
//
// Status handling:
//   - 'awaiting_images' -> 'ready' the moment the first image URL lands,
//     so the admin "run automation" list only ever shows leads that
//     actually have something to review.
//   - 'running' is left alone — editing urls mid-run shouldn't be
//     possible from the UI anyway (the run button disables while
//     running), but if it somehow happens, don't fight the in-flight run.
//   - 'done'/'failed' -> 'ready', clearing result_url/last_error,
//     whenever the edited image_urls array no longer matches what's
//     already in image_urls. This matters because a lead's images are
//     now reviewed together as ONE batch (checkAdImageUrls) producing
//     ONE result_url — if Hunter swaps out any image for a different
//     URL, the old combined result would silently describe the wrong
//     set of images without this reset.
export async function updateHunterLeadImages(
  id: string,
  imageUrls: string[],
  note?: string
): Promise<HunterLead | null> {
  const [existing] = (await sql`
    SELECT status, image_urls FROM hunter_leads WHERE id = ${id}
  `) as { status: HunterLeadStatus; image_urls: string[] }[];
  if (!existing) return null;

  const urlsChanged = JSON.stringify(existing.image_urls) !== JSON.stringify(imageUrls);

  let nextStatus: HunterLeadStatus = existing.status;
  let clearResult = false;
  if (existing.status === "awaiting_images" && imageUrls.length > 0) {
    nextStatus = "ready";
  } else if ((existing.status === "done" || existing.status === "failed") && urlsChanged) {
    nextStatus = imageUrls.length > 0 ? "ready" : "awaiting_images";
    clearResult = true;
  }

  const [row] = clearResult
    ? await sql`
        UPDATE hunter_leads
        SET image_urls = ${imageUrls}, note = COALESCE(${note ?? null}, note), status = ${nextStatus},
            result_url = NULL, last_error = NULL, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
    : await sql`
        UPDATE hunter_leads
        SET image_urls = ${imageUrls}, note = COALESCE(${note ?? null}, note), status = ${nextStatus}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
  return (row as HunterLead) ?? null;
}

// --- Automation run bookkeeping -----------------------------------------
// Called by app/api/admin/hunter/[id]/run/route.ts around each phase of a
// run. Kept as small, obviously-named functions rather than one generic
// "updateStatus" so each call site at the route reads as exactly what's
// happening.
//
// CHANGE (2026-08-31): a lead's images are now reviewed together as ONE
// batch (lib/automationCheckAd.ts:checkAdImageUrls) producing ONE
// result_url, rather than one-result-per-image appended as the run
// progresses — so there's no more partial "2 of 3 appended so far" state
// to persist mid-run. The run route now calls markHunterLeadRunning, then
// either markHunterLeadDone(id, resultUrl) or markHunterLeadFailed once,
// after the whole batch settles.

export async function markHunterLeadRunning(id: string): Promise<void> {
  await sql`UPDATE hunter_leads SET status = 'running', last_error = NULL, updated_at = now() WHERE id = ${id}`;
}

export async function markHunterLeadDone(id: string, resultUrl: string): Promise<void> {
  await sql`
    UPDATE hunter_leads
    SET status = 'done', result_url = ${resultUrl}, last_error = NULL, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markHunterLeadFailed(id: string, errorMessage: string): Promise<void> {
  await sql`UPDATE hunter_leads SET status = 'failed', last_error = ${errorMessage}, updated_at = now() WHERE id = ${id}`;
}

export async function getHunterLead(id: string): Promise<HunterLead | null> {
  const [row] = await sql`SELECT * FROM hunter_leads WHERE id = ${id}`;
  return (row as HunterLead) ?? null;
}
