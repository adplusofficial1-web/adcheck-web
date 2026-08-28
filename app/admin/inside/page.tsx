import { getMonthlyTrendReport } from "@/lib/monthlyTrendReport";
import { InsideReport } from "@/components/admin/InsideReport";

// Always hit the DB fresh, same reasoning as app/admin/knowledge-base/page.tsx
// — an admin checking "did this month's numbers move" wants the current
// count, not a cached one from earlier in the day.
export const dynamic = "force-dynamic";

export default async function InsidePage() {
  const report = await getMonthlyTrendReport(6);

  return (
    <div className="max-w-5xl mx-auto">
      <InsideReport report={report} />
    </div>
  );
}
