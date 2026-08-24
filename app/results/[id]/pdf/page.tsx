export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
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
    <main className="bg-page text-primary print:bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <AutoPrint />

      {/* Header — always black with white text, on screen and on paper. */}
      <header className="bg-inverse text-onInverse px-14 py-8 flex items-center justify-between">
        <span className="text-xl font-semibold tracking-wide">ADCheck</span>
        <span className="text-sm text-onInverse/70">รายงานผลการตรวจสอบภาพโฆษณา</span>
      </header>

      <div className="max-w-4xl mx-auto px-10 py-10 print:px-2 print:py-6">
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
        {category} · {legalRef} · ความมั่นใจ: {confidenceLevel}
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
