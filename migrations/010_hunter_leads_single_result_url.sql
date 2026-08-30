-- CHANGE (2026-08-31): a Hunter lead's up-to-3 images used to each get
-- reviewed as their own separate `submissions` row, so hunter_leads kept a
-- result_urls TEXT[] (one share link per image). The Hunter admin UI now
-- shows ONE combined "ดูผลตรวจสอบ" link per lead instead — the automation
-- run (lib/automationCheckAd.ts:checkAdImageUrls) puts all of a lead's
-- images into a single shared `submissions` row, so there is only ever one
-- share link per lead now. Replace the array column with a single nullable
-- TEXT column to match.
ALTER TABLE hunter_leads ADD COLUMN IF NOT EXISTS result_url TEXT;

-- Best-effort carry-forward for any lead that already has old-style
-- per-image result_urls: keep the first one so existing 'done' leads still
-- show *a* result link rather than going blank. (In practice, as of this
-- migration, all Hunter test data has already been cleaned out of
-- production — see prior audit notes — so this UPDATE is expected to
-- affect 0 rows, but is safe/idempotent either way.)
UPDATE hunter_leads
SET result_url = result_urls[1]
WHERE result_url IS NULL AND array_length(result_urls, 1) > 0;

ALTER TABLE hunter_leads DROP COLUMN IF EXISTS result_urls;
