export const dynamic = "force-dynamic";
import { Nav } from "@/components/Nav";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const [submission] = await sql`SELECT * FROM submissions WHERE id = ${params.id}`;
  if (!submission) notFound();

  const images = (await sql`
    SELECT * FROM submission_images WHERE submission_id = ${params.id} ORDER BY sort_order ASC
  `) as any[];

  const flags = (await sql`
    SELECT * FROM review_flags WHERE submission_id = ${params.id}
  `) as any[];

  const flagsByImage: Record<string, any[]> = {};
  for (const f of flags) {
    flagsByImage[f.submission_image_id] = flagsByImage[f.submission_image_id] || [];
    flagsByImage[f.submission_image_id].push(f);
  }

  const passedCount = images.filter((i) => i.status === "passed").length;
  const cautionCount = images.filter((i) => i.status === "caution").length;
  const violationCount = images.filter((i) => i.status === "violation").length;

  return (
    <main>
      <Nav backHref="/dashboard" />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-1">ผลการตรวจสอบ ({images.length} ภาพ)</h1>
        <p className="text-sm text-secondary mb-6">
          พบประเด็นเสี่ยงใน {cautionCount + violationCount} จาก {images.length} ภาพ · ตรวจสอบเมื่อ{" "}
          {new Date(submission.created_at).toLocaleString("th-TH")} · อ้างอิง {submission.rules_version_ref}
        </p>

        <div className="flex gap-3 mb-8 text-sm">
          <span className="rounded-pill bg-accentSoft text-accent px-3 py-1">{passedCount} ภาพพร้อมเผยแพร่</span>
          <span className="rounded-pill bg-warningSoft text-warning px-3 py-1">{cautionCount} ภาพควรระวัง</span>
          <span className="rounded-pill bg-dangerSoft text-danger px-3 py-1">{violationCount} ภาพเข้าข่ายผิด</span>
        </div>

        <div className="space-y-4">
          {images.map((img, idx) => {
            const s = STATUS_LABEL[img.status] || STATUS_LABEL.passed;
            const imgFlags = flagsByImage[img.id] || [];
            return (
              <div key={img.id} className="border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">
                    ภาพที่ {idx + 1} · {img.filename}
                  </div>
                  <span className={`rounded-pill px-3 py-1 text-xs font-medium ${s.badge}`}>
                    {s.label}
                    {imgFlags.length > 0 ? ` ${imgFlags.length} จุด` : ""}
                  </span>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  {img.image_url && img.image_url.startsWith("data:") && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.image_url}
                      alt={img.filename}
                      className="w-1/2 md:w-1/5 md:shrink-0 max-h-48 object-contain rounded-md bg-page"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    {img.caption && (
                      <div className="text-xs text-secondary mb-2">
                        คำบรรยาย: &quot;{img.caption}&quot;
                      </div>
                    )}
                    {imgFlags.length === 0 && (
                      <div className="text-sm text-secondary">
                        {img.status === "passed"
                          ? "ไม่พบประเด็นที่เข้าข่ายผิดกฎ"
                          : "AI ให้ผล \"ควรระวัง\" แต่ไม่ได้ระบุข้อความที่มีปัญหาชัดเจน — ลองพิจารณาด้วยสายตาอีกครั้ง"}
                      </div>
                    )}
                    {imgFlags.map((f) => (
                      <div key={f.id} className="bg-page rounded-md p-3 mb-2 text-sm">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="font-medium">&quot;{f.quoted_text}&quot;</span>
                          <span
                            className={`rounded-pill px-2 py-0.5 text-xs font-medium shrink-0 ${
                              f.severity === "ห้ามเด็ดขาด" ? "bg-dangerSoft text-danger" : "bg-warningSoft text-warning"
                            }`}
                          >
                            {f.severity}
                          </span>
                        </div>
                        <div className="text-secondary text-xs mb-2">
                          {f.category} · {f.legal_ref} · ความมั่นใจ: {f.confidence_level}
                        </div>
                        {f.explanation && (
                          <div className="text-sm font-medium mb-1">{f.explanation}</div>
                        )}
                        {f.detailed_explanation && (
                          <p className="text-xs text-secondary leading-relaxed">{f.detailed_explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-8">
          <button className="rounded-md border border-border px-4 py-2 text-sm">ดาวน์โหลด PDF</button>
          <button className="rounded-md border border-border px-4 py-2 text-sm">แชร์ลิงก์</button>
          <a href="/upload" className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm ml-auto">
            + อัปโหลดชุดใหม่
          </a>
        </div>
      </div>
    </main>
  );
}
