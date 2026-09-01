export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { FlagDetail } from "@/components/FlagDetail";
import { ShareLinkButton } from "@/components/ShareLinkButton";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

/**
 * Public twin of app/results/[id]/page.tsx — reached only via the
 * "แชร์ลิงก์" button (components/ShareLinkButton.tsx), never linked from
 * anywhere inside the authenticated app. Deliberately looked up by
 * share_token (a random 16-hex-char value with its own unique index —
 * submissions_share_token_key) instead of the submission's id, so knowing
 * a submission's id — visible in the authenticated /results/[id] URL, or
 * guessable since ids are sequential-ish UUIDs from the same table — never
 * grants access here. Only having the actual token, which only comes from
 * someone clicking "แชร์ลิงก์" (or being sent that link), does.
 *
 * There is intentionally NO getCurrentBusiness()/redirect(/login) check —
 * that's the entire point of a share link. Nothing here lets a viewer
 * modify anything (no upload, no settings), so read-only exposure of one
 * submission's own findings is the full extent of what this route grants.
 */
export default async function SharedResultsPage({ params }: { params: { token: string } }) {
  const [submission] = (await sql`
    SELECT s.*, b.name AS business_name, b.avatar_url AS business_avatar_url
    FROM submissions s
    JOIN businesses b ON b.id = s.business_id
    WHERE s.share_token = ${params.token}
  `) as any[];
  if (!submission) notFound();

  const images = (await sql`
    SELECT * FROM submission_images WHERE submission_id = ${submission.id} ORDER BY sort_order ASC
  `) as any[];

  const flags = (await sql`
    SELECT * FROM review_flags WHERE submission_id = ${submission.id}
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
      {/* Minimal public header — no Dashboard/ประวัติ/ตั้งค่า chrome from
          components/Nav.tsx, since none of that applies to someone without
          an account. Leads with the clinic's own logo/name (same treatment
          as the PDF report's header) so the report reads as the clinic's,
          with a plain link back to adcheck.pro rather than the full site nav. */}
      <header className="bg-inverse text-onInverse px-6 md:px-14 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {submission.business_avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={submission.business_avatar_url}
              alt=""
              className="w-9 h-9 rounded-md object-cover bg-onInverse/10"
            />
          )}
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-wide">
              {submission.business_avatar_url ? submission.business_name : "ADCheck"}
            </span>
            {submission.business_avatar_url && (
              <span className="text-[11px] text-onInverse/60">ตรวจสอบโดย ADCheck</span>
            )}
          </div>
        </div>
        <Link href="/" className="text-sm text-onInverse/70 hover:text-onInverse">
          ADCheck
        </Link>
      </header>

      {/* Free-trial + demo highlight for visitors who only ever see this
          public share link and never the landing page (see app/page.tsx for
          the same "ทดลองใช้ฟรี 15 ครั้ง" wording used there) — the point the
          user asked for: something that visibly says "this is free" plus a
          no-login way to see what a review looks like (case-studies is the
          public, unauthenticated example-results page). */}
      <div className="bg-accentSoft border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-accent font-medium">
            ✨ ตรวจผลนี้ด้วย ADCheck — ทดลองใช้ฟรี 15 ครั้ง ไม่มีค่าใช้จ่าย
          </p>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/case-studies" className="text-sm text-accent underline whitespace-nowrap">
              ดูตัวอย่างผลตรวจ (Demo) →
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm font-medium whitespace-nowrap hover:bg-inverse/90"
            >
              ทดลองใช้ฟรี
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-1">ผลการตรวจสอบ ({images.length} ภาพ)</h1>
        <p className="text-sm text-secondary mb-6">
          พบประเด็นเสี่ยงใน {cautionCount + violationCount} จาก {images.length} ภาพ · ตรวจสอบเมื่อ{" "}
          {/* FIX (bug audit round 3): pin Asia/Bangkok — see the identical
              comment in components/results/ResultsPageContent.tsx. This page
              is publicly shared, so it should show Thailand's date regardless
              of the viewer's own location/timezone. */}
          {new Date(submission.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}
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
          {/* Public PDF twin of the authenticated download button on
              components/results/ResultsPageContent.tsx — looked up by the
              same share_token instead of a session, see
              app/share/[token]/pdf/page.tsx. */}
          <a
            href={`/share/${params.token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            ดาวน์โหลด PDF
          </a>
          <ShareLinkButton shareToken={submission.share_token} />
          <a
            href="/"
            className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm ml-auto"
          >
            ทดลองใช้ฟรี 15 ครั้งที่ ADCheck →
          </a>
        </div>
      </div>
    </main>
  );
}
