"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { filename: string; caption: string; base64: string; mediaType: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Matches Anthropic's vision API's own internal resize ceiling (see
// https://docs.claude.com/en/docs/build-with-claude/vision) — an image
// longer than this on its longest edge gets downsized by Claude before it's
// ever analyzed, so sending anything bigger doesn't make the review more
// accurate. It just means more bytes to read off disk, base64-encode,
// upload, store in the DB, and hand to the AI. Phone-camera photos are
// routinely 3000-4000px, so resizing client-side to this ceiling (only when
// the original is actually bigger) cuts upload + review time for the
// common case with zero effect on what the AI sees.
const MAX_IMAGE_DIMENSION = 1568;

// Resizes only the pixel dimensions, never the encoding quality: PNG is
// re-encoded as PNG (lossless — keeps small ad text and any transparency
// perfectly sharp, since the AI has to read exact quoted text off the
// image) and anything else as JPEG at quality 0.92 (high enough that the
// resize itself — not compression — is what accounts for the smaller file).
// Falls back to the untouched original on any decode/canvas failure (e.g. a
// format the browser can't rasterize) rather than risk breaking an upload.
async function fileToResizedBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const original = await fileToBase64(file);
  const mediaType = file.type || "image/jpeg";

  try {
    const img = await loadImage(original);
    const longestEdge = Math.max(img.width, img.height);
    if (longestEdge <= MAX_IMAGE_DIMENSION) {
      // Already small enough — resizing would only re-encode it for no
      // benefit (and could even cost a little quality on JPEG for nothing).
      return { base64: original, mediaType };
    }

    const scale = MAX_IMAGE_DIMENSION / longestEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64: original, mediaType };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const outputType = mediaType === "image/png" ? "image/png" : "image/jpeg";
    const resizedBase64 =
      outputType === "image/jpeg" ? canvas.toDataURL(outputType, 0.92) : canvas.toDataURL(outputType);
    return { base64: resizedBase64, mediaType: outputType };
  } catch {
    return { base64: original, mediaType };
  }
}

export function UploadForm({
  creditsRemaining,
  businessId,
}: {
  creditsRemaining: number;
  // Present only when uploading on behalf of a clinic from Agency mode
  // (see app/upload/page.tsx's ?business= param) — forwarded to the API so
  // it reviews against and deducts that clinic's credits, not the
  // signed-in account's own.
  businessId?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setLoadingFiles(true);
    const remainingSlots = Math.max(0, 5 - rows.length);
    const picked = Array.from(files).slice(0, remainingSlots);
    const added = await Promise.all(
      picked.map(async (f) => {
        const { base64, mediaType } = await fileToResizedBase64(f);
        return {
          filename: f.name,
          // caption is no longer entered by the user on this screen, but the
          // field stays on the row/API contract (used downstream by the AI
          // review prompt, DB storage, and the results/PDF views) — it's
          // just always empty from here on.
          caption: "",
          base64,
          mediaType,
        };
      })
    );
    setRows((current) => [...current, ...added]);
    setLoadingFiles(false);
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: rows, businessId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
      // The API responds as soon as the submission row exists — the actual
      // AI review keeps running in the background (see
      // app/api/submissions/route.ts) — so send the user to the real-time
      // Processing screen now, not straight to /results. Filenames go along
      // via the URL since this is the only place that has them before any
      // review has completed.
      const filenames = rows.map((r) => r.filename);
      router.push(`/processing/${data.id}?files=${encodeURIComponent(JSON.stringify(filenames))}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const atLimit = rows.length >= 5;

  return (
    <div>
      <label
        className={`block border-2 border-dashed border-border rounded-lg p-10 text-center mb-6 ${
          atLimit ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          disabled={atLimit}
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="text-sm text-secondary">
          {loadingFiles
            ? "กำลังโหลดไฟล์..."
            : atLimit
            ? "เลือกครบ 5 ภาพแล้ว — ลบภาพออกก่อนเพื่อเพิ่มใหม่"
            : rows.length > 0
            ? `ลากภาพมาวาง หรือคลิกเพื่อเพิ่มภาพ (เลือกแล้ว ${rows.length}/5)`
            : "ลากภาพมาวาง หรือคลิกเพื่อเลือกไฟล์ (สูงสุด 5 ภาพ)"}
        </div>
      </label>

      {rows.length > 0 && (
        <div className="space-y-3 mb-6">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3 border border-border rounded-lg p-3">
              <img src={row.base64} className="h-10 w-10 rounded-md object-cover shrink-0" alt="" />
              <div className="flex-1 text-sm font-medium truncate">{row.filename}</div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="w-8 h-8 rounded-md border border-dangerSoft text-danger flex items-center justify-center hover:bg-dangerSoft shrink-0 text-lg leading-none"
                aria-label={`ลบภาพ ${row.filename}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      <div className="flex items-center justify-between">
        <span className="text-sm text-secondary">
          ใช้ {rows.length} เครดิต จากที่เหลือ {creditsRemaining}
        </span>
        <button
          disabled={rows.length === 0 || submitting || rows.length > creditsRemaining}
          onClick={submit}
          className="rounded-md bg-inverse text-onInverse px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          {submitting ? "กำลังเริ่มตรวจสอบ..." : `เริ่มตรวจสอบ ${rows.length || ""} ภาพ`}
        </button>
      </div>
    </div>
  );
}
