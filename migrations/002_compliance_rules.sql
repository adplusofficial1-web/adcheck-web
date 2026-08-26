-- Adds the "คลังความรู้" (compliance knowledge base) that lib/reviewImage.ts
-- now reads from instead of the old hardcoded RULES_CONTEXT string.
--
-- STATUS: already applied to the real production Neon project (adcheck,
-- project id withered-queen-25872868, branch br-rough-darkness-a62cbmag)
-- directly via the Neon MCP connection during this session — this file is
-- kept in the repo purely as a record / for local dev database setup, NOT
-- as something that still needs to be run against production. If setting
-- up a fresh local/dev database, run this file (and 003_seed_...sql) once.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  content text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'upload')),
  source_filename text,
  -- Rules that apply to every image regardless of context-search relevance
  -- (e.g. the PDPA before/after consent requirement). See
  -- lib/complianceRules.ts:searchComplianceRules().
  always_include boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  -- Admin's email (from ADMIN_EMAILS / next-auth session) — audit trail of
  -- who added/edited each rule. Nullable because seed rows inserted
  -- directly via SQL have no admin session to attribute to.
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Generated column, not a trigger: guarantees the search index can never
  -- go stale relative to title/category/content, with zero application
  -- code needed to keep it in sync.
  search_blob text GENERATED ALWAYS AS (
    title || ' ' || coalesce(category, '') || ' ' || content
  ) STORED
);

CREATE INDEX idx_compliance_rules_active ON compliance_rules (is_active);

-- pg_trgm (not to_tsvector/tsquery): Thai has no spaces between words, so
-- Postgres's built-in full-text search can't tokenize it into meaningful
-- lexemes without a Thai-specific search config, which Neon doesn't ship.
-- word_similarity() works on raw character trigrams instead, so it needs
-- no tokenizer and handles Thai (and mixed Thai/English/number captions,
-- which is what ad copy usually is) equally well. See
-- lib/complianceRules.ts:searchComplianceRules() for the query that uses
-- this index, and the comment there for a real accuracy sample.
CREATE INDEX idx_compliance_rules_search_trgm ON compliance_rules USING gin (search_blob gin_trgm_ops);
