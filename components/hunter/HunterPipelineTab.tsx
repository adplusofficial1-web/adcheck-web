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

// FIX (bug audit, 2569-09-01): STAGES used to list only 5 of the 6 valid
// PipelineStatus values — "no_response" was missing entirely, even though
// it's a real status in the type above, the hunter_lead_pipeline CHECK
// constraint (migrations/014_hunter_referral_commissions.sql), and the
// Sales-side equivalent this component was deliberately modeled after
// (components/sales/SalesLeadList.tsx's STATUS_OPTIONS has all 6). Without
// this column, a lead somehow set to "no_response" would have no button to
// reach that status and would render in NONE of the Kanban columns if it
// ever got there (leads.filter(l => l.pipeline_status === stage.key) would
// match no stage) — silently disappearing from the board. Added for parity
// with Sales and to close that gap before anything ever sets it.
//
// CHANGE (layout, 2569-09-01, per user request): the board used to be a
// fixed 260px-per-column flex row with overflow-x-auto — on the page's
// actual max-w-4xl container that only ever showed 3 of the 6 columns at
// once, so seeing "ปิดได้"/"ปิดไม่ได้"/"ไม่ตอบรับ" always meant scrolling
// right. Switched to a responsive CSS grid (2 columns on mobile, 3 on
// tablet, all 6 in one row from the lg breakpoint up, where the page's
// container comfortably fits them) so every stage is visible without a
// scrollbar, and gave each stage a small color dot (reusing the existing
// accent/warning/danger/tertiary tokens — no new colors) purely so the
// board scans at a glance instead of reading six identical gray headers.
const STAGES: { key: PipelineStatus; label: string; dot: string; text: string }[] = [
  { key: "new", label: "ส่งมาแล้ว", dot: "bg-tertiary", text: "text-secondary" },
  { key: "contacted", label: "ติดต่อแล้ว", dot: "bg-secondary", text: "text-secondary" },
  { key: "interested", label: "สนใจ", dot: "bg-warning", text: "text-warning" },
  { key: "closed_won", label: "ปิดได้", dot: "bg-accent", text: "text-accent" },
  { key: "closed_lost", label: "ปิดไม่ได้", dot: "bg-danger", text: "text-danger" },
  { key: "no_response", label: "ไม่ตอบรับ", dot: "bg-tertiary", text: "text-tertiary" },
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
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-1.5 flex-wrap">
        <span className="text-[13px] font-medium text-primary leading-snug break-words">{lead.clinic_name}</span>
        {lead.result_url && (
          <button
            type="button"
            onClick={copyResult}
            className="rounded-md bg-inverse text-onInverse px-1.5 py-1 text-[10px] font-medium whitespace-nowrap shrink-0"
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
            className={`rounded-pill px-1.5 py-0.5 text-[10px] font-medium border disabled:opacity-40 ${
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
      {/* CHANGE (2569-09-01, per user request "ขยายการแสดงผลให้กว้างขึ้น ให้
          ดูสวยงาม" after the page's max-width grew from max-w-4xl to
          max-w-6xl — see components/hunter/HunterShell.tsx): the extra
          room goes to a wider gap between columns and a touch more
          padding inside each one, so the board reads as spacious instead
          of the tight, edge-to-edge look it had at the old narrower
          width. Column count/breakpoints unchanged — still all 6 visible
          with no scrollbar from the lg breakpoint up. */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.pipeline_status === stage.key);
          return (
            <div key={stage.key} className="min-w-0 rounded-lg bg-page/60 border border-border p-2.5">
              <div className="flex items-center gap-1.5 px-0.5 pb-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stage.dot}`} />
                <span className={`text-[13px] font-medium truncate ${stage.text}`}>{stage.label}</span>
                <span className="ml-auto shrink-0 rounded-pill bg-surface border border-border px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                  {stageLeads.length}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {stageLeads.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-2 py-3 text-center">
                    <span className="text-[11px] text-tertiary">ไม่มีคลินิก</span>
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
