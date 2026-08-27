export const dynamic = "force-dynamic";
import { Nav } from "@/components/Nav";
import { FlagDetail } from "@/components/FlagDetail";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";
import { notFound, redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  // Scoped to every business id this session may act on — itself, plus any
  // clinic it manages in Agency mode (see lib/agency.ts) — from the query
  // itself, so a signed-in user can never even learn whether a submission
  // id belonging to someone else's business exists (same pattern in
  // processing/[id]/page.tsx and results/[id]/pdf/page.tsx).
  const accessibleIds = await getAccessibleBusinessIds(business.id);
  const [submission] = await sql`
    SELECT * FROM submissions WHERE id = ${params.id} AND business_id = ANY(${accessibleIds}::uuid[])
  `;
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
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-1">ผลการตรวจสอบ ({images.length} ภาพ)</h1>
        <p className="text-sm text-secondary mb-6">
          พบประเด็นเสี่ยงใน {cautionCount + violationCount} จาก {images.length} ภาพ · ตรวจสอบเมื่อ{" "}
                    {new Date(submission.created_at).toLocaleDateString("th-TH")}
        </p>

        <div className="flex gap-3 mb-8 text-sm">
          <span className="rounded-pill bg-accentSoft text-accent px-3 py-1">{passedCount} ภาพพร้อมเผยแพร่</span>
          <span className="rounded-pill bg-warningSoft text-warning px-3 py-1">{cautionCount} ภาพควรระวัง</span>
          <span className="rounded-pill bg-dangerSoft text-danger px-3 py-1">{violationCount} ภาพเข้าข่ายผิด</span>
        </div>

        <details className="mb-8 rounded-lg border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            ความหมายของแต่ละสถานะ
          </summary>
          <div className="mt-4 space-y-3 text-secondary">
            <div className="flex gap-3">
              <span className="shrink-0 rounded-pill bg-accentSoft text-accent px-3 py-1 text-xs font-medium">ผ่าน</span>
              <p>
                AI ไม่พบข้อความหรือภาพที่เข้าข่ายผิดกฎตามเกณฑ์ที่ใช้ตรวจ พร้อมเผยแพร่ได้ แต่ยังต้องยื่นขออนุมัติกับ สบส.
                ตามขั้นตอนปกติเช่นเดิม
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 rounded-pill bg-warningSoft text-warning px-3 py-1 text-xs font-medium">ควรระวัง</span>
              <p>
                พบจุดที่มีความเสี่ยงควรพิจารณาแก้ไข ยังไม่ถึงขั้นห้ามใช้เด็ดขาด แก้ไขตามคำแนะนำหรือรับความเสี่ยงเองได้
              </p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 rounded-pill bg-dangerSoft text-danger px-3 py-1 text-xs font-medium">เข้าข่ายผิด</span>
              <p>
                พบข้อความหรือภาพที่เข้าข่ายขัดกฎหมาย/ระเบียบที่ใช้ตรวจอย่างชัดเจน ควรแก้ไขก่อนเผยแพร่จริง
                เพื่อลดความเสี่ยงถูกสั่งระงับโฆษณาหรือถูกปรับ
              </p>
            </div>
            <p className="text-xs text-tertiary pt-2 border-t border-border">
              หมายเหตุ: ป้าย "ห้ามเด็ดขาด" และ "ควรระวัง" ที่แสดงในแต่ละจุดด้านล่าง เป็นระดับความเสี่ยงเฉพาะจุดนั้น
              ซึ่งเป็นคนละส่วนกับสถานะรวมของทั้งภาพด้านบน — "ห้ามเด็ดขาด" หมายถึงจุดที่ตรงกับคำหรือลักษณะที่กฎหมาย/คู่มือ สบส./อย.
              ระบุห้ามใช้ชัดเจน ควรแก้ไขก่อนเผยแพร่เสมอ ส่วน "ควรระวัง" หมายถึงจุดที่มีความเสี่ยงแต่ยังตีความได้มากกว่าหนึ่งทาง
            </p>
          </div>
        </details>

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
                          : `AI ให้ผล "${s.label}" แต่ไม่ได้ระบุข้อความที่มีปัญหาชัดเจน — ลองพิจารณาด้วยสายตาอีกครั้ง`}
                      </div>
                    )}
                    {imgFlags.map((f) => (
                      <FlagDetail
                        key={f.id}
                        quotedText={f.quoted_text}
                        category={f.category}
                        legalRef={f.legal_ref}
                        severity={f.severity}
                        confidenceLevel={f.confidence_level}
                        topic={f.explanation}
                        detailedExplanation={f.detailed_explanation}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-8">
          <a href={`/results/${params.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border px-4 py-2 text-sm">
            ดาวน์โหลด PDF
          </a>
          <button className="rounded-md border border-border px-4 py-2 text-sm">แชร์ลิงก์</button>
          <a href="/upload" className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm ml-auto">
            + อัพโหลดชุดใหม่
          </a>
        </div>
      </div>
    </main>
  );
}
