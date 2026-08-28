import { sql } from "@/lib/db";

// Powers /admin/inside — see that page for the surrounding context. This
// is the "automatic, zero-effort" half of the AdCheck ↔ สบส. cooperation
// model (see the marketing-strategy doc): unlike the quarterly calibration
// review (a curated test set an admin builds by hand), this report is
// generated straight from real submission_images/review_flags rows, on
// every page load, with no admin curation step.
//
// Deliberately does NOT break anything down by clinic specialty
// (beauty/dental/ortho/pharmacy/vet). businesses.type only ever holds
// 'clinic' or 'agency' (see app/api/settings/clinic-info/route.ts's
// VALID_TYPES) — that's account type, not medical specialty. There is no
// real column to group by yet, so that breakdown was left out rather than
// faked; add a specialty field (migration + settings UI) before building
// it for real.

export type MonthlyOverview = {
  monthKey: string; // "2026-08"
  label: string; // "ส.ค. 2569" (Buddhist year, via th-TH locale)
  total: number; // submission_images with a terminal status this month
  flagged: number; // of those, status IN ('caution', 'violation')
  flaggedPct: number; // 0 when total === 0
};

export type CategoryStat = {
  category: string; // free text — see note below
  count: number; // distinct images with >=1 flag in this category this month
  pct: number; // % of that month's flagged images (not total images)
};

export type MonthlyTrendReport = {
  months: MonthlyOverview[]; // oldest → newest
  // Top categories per month, already sorted by count desc and capped at
  // TOP_CATEGORIES_PER_MONTH. review_flags.category is free text the AI
  // writes per flag (see lib/reviewImage.ts's REVIEW_TOOL schema) — not a
  // fixed taxonomy — so the same real issue can appear under slightly
  // different wording in different months. Exact-string grouping is the
  // honest choice here: it never invents a category the AI didn't
  // actually use, but it does mean month-to-month trend comparisons only
  // work when the wording happens to match (the UI that consumes this
  // handles a non-match by labeling it "new this month" rather than
  // pretending a trend exists).
  categoriesByMonth: Record<string, CategoryStat[]>;
};

const TOP_CATEGORIES_PER_MONTH = 5;

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(d: Date): string {
  return d.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
}

// Builds `monthsBack` consecutive calendar-month buckets ending at the
// current month (oldest first). Done in JS rather than left to SQL's
// GROUP BY specifically so a month with zero submissions still shows up
// as an explicit 0/0 bucket in the chart instead of silently vanishing.
function buildMonthBuckets(monthsBack: number): { key: string; label: string; start: Date }[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: monthKeyOf(d), label: monthLabelOf(d), start: d });
  }
  return buckets;
}

export async function getMonthlyTrendReport(monthsBack = 6): Promise<MonthlyTrendReport> {
  const buckets = buildMonthBuckets(monthsBack);
  const windowStart = buckets[0].start;

  // Only images that finished review (status is 'passed' | 'caution' |
  // 'violation') count toward "total" — an image still stuck at whatever
  // pre-review state exists isn't a real result yet and would understate
  // the flagged rate if it were counted as an implicit pass.
  const overviewRows = (await sql`
    SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month_key,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE si.status IN ('caution', 'violation'))::int AS flagged
    FROM submission_images si
    JOIN submissions s ON s.id = si.submission_id
    WHERE si.status IN ('passed', 'caution', 'violation')
      AND s.created_at >= ${windowStart}
    GROUP BY 1
  `) as { month_key: string; total: number; flagged: number }[];

  const categoryRows = (await sql`
    SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month_key,
           rf.category AS category,
           COUNT(DISTINCT rf.submission_image_id)::int AS cnt
    FROM review_flags rf
    JOIN submission_images si ON si.id = rf.submission_image_id
    JOIN submissions s ON s.id = si.submission_id
    WHERE s.created_at >= ${windowStart}
      AND rf.category IS NOT NULL AND rf.category <> ''
    GROUP BY 1, 2
    ORDER BY 1, cnt DESC
  `) as { month_key: string; category: string; cnt: number }[];

  const overviewByKey = new Map(overviewRows.map((r) => [r.month_key, r]));

  const months: MonthlyOverview[] = buckets.map((b) => {
    const row = overviewByKey.get(b.key);
    const total = row?.total ?? 0;
    const flagged = row?.flagged ?? 0;
    return {
      monthKey: b.key,
      label: b.label,
      total,
      flagged,
      flaggedPct: total > 0 ? Math.round((flagged / total) * 100) : 0,
    };
  });

  const categoriesByMonth: Record<string, CategoryStat[]> = {};
  for (const b of buckets) {
    const flaggedThisMonth = overviewByKey.get(b.key)?.flagged ?? 0;
    categoriesByMonth[b.key] = categoryRows
      .filter((r) => r.month_key === b.key)
      .slice(0, TOP_CATEGORIES_PER_MONTH)
      .map((r) => ({
        category: r.category,
        count: r.cnt,
        pct: flaggedThisMonth > 0 ? Math.round((r.cnt / flaggedThisMonth) * 100) : 0,
      }));
  }

  return { months, categoriesByMonth };
}
