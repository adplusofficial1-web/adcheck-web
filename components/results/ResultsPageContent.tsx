import { Nav } from "@/components/Nav";
import { FlagDetail } from "@/components/FlagDetail";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";
import { notFound, redirect } from "next/navigation";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};

// Shared implementation for both app/results/[id]/page.tsx (Clinic mode)
// and app/agency/results/[id]/page.tsx (Agency mode) — see
// components/pricing/PricingContent.tsx for the same basePath-prop pattern
// used earlier for /pricing vs /agency/pricing.
//
// FIX (bug audit #5): before this split existed, there was only ONE
// results page (no /agency/... route at all), so an Agency-mode upload
// always finished by landing on a non-/agency URL and Nav
// (components/Nav.tsx, URL-prefix-only mode check) dropped back to
// Clinic-mode chrome right at the end of the flow. `basePath` is what lets
// the two thin page.tsx wrappers below render identical content while
// keeping every link on this page (PDF, "อัพโหลดชุดใหม่") pointed at the
// right prefix for whichever mode the viewer is actually in.
export async function ResultsPageContent({
  id,
  basePath,
}: {
  id: string;
  basePath: "" | "/agency";
}) {
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
    SELECT * FROM submissions WHERE id = ${id} AND business_id = ANY(${accessibleIds}::uuid[])
  `;
  if (!submission) notFound();

  const images = (await sql`
    SELECT * FROM submission_images WHERE submission_id = ${id} ORDER BY sort_order ASC
  `) as any[];

  const flags = (await sql`
    SELECT * FROM review_flags WHERE submission_id = ${id}
  `) as any[];

  const flagsByImage: Record<string, any[]> = {};
  for (const f of flags) {
    flagsByImage[f.submission_image_id] = flagsByImage[f.submission_image_id] || [];
    flagsByImage[f.submission_image_id].push(f);
  }

  const passedCount = images.filter((i) => i.status === "passed").length;
  const cautionCount = images.filter((i) => i.status === "caution").length;
  const violationCount = images.filter((i) => i.status === "violation").length;

  // /agency/upload requires a ?business=<id> this page doesn't have on
  // hand — send Agency mode back to the dashboard instead, same reasoning
  // as components/ProcessingScreen.tsx's uploadHref.
  const uploadHref = basePath ? "/agency/dashboard" : "/upload";

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-1">ผลการตรวจสอบ ({images.length} ภาพ)</h1>
        <p className="text-sm text-secondary mb-6">
          พบประเด็นเสี่ยงใน {cautionCount + violationCount} จาก {images.length} ภาพ · ตรวจสอบเมื่อ{" "}
                    {/* FIX (bug audit round 3): no `timeZone` means this renders in
                        whatever timezone the server process happens to run in
                        (UTC on Render) — a submission made 00:00-06:59 Thailand
                        time would show the previous day. Pin Asia/Bangkok so the
                        date always matches what the clinic actually experienced. */}
                    {new Date(submission.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}
        </p>

        {/* FIX (bug audit #11): this page used to render whatever rows
            happened to exist in submission_images with no regard for
            submissions.status — someone who opened this URL while the
            background review loop (app/api/submissions/route.ts) was still
            running, or after it crashed partway (bug audit #3/#4), saw a
            partial result set that looked exactly like a complete one, with
            no indication anything was missing. */}
        {submission.status === "processing" && (
          <div className="mb-6 rounded-lg border border-warning bg-warningSoft p-4 text-sm">
            <span className="font-medium">ยังตรวจไม่ครบ</span> — ระบบกำลังตรวจภาพที่เหลืออยู่ ผลด้านล่างเป็นเพียงบางส่วน
            ({images.length} ภาพที่ตรวจเสร็จแล้ว) รีเฟรชหน้านี้อีกครั้งในอีกสักครู่เพื่อดูผลฉบับสมบูรณ์
          </div>
        )}
        {submission.status === "failed" && (
          <div className="mb-6 rounded-lg border border-danger bg-dangerSoft p-4 text-sm">
            <span className="font-medium">การตรวจสอบไม่สำเร็จ</span> — เกิดข้อผิดพลาดระหว่างตรวจภาพชุดนี้
            {images.length > 0
              ? ` ผลด้านล่างมีเฉพาะ ${images.length} ภาพที่ตรวจเสร็จก่อนเกิดปัญหาเท่านั้น อาจไม่ครบทั้งชุด`
              : " ยังไม่มีภาพใดตรวจเสร็จเลยก่อนเกิดปัญหา"}{" "}
            กรุณาอัปโหลดใหม่อีกครั้ง
          </div>
        )}

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
          {/* Always /results/.../pdf regardless of basePath — the PDF view
              (app/results/[id]/pdf/page.tsx) has no Nav/mode chrome of its
              own (it's a standalone print view), so there's no /agency
              twin to route to and none needed. */}
          <a href={`/results/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border px-4 py-2 text-sm">
            ดาวน์โหลด PDF
          </a>
          <ShareLinkButton shareToken={submission.share_token} />
          <a href={uploadHref} className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm ml-auto">
            + อัพโหลดชุดใหม่
          </a>
        </div>
      </div>
    </main>
  );
}
