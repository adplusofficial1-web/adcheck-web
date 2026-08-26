import { sql } from "@/lib/db";

// Data access + retrieval for the "คลังความรู้" (compliance knowledge base)
// that reviewImage.ts now reads from instead of the old hardcoded
// RULES_CONTEXT string. See migrations/002_compliance_rules.sql for the
// schema this file assumes (already applied to the production Neon
// project — see that file's header comment).
//
// source_file_base64/source_file_mime (added later, see
// migrations/004_add_source_file_columns.sql) hold the ORIGINAL uploaded
// document bytes (base64-encoded) so an admin can re-download exactly what
// was uploaded — separate from `content`, which is the extracted text used
// for search/review. Stored as base64 TEXT rather than a `bytea` column on
// purpose: it avoids any ambiguity in how @neondatabase/serverless
// serializes binary columns over its HTTP protocol, at the cost of ~33%
// more storage — fine for legal documents, typically well under a few MB.
// Every query below spells out its column list explicitly (never `SELECT
// *`) so these two potentially-large columns are only ever fetched by
// getComplianceRuleFile(), used solely by the download route — listing or
// searching the knowledge base never has to move multi-megabyte blobs.

export type ComplianceRule = {
  id: string;
  title: string;
  category: string | null;
  content: string;
  source_type: "manual" | "upload";
  source_filename: string | null;
  has_file: boolean;
  always_include: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ComplianceRuleMatch = ComplianceRule & { score: number };

// ---------------------------------------------------------------------
// Admin CRUD — used by app/api/admin/knowledge-base/**
// ---------------------------------------------------------------------

// `q` here is the ADMIN'S manual search box (not the per-image context
// search below) — same trigram ranking, but always includes inactive rows
// so an admin can find and re-enable something they turned off earlier.
export async function listComplianceRules(opts: { q?: string } = {}): Promise<ComplianceRuleMatch[]> {
  const q = opts.q?.trim();
  if (!q) {
    const rows = await sql`
      SELECT
        id, title, category, content, source_type, source_filename, always_include,
        is_active, created_by, created_at, updated_at,
        (source_file_base64 IS NOT NULL) AS has_file,
        0::float8 AS score
      FROM compliance_rules
      ORDER BY created_at DESC
    `;
    return rows as ComplianceRuleMatch[];
  }
  const rows = await sql`
    SELECT
      id, title, category, content, source_type, source_filename, always_include,
      is_active, created_by, created_at, updated_at,
      (source_file_base64 IS NOT NULL) AS has_file,
      word_similarity(${q}, search_blob) AS score
    FROM compliance_rules
    ORDER BY score DESC, created_at DESC
  `;
  return rows as ComplianceRuleMatch[];
}

export async function getComplianceRule(id: string): Promise<ComplianceRule | null> {
  const rows = await sql`
    SELECT
      id, title, category, content, source_type, source_filename, always_include,
      is_active, created_by, created_at, updated_at,
      (source_file_base64 IS NOT NULL) AS has_file
    FROM compliance_rules WHERE id = ${id}
  `;
  return (rows[0] as ComplianceRule) ?? null;
}

// Fetches ONLY the original uploaded file's bytes (base64) + mime +
// filename for a single row — used exclusively by the download route
// (app/api/admin/knowledge-base/[id]/file/route.ts). Kept separate from
// getComplianceRule() so nothing else ever accidentally pulls a
// multi-megabyte base64 blob into memory.
export async function getComplianceRuleFile(
  id: string
): Promise<{ base64: string; mime: string | null; filename: string | null } | null> {
  const rows = await sql`
    SELECT source_file_base64, source_file_mime, source_filename
    FROM compliance_rules WHERE id = ${id}
  `;
  const row = rows[0] as any;
  if (!row || !row.source_file_base64) return null;
  return { base64: row.source_file_base64, mime: row.source_file_mime, filename: row.source_filename };
}

export async function createComplianceRule(input: {
  title: string;
  category?: string | null;
  content: string;
  sourceType: "manual" | "upload";
  sourceFilename?: string | null;
  fileBase64?: string | null;
  fileMime?: string | null;
  alwaysInclude?: boolean;
  createdBy?: string | null;
}): Promise<ComplianceRule> {
  const rows = await sql`
    INSERT INTO compliance_rules
      (title, category, content, source_type, source_filename, source_file_base64, source_file_mime, always_include, created_by)
    VALUES (
      ${input.title},
      ${input.category ?? null},
      ${input.content},
      ${input.sourceType},
      ${input.sourceFilename ?? null},
      ${input.fileBase64 ?? null},
      ${input.fileMime ?? null},
      ${input.alwaysInclude ?? false},
      ${input.createdBy ?? null}
    )
    RETURNING
      id, title, category, content, source_type, source_filename, always_include,
      is_active, created_by, created_at, updated_at,
      (source_file_base64 IS NOT NULL) AS has_file
  `;
  return rows[0] as ComplianceRule;
}

export async function updateComplianceRule(
  id: string,
  patch: Partial<{
    title: string;
    category: string | null;
    content: string;
    alwaysInclude: boolean;
    isActive: boolean;
  }>
): Promise<ComplianceRule | null> {
  // Neon's tagged-template `sql` doesn't support building a dynamic SET
  // clause from an arbitrary object, so this pulls each field with
  // COALESCE against the existing row instead of trying to interpolate
  // column names. Booleans need their own explicit branch because
  // `undefined` can't be passed through COALESCE the way a missing string
  // field can.
  const rows = await sql`
    UPDATE compliance_rules SET
      title = COALESCE(${patch.title ?? null}, title),
      category = CASE WHEN ${patch.category !== undefined} THEN ${patch.category ?? null} ELSE category END,
      content = COALESCE(${patch.content ?? null}, content),
      always_include = COALESCE(${patch.alwaysInclude ?? null}, always_include),
      is_active = COALESCE(${patch.isActive ?? null}, is_active),
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id, title, category, content, source_type, source_filename, always_include,
      is_active, created_by, created_at, updated_at,
      (source_file_base64 IS NOT NULL) AS has_file
  `;
  return (rows[0] as ComplianceRule) ?? null;
}

export async function deleteComplianceRule(id: string): Promise<void> {
  await sql`DELETE FROM compliance_rules WHERE id = ${id}`;
}

// ---------------------------------------------------------------------
// Context search for reviewImage.ts — this is the "ค้นหาตามบริบท" piece.
// ---------------------------------------------------------------------

// Thai has no spaces between words, so Postgres's built-in full-text search
// (to_tsvector/tsquery) can't tokenize it into meaningful lexemes without a
// Thai-specific text search config, which isn't available on Neon out of
// the box. pg_trgm's word_similarity() sidesteps that entirely — it works
// on raw character trigrams, so it needs no tokenizer and handles Thai (and
// mixed Thai/English/numbers, which ad captions often are) equally well.
// Verified against real Thai sample text before rolling this out: a
// genuinely related rule scored ~0.45, an unrelated one ~0.09 — enough
// separation to threshold on.
//
// MIN_SCORE is a starting point, not a tuned constant — revisit once the
// admin has populated the real knowledge base and there's a backlog of
// actual review results to check false-negative/false-positive rates
// against.
const MIN_SCORE = 0.12;
const MAX_CONTEXT_MATCHES = 8;

export async function searchComplianceRules(
  contextText: string,
  opts: { limit?: number } = {}
): Promise<ComplianceRuleMatch[]> {
  const limit = opts.limit ?? MAX_CONTEXT_MATCHES;
  const query = contextText.trim();

  // always_include rows (e.g. the PDPA before/after consent rule, which
  // applies to every image regardless of what the caption says) are pulled
  // in unconditionally so they're never at the mercy of the similarity
  // score of a short or missing caption.
  if (!query) {
    const rows = await sql`
      SELECT
        id, title, category, content, source_type, source_filename, always_include,
        is_active, created_by, created_at, updated_at,
        (source_file_base64 IS NOT NULL) AS has_file,
        1::float8 AS score
      FROM compliance_rules
      WHERE is_active = true AND always_include = true
      ORDER BY created_at DESC
    `;
    return rows as ComplianceRuleMatch[];
  }

  const rows = await sql`
    SELECT * FROM (
      SELECT
        id, title, category, content, source_type, source_filename, always_include,
        is_active, created_by, created_at, updated_at,
        (source_file_base64 IS NOT NULL) AS has_file,
        1::float8 AS score
      FROM compliance_rules
      WHERE is_active = true AND always_include = true
      UNION ALL
      SELECT
        id, title, category, content, source_type, source_filename, always_include,
        is_active, created_by, created_at, updated_at,
        (source_file_base64 IS NOT NULL) AS has_file,
        word_similarity(${query}, search_blob) AS score
      FROM compliance_rules
      WHERE is_active = true AND always_include = false
        AND word_similarity(${query}, search_blob) >= ${MIN_SCORE}
      ORDER BY score DESC
      LIMIT ${limit}
    ) matched
    ORDER BY score DESC
  `;
  return rows as ComplianceRuleMatch[];
}

export async function countActiveComplianceRules(): Promise<number> {
  const rows = await sql`SELECT count(*)::int AS n FROM compliance_rules WHERE is_active = true`;
  return (rows[0] as any).n as number;
}
