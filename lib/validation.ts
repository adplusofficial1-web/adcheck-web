// Shared, dependency-free input validators. Kept separate from lib/db.ts so
// route handlers can validate user-supplied path/body params BEFORE they
// ever reach a query — a malformed id used to reach the database and throw
// a raw Postgres error instead of a normal 404 (see the bug-audit fixes in
// app/api/submissions/route.ts and app/api/submissions/[id]/status/route.ts).

// Matches the standard 8-4-4-4-12 hex UUID layout (any version/variant,
// case-insensitive) — Postgres' uuid columns accept the same shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
