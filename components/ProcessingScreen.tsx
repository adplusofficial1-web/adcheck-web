"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "./Nav";
import { useSubmissionStatus, type DoneImage } from "@/lib/useSubmissionStatus";

type ImageCardState = "done" | "processing" | "queued";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  passed: { label: "เสร็จสิ้น", className: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", className: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", className: "bg-dangerSoft text-danger" },
};

// Purely decorative "AI is working" motion — every bar pulses regardless of
// per-image state, it does not claim to represent distinct sub-tasks (this
// app reviews each image with a single Claude call, not a multi-stage
// pipeline — see lib/reviewImage.ts). Deterministic heights (no
// Math.random) so server/client renders match and hydration never mismatches.
const DECORATIVE_BAR_HEIGHTS = [
  16, 30, 46, 36, 60, 42, 54, 70, 46, 28, 40, 24, 34, 18, 26, 44, 58, 38, 50,
  64, 40, 22, 32, 20,
];

export interface ProcessingScreenProps {
  submissionId: string;
  /** Original filenames in upload order — known client-side before any
   * review has happened, so the per-image list can render immediately. */
  imageFilenames: string[];
  creditsRemaining?: number;
}

export function ProcessingScreen({
  submissionId,
  imageFilenames,
  creditsRemaining,
}: ProcessingScreenProps) {
  const router = useRouter();
  const startedAtRef = useRef<number>(Date.now());

  const { data, connectionError } = useSubmissionStatus(submissionId, {
    onComplete: () => router.push(`/results/${submissionId}`),
    onFailed: () => {}, // handled inline below — stay on this page and show the error
  });

  const imagesTotal = data?.imagesTotal ?? imageFilenames.length;
  const imagesDone = data?.imagesDone ?? 0;
  const progress = imagesTotal > 0 ? Math.round((imagesDone / imagesTotal) * 100) : 0;
  const failed = data?.status === "failed";

  const etaSeconds = useMemo(() => {
    const remaining = imagesTotal - imagesDone;
    if (remaining <= 0) return 0;
    const elapsedSec = (Date.now() - startedAtRef.current) / 1000;
    // Adapt to the pace actually observed this run; fall back to a
    // reasonable guess before the first image finishes.
    const avgSecPerImage = imagesDone > 0 ? elapsedSec / imagesDone : 8;
    return Math.max(1, Math.round(avgSecPerImage * remaining));
  }, [imagesDone, imagesTotal]);

  const activeBarCount = Math.round((DECORATIVE_BAR_HEIGHTS.length * progress) / 100);

  const cards: { filename: string; state: ImageCardState; status?: string }[] = useMemo(() => {
    const doneImages: DoneImage[] = data?.doneImages ?? [];
    return imageFilenames.map((filename, i) => {
      if (i < doneImages.length) {
        return { filename: doneImages[i].filename || filename, state: "done", status: doneImages[i].status };
      }
      if (i === doneImages.length && !failed) {
        return { filename, state: "processing" };
      }
      return { filename, state: "queued" };
    });
  }, [data, imageFilenames, failed]);

  // Keep this tab's title honest about progress too, in case the user
  // switches away and comes back to check.
  useEffect(() => {
    if (failed) {
      document.title = "ตรวจสอบไม่สำเร็จ — ADCheck";
    } else {
      document.title = `กำลังตรวจสอบ ${progress}% — ADCheck`;
    }
  }, [progress, failed]);

  const ringDash = useMemo(() => {
    const r = 76;
    const circumference = 2 * Math.PI * r;
    return { circumference, filled: (progress / 100) * circumference };
  }, [progress]);

  return (
    <main>
      <Nav credits={creditsRemaining} />

      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="mb-8">
          <div className="w-fit rounded-pill bg-accentSoft text-accent px-3 py-1.5 text-xs font-medium mb-3">
            กำลังประมวลผลด้วย AI
          </div>
          <h1 className="text-2xl font-medium mb-2">กำลังตรวจสอบภาพโฆษณาของคุณ</h1>
          <p className="text-sm text-secondary lg:whitespace-nowrap">
            AI กำลังตรวจภาพทีละภาพตามคู่มือ สบส. — ใช้เวลาไม่นาน คุณสามารถรอที่หน้านี้หรือทำงานอื่นระหว่างรอได้
          </p>
        </div>

        {connectionError && !failed && (
          <div className="rounded-lg bg-warningSoft text-warning text-sm px-4 py-3 mb-6">
            การเชื่อมต่อขาดหาย กำลังลองใหม่โดยอัตโนมัติ…
          </div>
        )}

        {failed ? (
          <div className="rounded-lg border border-border bg-dangerSoft px-6 py-8 text-center">
            <p className="text-danger font-medium mb-2">การตรวจสอบไม่สำเร็จ</p>
            <p className="text-sm text-secondary mb-5">
              เกิดข้อผิดพลาดระหว่างประมวลผล เครดิตของคุณยังไม่ถูกหักในรอบนี้ ลองอัพโหลดใหม่อีกครั้ง
            </p>
            <a
              href="/upload"
              className="inline-block rounded-md bg-inverse text-onInverse px-6 py-3 text-sm font-medium"
            >
              กลับไปหน้าอัพโหลด
            </a>
          </div>
        ) : (
          <>
            {/* Progress hero */}
            <div className="flex items-center gap-8 mb-10">
              <div className="relative w-44 h-44 shrink-0">
                <svg viewBox="0 0 176 176" className="w-44 h-44 -rotate-90">
                  <circle cx="88" cy="88" r="76" fill="none" stroke="#E7E3DA" strokeWidth="16" />
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    fill="none"
                    stroke="#1F4D3D"
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={ringDash.circumference}
                    strokeDashoffset={ringDash.circumference - ringDash.filled}
                    style={{ transition: "stroke-dashoffset 500ms ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-medium text-primary">{progress}%</p>
                  <p className="text-[13px] text-secondary">
                    {imagesDone} / {imagesTotal} ภาพ
                  </p>
                </div>
              </div>

              <div className="flex-1 rounded-xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    <p className="text-[15px] font-medium text-primary">กำลังวิเคราะห์ด้วย AI</p>
                  </div>
                  <p className="text-[13px] text-secondary">
                    {etaSeconds > 0 ? `เหลือประมาณ ${etaSeconds} วินาที` : "ใกล้เสร็จแล้ว"}
                  </p>
                </div>

                <div className="flex items-end justify-center gap-2 h-[84px]">
                  {DECORATIVE_BAR_HEIGHTS.map((h, i) => (
                    <span
                      key={i}
                      className={`w-[9px] rounded-[3px] animate-eq-pulse ${
                        i < activeBarCount ? "bg-accent" : "bg-accentSoft"
                      }`}
                      style={{ height: h, animationDelay: `${(i % 6) * 90}ms` }}
                    />
                  ))}
                </div>

                <p className="mt-4 text-xs text-secondary text-center">
                  {imagesDone < imagesTotal
                    ? `กำลังตรวจสอบภาพที่ ${imagesDone + 1} จาก ${imagesTotal}`
                    : "กำลังสรุปผล…"}
                </p>
              </div>
            </div>

            {/* Per-image status */}
            <div className="mb-8">
              <p className="text-[15px] font-medium text-primary mb-4">สถานะรายภาพ</p>
              <div className="flex flex-wrap gap-4">
                {cards.map((c, i) => {
                  const badge =
                    c.state === "done" && c.status
                      ? STATUS_BADGE[c.status] ?? STATUS_BADGE.passed
                      : c.state === "processing"
                      ? { label: "กำลังตรวจสอบ", className: "bg-warningSoft text-warning" }
                      : { label: "รอคิว", className: "bg-page text-tertiary" };
                  return (
                    <div
                      key={i}
                      className="w-[196px] flex flex-col items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-4 shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                    >
                      <div className="relative w-[60px] h-[60px]">
                        <div className="w-[60px] h-[60px] rounded-md bg-accentSoft" />
                        <div
                          className={`absolute -right-1.5 -top-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium ${
                            c.state === "done"
                              ? "bg-accent text-onInverse"
                              : c.state === "processing"
                              ? "border-2 border-accent bg-surface text-accent animate-spin-slow"
                              : "border border-border bg-surface"
                          }`}
                        >
                          {c.state === "done" ? "✓" : ""}
                        </div>
                      </div>
                      <p className="w-[160px] truncate text-center text-[11px] text-secondary">
                        {c.filename}
                      </p>
                      <div className={`rounded-pill px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
                        {badge.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-tertiary mb-6">
              <span className="w-1 h-1 rounded-full bg-accent" />
              <span>
                ระบบตรวจสอบภาพทีละภาพอย่างละเอียดด้วย AI เพื่อความแม่นยำสูงสุด
                และจะพาไปหน้าแสดงผลทันทีที่เสร็จ
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <p className="text-[15px] text-secondary">
                ตรวจสอบแล้ว {imagesDone} จาก {imagesTotal} ภาพ ({progress}%)
              </p>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-md border border-border bg-page px-6 py-3.5 text-sm font-medium text-primary"
              >
                ทำงานเบื้องหลัง
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes eq-pulse {
          0%, 100% { transform: scaleY(1); opacity: 1; }
          50% { transform: scaleY(0.82); opacity: 0.85; }
        }
        .animate-eq-pulse { transform-origin: bottom; animation: eq-pulse 1.1s ease-in-out infinite; }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 1.2s linear infinite; }
      `}</style>
    </main>
  );
}

export default ProcessingScreen;
