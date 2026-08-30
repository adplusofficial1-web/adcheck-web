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

function monthKeyOf(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// Day 15 at noon UTC is a safe "middle of the month" instant — nowhere near
// a month boundary in any real-world timezone — so formatting it with
// timeZone: "Asia/Bangkok" always reflects the intended (year, month) pair,
// independent of which calendar day "now" actually is.
function monthLabelOf(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 15, 12, 0, 0));
  return d.toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

// Builds `monthsBack` consecutive calendar-month buckets ending at the
// current month (oldest first). Done in JS rather than left to SQL's
// GROUP BY specifically so a month with zero submissions still shows up
// as an explicit 0/0 bucket in the chart instead of silently vanishing.
//
// FIX (bug audit round 3 — same class of bug as lib/formatDateTime.ts and
// components/admin/MarketingTracker.tsx): this used to derive "now"'s
// year/month from `new Date()`'s *local* getters, which reflect whatever
// timezone the host process happens to be running in (UTC on Render) —
// during the first ~7 hours of a new month by Thailand's calendar (which is
// still the previous UTC day), this report would bucket "now" into the
// wrong, previous month. Shifting by Thailand's fixed UTC+7 offset (no DST)
// before reading UTC getters makes "now" always mean Thailand's now,
// regardless of the host's own timezone — same technique used in
// MarketingTracker.tsx's todayStr().
function buildMonthBuckets(monthsBack: number): { key: string; label: string; start: Date }[] {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const nowYear = bangkokNow.getUTCFullYear();
  const nowMonth0 = bangkokNow.getUTCMonth();

  const buckets: { key: string; label: string; start: Date }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const totalMonths = nowYear * 12 + nowMonth0 - i;
    const year = Math.floor(totalMonths / 12);
    const month0 = ((totalMonths % 12) + 12) % 12;
    // The real UTC instant for "this Bangkok month's 1st, 00:00 Bangkok
    // time" — that wall-clock moment is 7 hours *behind* in UTC terms.
    const start = new Date(Date.UTC(year, month0, 1) - 7 * 60 * 60 * 1000);
    buckets.push({ key: monthKeyOf(year, month0), label: monthLabelOf(year, month0), start });
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
  //
  // FIX (bug audit round 3): `date_trunc('month', s.created_at)` truncates
  // using the DB session's own TimeZone setting (Postgres/Neon default to
  // UTC), which must match the Bangkok-based bucket keys buildMonthBuckets()
  // generates above — otherwise a submission from the first ~7 hours of a
  // new Bangkok month would get stamped with the previous month's key here
  // and never match any bucket, silently vanishing from the report.
  // `AT TIME ZONE 'Asia/Bangkok'` converts the timestamptz to Bangkok wall-
  // clock time first, so date_trunc('month', ...) truncates the calendar
  // month Thailand actually experienced, independent of the session's
  // timezone setting.
  const overviewRows = (await sql`
    SELECT to_char(date_trunc('month', s.created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month_key,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE si.status IN ('caution', 'violation'))::int AS flagged
    FROM submission_images si
    JOIN submissions s ON s.id = si.submission_id
    WHERE si.status IN ('passed', 'caution', 'violation')
      AND s.created_at >= ${windowStart}
    GROUP BY 1
  `) as { month_key: string; total: number; flagged: number }[];

  const categoryRows = (await sql`
    SELECT to_char(date_trunc('month', s.created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month_key,
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
