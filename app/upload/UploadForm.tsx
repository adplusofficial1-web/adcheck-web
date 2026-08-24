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

export function UploadForm({ creditsRemaining }: { creditsRemaining: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setLoadingFiles(true);
    const picked = Array.from(files).slice(0, 5);
    const next = await Promise.all(
      picked.map(async (f) => ({
        filename: f.name,
        caption: "",
        base64: await fileToBase64(f),
        mediaType: f.type || "image/jpeg",
      }))
    );
    setRows(next);
    setLoadingFiles(false);
  }

  function updateCaption(i: number, caption: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, caption } : row)));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: rows }),
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

  return (
    <div>
      <label className="block border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer mb-6">
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="text-sm text-secondary">
          {loadingFiles ? "กำลังโหลดไฟล์..." : "ลากภาพมาวาง หรือคลิกเพื่อเลือกไฟล์ (สูงสุด 5 ภาพ)"}
        </div>
      </label>

      {rows.length > 0 && (
        <div className="space-y-3 mb-6">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3 border border-border rounded-lg p-3">
              <img src={row.base64} className="h-10 w-10 rounded-md object-cover shrink-0" alt="" />
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">{row.filename}</div>
                <input
                  type="text"
                  placeholder="+ เพิ่มคำบรรยาย (ข้อความที่จะใช้ในโฆษณา)"
                  value={row.caption}
                  onChange={(e) => updateCaption(i, e.target.value)}
                  className="w-full text-sm border border-border rounded-md px-3 py-2"
                />
              </div>
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
