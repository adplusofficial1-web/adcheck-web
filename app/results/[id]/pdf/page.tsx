export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";
import { AutoPrint } from "@/components/AutoPrint";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

/**
 * Printable / "Download PDF" version of the results page
 * (app/results/[id]/page.tsx). This is a normal web page, not a
 * server-generated PDF file — the "ดาวน์โหลด PDF" button on the results
 * page opens this route in a new tab, AutoPrint triggers the browser's
 * native print dialog, and the person picks "Save as PDF" there. That
 * avoids adding a PDF-rendering dependency (Puppeteer, react-pdf, …) to a
 * small Render web service just for this.
 *
 * Unlike the interactive results page, every flag's explanation is shown
 * in full up front — there's no "อธิบายเพิ่มเติม" toggle to click on paper.
 */
export default async function ResultsPdfPage({ params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  // Scoped to every business id this session may act on — itself, plus any
  // clinic it manages in Agency mode (see lib/agency.ts) — from the query
  // itself. This route previously had no ownership check at all, so any
  // signed-in user who guessed a submission id could open (and print/save)
  // another business's report (same pattern in results/[id]/page.tsx and
  // processing/[id]/page.tsx).
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
    <main className="bg-page text-primary print:bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <AutoPrint />

      {/* Header — always black with white text, on screen and on paper.
          Leads with the clinic's own logo/name (from Settings → avatar_url)
          so a saved report reads as the clinic's document when handed to
          สบส. or management, with ADCheck credited underneath rather than
          as the headline. Falls back to plain "ADCheck" branding when the
          business hasn't set a logo. */}
      <header className="bg-inverse text-onInverse px-14 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {business.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.avatar_url}
              alt=""
              className="w-10 h-10 rounded-md object-cover bg-onInverse/10"
            />
          )}
          <div className="flex flex-col">
            <span className="text-xl font-semibold tracking-wide">
              {business.avatar_url ? business.name : "ADCheck"}
            </span>
            {business.avatar_url && (
              <span className="text-[11px] text-onInverse/60">ตรวจสอบโดย ADCheck</span>
            )}
          </div>
        </div>
        <span className="text-sm text-onInverse/70">รายงานผลการตรวจสอบภาพโฆษณา</span>
      </header>

      <div className="max-w-4xl mx-auto px-10 py-10 print:px-2 print:py-6">
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

        {/* Same legend as the interactive results page (app/results/[id]/page.tsx),
            but always expanded — there's no "click to expand" on paper — and pinned
            to page 1 (break-inside-avoid) so whoever reads a printed/saved copy has
            the status definitions in hand before the per-image findings below. */}
        <div className="mb-8 rounded-lg border border-border bg-surface p-4 text-sm break-inside-avoid print:break-inside-avoid">
          <div className="font-medium text-primary mb-4">ความหมายของแต่ละสถานะ</div>
          <div className="space-y-3 text-secondary">
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
        </div>

        <div className="space-y-6">
          {images.map((img, idx) => {
            const s = STATUS_LABEL[img.status] || STATUS_LABEL.passed;
            const imgFlags = flagsByImage[img.id] || [];
            return (
              <div
                key={img.id}
                className="border border-border rounded-lg p-5 break-inside-avoid print:break-inside-avoid"
              >
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
                      <FlagDetailPrint
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

        <p className="text-xs text-tertiary mt-10 print:mt-6">
          สร้างรายงานเมื่อ {new Date().toLocaleString("th-TH")} · ADCheck
        </p>
      </div>
    </main>
  );
}

/**
 * Same content as components/FlagDetail.tsx, but with the "อธิบายเพิ่มเติม"
 * expand/collapse removed — on paper (or in a saved PDF) everything should
 * just be there, since there's no way to click "expand" on a printout.
 */
function FlagDetailPrint({
  quotedText,
  category,
  legalRef,
  severity,
  confidenceLevel,
  topic,
  detailedExplanation,
}: {
  quotedText: string;
  category?: string | null;
  legalRef?: string | null;
  severity: string;
  confidenceLevel?: string | null;
  topic?: string | null;
  detailedExplanation?: string | null;
}) {
  return (
    <div className="bg-page rounded-md p-3 mb-2 text-sm break-inside-avoid print:break-inside-avoid">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="font-medium">&quot;{quotedText}&quot;</span>
        <span
          className={`rounded-pill px-2 py-0.5 text-xs font-medium shrink-0 ${
            severity === "ห้ามเด็ดขาด" ? "bg-dangerSoft text-danger" : "bg-warningSoft text-warning"
          }`}
        >
          {severity}
        </span>
      </div>
      <div className="text-secondary text-xs mb-2">
                {category} · {legalRef}
      </div>
      {topic && <div className="text-sm font-medium mb-1">{topic}</div>}
      {detailedExplanation && (
        <div className="space-y-2">
          {detailedExplanation
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((paragraph, i) => {
              const fixLabel = "วิธีแก้ไข:";
              const isFix = paragraph.startsWith(fixLabel);
              return (
                <p key={i} className="text-xs text-secondary leading-relaxed">
                  {isFix ? (
                    <>
                      <span className="font-medium text-primary">{fixLabel}</span>
                      {paragraph.slice(fixLabel.length)}
                    </>
                  ) : (
                    paragraph
                  )}
                </p>
              );
            })}
        </div>
      )}
    </div>
  );
}
