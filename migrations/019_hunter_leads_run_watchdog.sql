-- Hunter queue: run watchdog + auto-fill attempt bookkeeping (2569-09-02,
-- Bug Audit 4 — see the project doc "Bug Audit Findings 4" and the
-- corresponding lib/hunterLeads.ts / scripts/hunterAutoFillJob.ts changes).
--
-- run_started_at: stamped by lib/hunterLeads.ts:markHunterLeadRunning at the
-- exact moment a lead flips to status='running'. Before this column, a lead
-- whose run was interrupted mid-flight (Render restart, request timeout,
-- cron process OOM-killed — see the memory notes in
-- scripts/hunterAutoFillJob.ts) stayed 'running' FOREVER: the UI hides the
-- run/delete buttons while running, and neither the manual button nor the
-- cron would ever touch it again. recoverStaleRunningLeads (same file) now
-- uses this to flip any lead 'running' for longer than a sane ceiling back
-- to 'failed' with a clear Thai last_error, so the admin can just re-run it.
-- Nullable: existing rows (and rows that never ran) legitimately have none.
ALTER TABLE hunter_leads
  ADD COLUMN IF NOT EXISTS run_started_at TIMESTAMPTZ;

-- auto_fill_attempts / auto_fill_last_attempt_at: written by
-- scripts/hunterAutoFillJob.ts after EVERY attempt to find a lead's images
-- (whether or not it found any). Before these columns, the cron selected
-- "status='awaiting_images' ORDER BY created_at ASC LIMIT 5" every run — so
-- the same 5 oldest leads that Facebook's Ad Library has no images for were
-- retried on every single run, forever, and every lead behind them in the
-- queue starved and never got a first attempt at all. The selection now
-- skips leads already tried 3 times and leads tried within the last 24h,
-- and orders by least-recently-attempted first, so the whole queue gets a
-- fair rotation. NOT NULL DEFAULT 0 so existing rows count as "never
-- tried" and get picked up normally.
ALTER TABLE hunter_leads
  ADD COLUMN IF NOT EXISTS auto_fill_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE hunter_leads
  ADD COLUMN IF NOT EXISTS auto_fill_last_attempt_at TIMESTAMPTZ;
