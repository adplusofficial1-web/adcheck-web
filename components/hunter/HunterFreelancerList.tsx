"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HunterLeadPublicView } from "@/lib/hunterLeads";

// The Hunter Freelancer Page's (/hunter) main table — see
// app/hunter/page.tsx and the project doc "Hunter Freelancer Page -
// Design.md" for the full writeup. Deliberately minimal and read-only per
// the user's explicit spec (2026-09-01): just clinic name (linked to its
// source_link) and a "ผลตรวจสอบ" button that copies the finished result
// link — no Excel upload, no image-URL entry, no delete, none of the
// admin-only editing controls in components/admin/HunterImport.tsx. This
// is intentionally a separate, narrower component rather than reusing
// HunterImport with a "freelancer mode" flag — the two audiences
// (platform admin vs. external freelancer) should never share one
// component that has to remember which controls to hide.

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

const STATUS_LABELS: Record<string, string> = {
  awaiting_images: "รอดึงรูป",
  ready: "รอตรวจสอบ",
  running: "กำลังตรวจสอบ…",
  failed: "ตรวจสอบไม่สำเร็จ",
  done: "เสร็จแล้ว",
};

// One row's "ผลตรวจสอบ" cell — copies lead.result_url on click, same
// clipboard-with-fallback approach as
// components/admin/HunterImport.tsx:copyResultLink (kept as a duplicate
// here rather than a shared helper since it's ~15 lines and the two
// components should stay fully independent per the note above).
function ResultButton({ resultUrl, status }: { resultUrl: string | null; status: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  if (!resultUrl) {
    return <span className="text-xs text-tertiary">{STATUS_LABELS[status] ?? status}</span>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resultUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = resultUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium whitespace-nowrap"
    >
      {copied ? "คัดลอกแล้ว ✓" : "ผลตรวจสอบ"}
    </button>
  );
}

export function HunterFreelancerList() {
  const [leads, setLeads] = useState<HunterLeadPublicView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter/leads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      setLeads(data.leads);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-sm text-secondary">
          {leads ? `ทั้งหมด ${leads.length} รายการ` : "กำลังโหลด…"}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary disabled:opacity-40"
        >
          {refreshing ? "กำลังรีเฟรช…" : "รีเฟรช"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>#</th>
              <th className={thClass}>ชื่อคลินิก</th>
              <th className={thClass}>ผลตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>
            {!leads ? (
              <tr>
                <td colSpan={3} className="text-center text-tertiary py-6">
                  กำลังโหลด…
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-tertiary py-6">
                  ยังไม่มีรายการ
                </td>
              </tr>
            ) : (
              leads.map((lead, i) => (
                <tr key={lead.id}>
                  <td className={tdClass}>{i + 1}</td>
                  <td className={tdClass}>
                    {lead.source_link ? (
                      <a
                        href={lead.source_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent underline break-all"
                      >
                        {lead.clinic_name}
                      </a>
                    ) : (
                      <div className="font-medium text-primary">{lead.clinic_name}</div>
                    )}
                  </td>
                  <td className={tdClass}>
                    <ResultButton resultUrl={lead.result_url} status={lead.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
