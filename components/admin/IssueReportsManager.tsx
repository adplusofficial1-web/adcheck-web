"use client";

import { useState } from "react";
import type { IssueReport, IssueReportStatus } from "@/lib/issueReports";
import { formatThaiDateTime } from "@/lib/formatDateTime";

const STATUS_LABEL: Record<IssueReportStatus, string> = {
  new: "ใหม่",
  in_progress: "กำลังดำเนินการ",
  resolved: "แก้ไขแล้ว",
};

const STATUS_STYLE: Record<IssueReportStatus, string> = {
  new: "bg-dangerSoft text-danger",
  in_progress: "bg-warningSoft text-warning",
  resolved: "bg-accentSoft text-accent",
};

// Admin inbox for /report-problem submissions — one card per report,
// newest first (already sorted by lib/issueReports.ts:listIssueReports).
// Deliberately no delete here: unlike the knowledge base (where a wrong
// entry actively harms review quality), a resolved report is just history
// worth keeping — "resolved" status is the only lifecycle it needs.
export function IssueReportsManager({ initialReports }: { initialReports: IssueReport[] }) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<"all" | IssueReportStatus>("all");

  function onChanged(id: string, patch: Partial<IssueReport>) {
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const visible = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-pill bg-page p-1 w-fit border border-border">
        {(["all", "new", "in_progress", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-pill px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === f ? "bg-inverse text-onInverse" : "text-secondary hover:text-primary"
            }`}
          >
            {f === "all" ? "ทั้งหมด" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-tertiary">
            ไม่มีรายการในหมวดนี้
          </div>
        )}
        {visible.map((report) => (
          <ReportCard key={report.id} report={report} onChanged={(patch) => onChanged(report.id, patch)} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onChanged,
}: {
  report: IssueReport;
  onChanged: (patch: Partial<IssueReport>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: IssueReportStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/issue-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      onChanged({ status, updated_at: data.updated_at });
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="text-sm font-medium">{report.business_name}</div>
          <div className="text-xs text-tertiary">
            {report.contact_email || "ไม่มีอีเมลติดต่อ"} · {formatThaiDateTime(report.created_at)}
          </div>
        </div>
        <span className={`shrink-0 rounded-pill text-xs font-medium px-3 py-1 ${STATUS_STYLE[report.status]}`}>
          {STATUS_LABEL[report.status]}
        </span>
      </div>

      <div className="space-y-3 mb-4">
        {report.items.map((item, i) => (
          <div key={i} className="rounded-md bg-page px-4 py-3">
            <div className="text-sm font-medium mb-1">{item.label}</div>
            <div className="text-sm text-secondary whitespace-pre-wrap">{item.detail}</div>
          </div>
        ))}
        {report.message && (
          <div className="rounded-md bg-page px-4 py-3">
            <div className="text-xs text-tertiary mb-1">ข้อความเพิ่มเติม</div>
            <div className="text-sm text-secondary whitespace-pre-wrap">{report.message}</div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      <div className="flex items-center gap-2">
        {(["new", "in_progress", "resolved"] as const)
          .filter((s) => s !== report.status)
          .map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => setStatus(s)}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-page disabled:opacity-50"
            >
              ทำเครื่องหมายเป็น &ldquo;{STATUS_LABEL[s]}&rdquo;
            </button>
          ))}
      </div>
    </div>
  );
}
