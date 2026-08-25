export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }
  const filter = searchParams.filter;

  const images = (filter
    ? await sql`
        SELECT si.*, s.id AS submission_id, s.created_at
        FROM submission_images si
        JOIN submissions s ON s.id = si.submission_id
        WHERE s.business_id = ${business.id} AND si.status = ${filter}
        ORDER BY s.created_at DESC
        LIMIT 50
      `
    : await sql`
        SELECT si.*, s.id AS submission_id, s.created_at
        FROM submission_images si
        JOIN submissions s ON s.id = si.submission_id
        WHERE s.business_id = ${business.id}
        ORDER BY s.created_at DESC
        LIMIT 50
      `) as any[];

  const filters = [
    { key: undefined, label: "ทั้งหมด" },
    { key: "violation", label: "เข้าข่ายผิด" },
    { key: "caution", label: "ควรระวัง" },
    { key: "passed", label: "ผ่าน" },
  ];

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-6">ประวัติการตรวจสอบ</h1>
        <div className="flex gap-2 mb-6">
          {filters.map((f) => (
            <Link
              key={f.label}
              href={f.key ? `/history?filter=${f.key}` : "/history"}
              className={`rounded-pill px-4 py-2 text-sm ${
                filter === f.key ? "bg-inverse text-onInverse" : "border border-border"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="space-y-3">
          {images.map((img) => {
            const s = STATUS_LABEL[img.status] || STATUS_LABEL.passed;
            return (
              <Link
                key={img.id}
                href={`/results/${img.submission_id}`}
                className="flex items-center justify-between border border-border rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-accentSoft" />
                  <span className="text-sm font-medium">{img.filename}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-secondary">
                  <span>{new Date(img.created_at).toLocaleDateString("th-TH")}</span>
                  <span className={`rounded-pill px-3 py-1 text-xs font-medium ${s.badge}`}>{s.label}</span>
                </div>
              </Link>
            );
          })}
          {images.length === 0 && <p className="text-sm text-secondary">ไม่พบรายการ</p>}
        </div>
      </div>
    </main>
  );
}
