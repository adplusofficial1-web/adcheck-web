"use client";

import { useCallback, useEffect, useState } from "react";

// /hunter's "Pipeline" tab — every clinic this Hunter has been sent
// (admin's "ส่ง" queue, shared across every active Hunter), grouped into
// columns by THIS Hunter's own PRIVATE status — see
// migrations/014_hunter_referral_commissions.sql for why status/notes here
// are private per Hunter rather than a shared column on hunter_leads
// (multiple Hunters can see and work the same clinic independently).
// Replaces the old flat table (components/hunter/HunterFreelancerList.tsx),
// which is no longer used by app/hunter/page.tsx.

type PipelineStatus = "new" | "contacted" | "interested" | "closed_won" | "closed_lost" | "no_response";

type PipelineLead = {
  id: string;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  result_url: string | null;
  review_status: "passed" | "caution" | "violation" | null;
  flag_count: number | null;
  pipeline_status: PipelineStatus;
  notes: string;
};

const STAGES: { key: PipelineStatus; label: string }[] = [
  { key: "new", label: "ส่งมาแล้ว" },
  { key: "contacted", label: "ติดต่อแล้ว" },
  { key: "interested", label: "สนใจ" },
  { key: "closed_won", label: "ปิดได้" },
  { key: "closed_lost", label: "ปิดไม่ได้" },
];

const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  violation: { label: "ห้ามเด็ดขาด", className: "bg-dangerSoft text-danger border border-dangerSoft" },
  caution: { label: "ควรระวัง", className: "bg-warningSoft text-warning border border-warningSoft" },
};

function LeadCard({ lead, onUpdate }: { lead: PipelineLead; onUpdate: (id: string, updates: { status?: PipelineStatus; notes?: string }) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lead.notes);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotesDraft(lead.notes);
  }, [lead.notes]);

  const copyResult = async () => {
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
    setTimeout(() => setCopied(false), 2000);
  };

  const changeStatus = async (status: PipelineStatus) => {
    if (status === lead.pipeline_status || savingStatus) return;
    setSavingStatus(true);
    try {
      await onUpdate(lead.id, { status });
    } finally {
      setSavingStatus(false);
    }
  };

  const saveNotes = async () => {
    if (notesDraft === lead.notes) return;
    setSavingNotes(true);
    try {
      await onUpdate(lead.id, { notes: notesDraft });
    } finally {
      setSavingNotes(false);
    }
  };

  const badge = lead.review_status ? REVIEW_BADGE[lead.review_status] : undefined;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-primary">{lead.clinic_name}</span>
        {lead.result_url && (
          <button
            type="button"
            onClick={copyResult}
            className="rounded-md bg-inverse text-onInverse px-2 py-1 text-[10px] font-medium whitespace-nowrap shrink-0"
          >
            {copied ? "คัดลอกแล้ว ✓" : "ผลตรวจสอบ"}
          </button>
        )}
      </div>
      {lead.province && <div className="text-[11px] text-tertiary mt-0.5">{lead.province}</div>}
      {badge && (
        <span className={`mt-1.5 inline-block rounded-pill px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
          {badge.label}
          {typeof lead.flag_count === "number" ? ` · ${lead.flag_count} จุด` : ""}
        </span>
      )}
      {lead.source_link && (
        <a href={lead.source_link} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[11px] text-accent underline break-all">
          ลิงก์เพจต้นทาง
        </a>
      )}
      <textarea
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
        onBlur={saveNotes}
        placeholder="โน้ต เช่น เบอร์ติดต่อ, นัดหมาย"
        rows={2}
        className="mt-2 w-full rounded-md border border-border bg-page px-2 py-1.5 text-[11px] text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={savingStatus}
            onClick={() => changeStatus(s.key)}
            className={`rounded-pill px-2 py-0.5 text-[10px] font-medium border disabled:opacity-40 ${
              s.key === lead.pipeline_status
                ? "bg-inverse text-onInverse border-inverse"
                : "bg-surface text-secondary border-border hover:bg-page"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {savingNotes && <div className="mt-1 text-[10px] text-tertiary">กำลังบันทึกโน้ต…</div>}
    </div>
  );
}

export function HunterPipelineTab() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const onUpdate = useCallback(async (id: string, updates: { status?: PipelineStatus; notes?: string }) => {
    const res = await fetch(`/api/hunter/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => null as any);
    if (!res.ok) {
      window.alert(data?.error || "อัปเดตไม่สำเร็จ");
      return;
    }
    setLeads((prev) =>
      prev
        ? prev.map((l) =>
            l.id === id
              ? { ...l, pipeline_status: data.pipelineStatus ?? l.pipeline_status, notes: data.notes ?? l.notes }
              : l
          )
        : prev
    );
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!leads) return <p className="text-sm text-secondary">กำลังโหลด…</p>;
  if (leads.length === 0) {
    return (
      <p className="text-sm text-secondary">
        ยังไม่มีคลินิกที่ถูกส่งมาให้คุณ — แอดมินจะกด &quot;ส่ง&quot; เมื่อตรวจสอบเสร็จแล้ว
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-secondary max-w-2xl">
        คลินิกที่แอดมินส่งมาให้ — กดสถานะเพื่อย้ายขั้นตอน และจดโน้ตการติดต่อไว้ที่การ์ดแต่ละใบ (เห็นเฉพาะคุณ)
      </p>
      <div className="mt-5 flex gap-3.5 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.pipeline_status === stage.key);
          return (
            <div key={stage.key} style={{ minWidth: 260, maxWidth: 260 }} className="shrink-0">
              <div className="flex items-center justify-between px-0.5 pb-2.5">
                <span className="text-sm font-medium text-primary">{stage.label}</span>
                <span className="text-xs text-tertiary">{stageLeads.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {stageLeads.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                    <span className="text-xs text-tertiary">ยังไม่มีคลินิกในขั้นนี้</span>
                  </div>
                ) : (
                  stageLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onUpdate={onUpdate} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
