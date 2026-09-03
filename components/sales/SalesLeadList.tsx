"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SalesLeadAssignment, SalesStatus } from "@/lib/salesLeads";

// /sales (app/sales/page.tsx) — a signed-in, whitelisted sales rep's own
// lead list: leads Hunter found a compliance problem on, assigned to this
// rep by the daily distribution cron (scripts/salesLeadDistributionJob.ts).
// Styling tokens/patterns (thClass-equivalent card look, copy-to-clipboard
// with execCommand fallback, disabled-while-saving buttons) mirror
// components/admin/HunterImport.tsx so this area feels like the same app,
// not a bolted-on second product.

const STATUS_LABELS: Record<SalesStatus, string> = {
  new: "ใหม่",
  contacted: "ติดต่อแล้ว",
  interested: "สนใจ",
  closed_won: "ปิดขายได้",
  closed_lost: "ปิดขายไม่ได้",
  no_response: "ไม่ตอบรับ",
};

const OPEN_STATUSES: SalesStatus[] = ["new", "contacted", "interested"];
const STATUS_OPTIONS: SalesStatus[] = ["new", "contacted", "interested", "closed_won", "closed_lost", "no_response"];

const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  violation: { label: "ห้ามเด็ดขาด", className: "bg-dangerSoft text-danger border border-dangerSoft" },
  caution: { label: "ควรระวัง", className: "bg-warningSoft text-warning border border-warningSoft" },
};

// Bug Audit 4 (2569-09-02): source_link is free text from the admin's
// Excel import — only render it as an <a href> when it's an actual web URL
// (same rule as components/hunter/HunterPipelineTab.tsx).
function isWebUrl(v: string | null): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

function LeadCard({
  lead,
  onUpdate,
}: {
  lead: SalesLeadAssignment;
  onUpdate: (id: string, updates: { salesStatus?: SalesStatus; notes?: string }) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotesDraft(lead.notes ?? "");
  }, [lead.notes]);

  const copyResultLink = async () => {
    if (!lead.result_url) return;
    try {
      await navigator.clipboard.writeText(lead.result_url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = lead.result_url;
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
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const changeStatus = async (status: SalesStatus) => {
    if (status === lead.sales_status || savingStatus) return;
    setSavingStatus(true);
    try {
      await onUpdate(lead.id, { salesStatus: status });
    } finally {
      setSavingStatus(false);
    }
  };

  const saveNotes = async () => {
    if (notesDraft === (lead.notes ?? "")) return;
    setSavingNotes(true);
    try {
      await onUpdate(lead.id, { notes: notesDraft });
    } finally {
      setSavingNotes(false);
    }
  };

  const badge = lead.review_status ? REVIEW_BADGE[lead.review_status] : undefined;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-primary">{lead.clinic_name}</span>
            {lead.province && <span className="text-xs text-tertiary">({lead.province})</span>}
            {badge && (
              <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                {badge.label}
                {typeof lead.flag_count === "number" ? ` · ${lead.flag_count} จุด` : ""}
              </span>
            )}
          </div>
          {lead.source_link &&
            (isWebUrl(lead.source_link) ? (
              <a
                href={lead.source_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-accent underline break-all"
              >
                ลิงก์เพจต้นทาง
              </a>
            ) : (
              <div className="mt-1 text-xs text-secondary break-all">ต้นทาง: {lead.source_link}</div>
            ))}
        </div>
        {lead.result_url && (
          <button
            type="button"
            onClick={copyResultLink}
            className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์ผลตรวจสอบ"}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={savingStatus}
            onClick={() => changeStatus(s)}
            className={`rounded-pill px-2.5 py-1 text-xs font-medium border disabled:opacity-40 ${
              s === lead.sales_status
                ? "bg-inverse text-onInverse border-inverse"
                : "bg-surface text-secondary border-border hover:bg-page"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <textarea
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
        onBlur={saveNotes}
        placeholder="โน้ต (เช่น เบอร์ติดต่อ, นัดหมาย, เหตุผลที่ปิดไม่ได้)"
        rows={2}
        className="mt-3 w-full rounded-md border border-border bg-page px-2.5 py-2 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-tertiary">
        <span>ได้รับมอบหมาย {timeAgoLabel(lead.assigned_at)}</span>
        <span>{savingNotes ? "กำลังบันทึกโน้ต…" : " "}</span>
      </div>
    </div>
  );
}

export function SalesLeadList() {
  const [leads, setLeads] = useState<SalesLeadAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/leads");
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

  const onUpdate = useCallback(
    async (id: string, updates: { salesStatus?: SalesStatus; notes?: string }) => {
      const res = await fetch(`/api/sales/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      setLeads((prev) => (prev ? prev.map((l) => (l.id === id ? data.lead : l)) : prev));
    },
    []
  );

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }
  if (!leads) {
    return <p className="text-sm text-secondary">กำลังโหลด…</p>;
  }
  if (leads.length === 0) {
    return (
      <p className="text-sm text-secondary">
        ยังไม่มี Lead ที่ได้รับมอบหมาย — ระบบจะจัดสรรให้อัตโนมัติทุกวัน เมื่อมี Lead ที่ Hunter ตรวจพบปัญหา
      </p>
    );
  }

  const openCount = leads.filter((l) => OPEN_STATUSES.includes(l.sales_status)).length;
  const closedWonCount = leads.filter((l) => l.sales_status === "closed_won").length;

  return (
    <div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-secondary flex flex-wrap gap-x-6 gap-y-1">
        <span>
          เปิดอยู่ <span className="font-medium text-primary">{openCount}/10</span>
        </span>
        <span>
          ปิดขายได้ <span className="font-medium text-primary">{closedWonCount}</span> ราย
        </span>
        <span>
          ทั้งหมด <span className="font-medium text-primary">{leads.length}</span> ราย
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}
