-- Adds "รายงานปัญหา" (issue reports) — lets a signed-in business pick one
-- or more problem categories (checklist) from /report-problem, give a
-- required detail per category picked, and optionally add one overall
-- message. Submissions land in a dedicated admin inbox at /admin/reports
-- (see components/admin/IssueReportsManager.tsx) — kept as its own admin
-- tab rather than folded into /admin/marketing, which already exists as
-- an unrelated professional-association outreach tracker (see
-- lib/marketingAssociations.ts) and would only get confusing if the two
-- were mixed on one page.
--
-- STATUS: already applied to the real production Neon project (adcheck,
-- project id withered-queen-25872868) directly via the Neon MCP
-- connection during this session — this file is kept in the repo purely
-- as a record / for local dev database setup, NOT something that still
-- needs to be run against production.

CREATE TABLE issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Snapshot of the reporting business's contact email at submission time
  -- (business.contact_email can change later) — lets an admin reply
  -- without having to separately look up the business row.
  contact_email text,
  -- One entry per category the user checked: [{category, label, detail}].
  -- `label` is stored alongside `category` (the stable id) so the admin
  -- inbox always shows exactly the Thai text the user saw, even if the
  -- category list in lib/issueReports.ts is reworded or reordered later.
  items jsonb NOT NULL,
  -- Optional free-text note in addition to the required per-category
  -- details above — for anything that doesn't fit a specific category.
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_issue_reports_status ON issue_reports (status, created_at DESC);
CREATE INDEX idx_issue_reports_business ON issue_reports (business_id);
