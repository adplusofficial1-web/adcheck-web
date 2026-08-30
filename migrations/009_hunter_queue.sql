-- Admin > Marketing > Hunter (app/admin/marketing/hunter/page.tsx) — moves
-- the "hunter_queue" that used to live only in one browser's localStorage
-- (components/admin/HunterImport.tsx before this migration) into a real
-- table, so every admin sees the same queue and the automation pipeline
-- (app/api/admin/hunter/[id]/run/route.ts) has something server-side to
-- read and write back to.
--
-- One row per CLINIC LEAD (not per image) — a lead can hold up to 3 image
-- URLs (image_urls, see the check constraint below) that Hunter fills in
-- as they find them, plus the automation's own progress once triggered.
-- This is deliberately NOT the same table as `submissions`/
-- `submission_images` (the real customer-facing review tables) — a Hunter
-- lead is a prospecting target, not a paying business, and mixing the two
-- would make every customer-facing query (dashboard counts, admin
-- reports, etc.) need to filter out prospecting noise. Where the AI
-- review DOES happen (via /api/automation/check-ad), each image still
-- produces a completely normal `submissions` row under the shared
-- "AdCheck Automation (Internal)" business (lib/db.ts:getOrCreateAutomationBusiness)
-- — this table just remembers the resulting share links per lead so
-- Hunter/QC can see them in one place instead of hunting through that
-- business's submission history.
CREATE TABLE IF NOT EXISTS hunter_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_name TEXT NOT NULL,
    province TEXT,
    -- The clinic's own page/post link Hunter is working from — NOT the
    -- image URLs themselves (see image_urls below). Optional: an
    -- Excel-imported row may arrive with only a clinic name and no link
    -- yet, same as the pre-migration localStorage shape.
    source_link TEXT,
    -- Up to 3 direct image URLs Hunter has found so far, filled in
    -- gradually (0, 1, 2, then 3) as they work the lead — see the CHECK
    -- constraint below for the cap. Direct URLs only (e.g. a CDN link to
    -- one photo), never a page URL — see HunterImport.tsx's per-lead
    -- image-URL inputs for how these get typed in one at a time.
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    -- Free-text note, same field the original localStorage row had.
    note TEXT,
    -- Coarse lifecycle for this lead:
    --   'awaiting_images'  — imported, Hunter still needs to find images
    --                        (this is every row on import, matching the
    --                        original "รอ Hunter ดึงรูป" queue label)
    --   'ready'            — Hunter has filled in >=1 image_urls, ready
    --                        for someone to trigger the automation run
    --   'running'          — the automation route is currently mid-flight
    --                        for this lead (set right before the first
    --                        /api/automation/check-ad call, cleared to
    --                        'done'/'failed' after — see the run route)
    --   'done'             — every image_urls entry has a result in
    --                        result_urls
    --   'failed'           — the automation run hit an unrecoverable
    --                        error partway (see last_error) — image_urls/
    --                        result_urls are left as-is so a retry only
    --                        redoes the images that don't have a result
    --                        yet, not the whole lead
    status TEXT NOT NULL DEFAULT 'awaiting_images'
        CHECK (status IN ('awaiting_images', 'ready', 'running', 'done', 'failed')),
    -- Public adcheck.pro/share/{token} links, one per completed
    -- image_urls entry, same order — see app/api/admin/hunter/[id]/run/route.ts.
    -- Shorter than image_urls whenever some images haven't been reviewed
    -- yet (still running, or a partial failure) rather than padded with
    -- nulls, so `array_length(result_urls, 1)` is always "how many are
    -- actually done".
    result_urls TEXT[] NOT NULL DEFAULT '{}',
    -- Set when status='failed' — the automation route's own error message
    -- for whichever image it was working on when it stopped, so an admin
    -- retrying doesn't have to go spelunking through Render logs to see
    -- why.
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hunter_leads_image_urls_max3 CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 3)
);

CREATE INDEX IF NOT EXISTS hunter_leads_status_idx ON hunter_leads (status);
CREATE INDEX IF NOT EXISTS hunter_leads_created_at_idx ON hunter_leads (created_at DESC);
