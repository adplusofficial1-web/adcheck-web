export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

export default async function DashboardPage() {
  const business = await getCurrentBusiness();
  // middleware.ts already requires a session for this route, so this only
  // triggers if that session somehow doesn't resolve to a business — bounce
  // back to login rather than rendering with nothing to show.
  if (!business) {
    redirect("/login");
  }

  const monthStats = (await sql`
    SELECT si.status AS status, count(*)::int AS n
    FROM submission_images si
    JOIN submissions s ON s.id = si.submission_id
    WHERE s.business_id = ${business.id}
      AND s.created_at >= date_trunc('month', now())
    GROUP BY si.status
  `) as any[];

  const totalThisMonth = monthStats.reduce((a, r) => a + r.n, 0);
  const passedAllTime = (
    await sql`
      SELECT count(*)::int AS n FROM submission_images si
      JOIN submissions s ON s.id = si.submission_id
      WHERE s.business_id = ${business.id} AND si.status = 'passed'
    `
  )[0]?.n as number;

  const recent = (await sql`
    SELECT s.id, s.created_at, s.status,
      (SELECT filename FROM submission_images WHERE submission_id = s.id ORDER BY sort_order LIMIT 1) AS filename,
      (SELECT count(*)::int FROM review_flags WHERE submission_id = s.id) AS flag_count
    FROM submissions s
    WHERE s.business_id = ${business.id}
    ORDER BY s.created_at DESC
    LIMIT 5
  `) as any[];

  const byStatus = (status: string) => monthStats.find((m) => m.status === status)?.n ?? 0;

  return (
    <main>
      <Nav credits={business.credits_remaining} />
      <div className="max-w-4xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">{business.name}</h1>
        <p className="text-sm text-secondary mb-8">{business.contact_email}</p>

        <div className="flex justify-center mb-8">
          <Link
            href="/upload"
            className="text-2xl font-medium rounded-xl bg-inverse text-onInverse px-12 py-6"
          >
            + อัพโหลด
          </Link>
        </div>

        {business.credits_remaining < 10 && (
          <div className="bg-warningSoft text-warning rounded-lg p-4 mb-8 flex items-center justify-between text-sm">
            <span>เครดิตใกล้หมด เหลือ {business.credits_remaining} ครั้ง — เติมเครดิตก่อนใช้งานต่อเนื่อง</span>
            <a href="https://adcheck.pro/pricing" className="underline font-medium">เติมเครดิต →</a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">ตรวจแล้วเดือนนี้</div>
            <div className="text-2xl font-medium">{totalThisMonth}</div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <div className="text-xs text-secondary mb-2">ภาพที่ผ่านทั้งหมด</div>
            <div className="text-2xl font-medium">{passedAllTime}</div>
          </div>
        </div>

        <div className="border border-border rounded-lg p-5 mb-8">
          <div className="text-sm font-medium mb-3">ภาพรวมความเสี่ยง — เดือนนี้ ({totalThisMonth} ภาพ)</div>
          <div className="flex gap-2 h-3 rounded-full overflow-hidden mb-3">
            <div className="bg-accent" style={{ width: `${(byStatus("passed") / (totalThisMonth || 1)) * 100}%` }} />
            <div className="bg-warning" style={{ width: `${(byStatus("caution") / (totalThisMonth || 1)) * 100}%` }} />
            <div className="bg-danger" style={{ width: `${(byStatus("violation") / (totalThisMonth || 1)) * 100}%` }} />
          </div>
          <div className="flex gap-6 text-xs text-secondary">
            <span>ผ่าน {byStatus("passed")}</span>
            <span>ควรระวัง {byStatus("caution")}</span>
            <span>เข้าข่ายผิด {byStatus("violation")}</span>
          </div>
        </div>

        <div className="border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">การตรวจสอบล่าสุด</div>
          </div>
          {recent.length === 0 && <p className="text-sm text-secondary">ยังไม่มีการตรวจสอบ</p>}
          {recent.map((r) => (
            <Link
              key={r.id}
              href={`/results/${r.id}`}
              className="flex items-center justify-between py-3 border-t border-border first:border-t-0 text-sm"
            >
              <span>{r.filename}</span>
              <span className="text-secondary">
                {new Date(r.created_at).toLocaleDateString("th-TH")} ·{" "}
                {r.flag_count > 0 ? `${r.flag_count} จุดเสี่ยง` : "ผ่าน"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
