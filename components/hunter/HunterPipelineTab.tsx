"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// /hunter's "Pipeline" tab — every clinic this Hunter has been sent
// (admin's "ส่ง" queue — since migrations/017 each sent lead is assigned to
// exactly ONE Hunter, see lib/hunterPipeline.ts), grouped into
// columns by THIS Hunter's own PRIVATE status — see
// migrations/014_hunter_referral_commissions.sql for why status/notes here
// are private per Hunter rather than a shared column on hunter_leads
// (multiple Hunters can see and work the same clinic independently).
// Replaces the old flat table (components/hunter/HunterFreelancerList.tsx),
// which is no longer used by app/hunter/page.tsx.
//
// CHANGE (2569-09-01, per user request "เพิ่มปุ่ม ที่สามารถเพิ่มคลินิกที่หา
// มาเองได้ ลงใน pipeline"): a lead on this board can now come from either
// admin's shared queue OR this Hunter's own hunter_self_leads table (see
// migrations/016_hunter_self_leads.sql, lib/hunterPipeline.ts) — added via
// the new "+ เพิ่มคลินิกที่หาเอง" button below. Every card now carries
// `source` so status/notes updates and deletes route to the right table
// (see onUpdate/onDelete and app/api/hunter/leads/[id]/route.ts).

type PipelineStatus = "new" | "contacted" | "interested" | "closed_won" | "closed_lost" | "no_response";
type LeadSource = "admin" | "self";

type PipelineLead = {
  id: string;
  clinic_name: string;
  province: string | null;
  source_link: string | null;
  result_url: string | null;
  review_status: "passed" | "caution" | "violation" | null;
  flag_count: number | null;
  pipeline_status: PipelineStatus;
  status_changed_at: string;
  notes: string;
  source: LeadSource;
};

// CHANGE (2569-09-02, per user request "ทุกครั้งที่เปลี่ยนสถานะ อยากให้กำกับ
// วันที่ด้วย ทุกครั้งที่เปลี่ยน" + "เพิ่มในแต่ละคลินิก"): same relative-time-
// then-date-fallback convention components/sales/SalesLeadList.tsx already
// uses for "ได้รับมอบหมาย X ที่แล้ว" — reused here for "เปลี่ยนสถานะล่าสุด"
// on every card so recent changes read at a glance and older ones fall back
// to a plain Thai (Buddhist-era) date.
function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

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
// Bug Audit 4 (2569-09-02): source_link is free text (typed by the admin's
// Excel import or by the Hunter's own add form) — only treat it as an
// actual navigable web URL when it truly looks like one, so a stray
// "javascript:" or bare phone number can't be handed to window.open below.
// Same rule previously used for rendering it as a link (removed 2569-09-05
// per user request), reinstated now that copyMessage opens it directly.
function isWebUrl(v: string | null): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

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

// New (2569-09-05, per user request "เมื่อระบบแจกจ่าย Lead ให้ระบบ ส่ง link
// Referral ไปใส่ในสคริปเลยได้ไหม ให้ hunter ทำแค่ คัดลอก แล้วส่งให้ลูกค้าเลย"):
// builds the same outreach message finalized with the marketing team
// (clinic name + source link + flag count + result link + the standard
// สบส./มาตรา 38 context + the free-trial offer), with THIS Hunter's own
// referral link appended at the end so a signup traces back to them. Kept
// as a pure function (no component state) so it's trivial to keep in sync
// with the copy the marketing team maintains outside the codebase.
function composeOutreachMessage(lead: PipelineLead, referralLink: string): string {
  // Bug fix (2569-09-05, found via live test — a real lead had status=done
  // and a result_url but a null flag_count/review_status, one of 2 such
  // rows in production): never claim a violation count we don't actually
  // have. Falling back to "0 จุด" would be a false claim (reads as "zero
  // violations found"), not an honest "not categorized" statement — so the
  // count sentence is only included when flag_count is a real number.
  const paragraphs = [
    `เรียน ${lead.clinic_name}`,
    `ทีมงาน AdCheck ขอเรียนแจ้งผลการตรวจสอบโฆษณา โดยระบบ AI ตรวจสอบตามมาตรา 38 แห่งพระราชบัญญัติสถานพยาบาล พ.ศ. 2541${
      lead.source_link ? ` ได้ทำการตรวจสอบโพสต์โฆษณาจากลิงก์ดังต่อไปนี้ ${lead.source_link}` : ""
    }`,
    typeof lead.flag_count === "number"
      ? `ผลการตรวจสอบพบจุดที่เข้าข่ายผิดกฎหมายจำนวน ${lead.flag_count} จุด สามารถดูรายละเอียดผลการตรวจสอบฉบับเต็มได้ที่ลิงก์นี้ ${lead.result_url}`
      : `สามารถดูรายละเอียดผลการตรวจสอบฉบับเต็มได้ที่ลิงก์นี้ ${lead.result_url}`,
    `ในปีงบประมาณ 2569 กรมสนับสนุนบริการสุขภาพ (สบส.) ได้ตรวจสอบโฆษณาไปแล้ว 4,521 โพสต์ พบว่าผิดกฎหมายถึง 2,433 โพสต์ และกำลังจะมีระเบียบ "รางวัลนำจับ" ประกาศใช้เพิ่มเติม จึงขอเรียนแจ้งให้ทราบล่วงหน้าก่อนที่จะเกิดปัญหา`,
    `ทางบริษัทมีเครื่องมือตรวจสอบโฆษณาก่อนเผยแพร่ (adcheck.pro) เปิดให้ทดลองใช้ฟรี 15 ครั้ง ไม่มีค่าใช้จ่ายใดๆ ท่านสนใจทดลองใช้เพื่อตรวจสอบและแก้ไขจุดที่พบก่อนเผยแพร่หรือไม่ สมัครทดลองใช้งานได้ที่ ${referralLink}`,
  ];
  return paragraphs.join("\n\n");
}

function LeadCard({
  lead,
  onUpdate,
  onDelete,
  referralLink,
}: {
  lead: PipelineLead;
  onUpdate: (id: string, updates: { status?: PipelineStatus; notes?: string }, source: LeadSource) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  referralLink: string | null;
}) {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lead.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Cleared on unmount so a card removed (deleted / moved off-screen by a
  // parent reload) within the 2s window doesn't setState on a dead component.
  const copyMsgResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotesDraft(lead.notes);
  }, [lead.notes]);

  useEffect(() => {
    return () => {
      if (copyMsgResetTimer.current) clearTimeout(copyMsgResetTimer.current);
    };
  }, []);

  // Shared clipboard-write with an execCommand fallback (Safari/older
  // WebViews inside the /hunter page don't all support
  // navigator.clipboard.writeText from a non-HTTPS-secure or embedded context).
  const writeToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        document.body.removeChild(textarea);
        return false;
      }
      document.body.removeChild(textarea);
      return true;
    }
  };

  // New (2569-09-05): copies the full ready-to-send outreach message with
  // THIS Hunter's own referral link already inserted — see
  // composeOutreachMessage above. Disabled (see button below) until
  // referralLink has loaded, so a Hunter can never send a copy of the
  // message missing their own link.
  //
  // New (2569-09-05, per user request "ถ้ากดปุ่ม ข้อความส่งลูกค้าแล้ว ให้
  // เด้งไปหน้า เพจนั้นๆ ของลูกค้าด้วย"): after copying, also open the lead's
  // own source page in a new tab so the Hunter lands straight on the
  // clinic's page/profile ready to paste — no separate step to find it.
  // Gated on isWebUrl (see above) since source_link is free text; a
  // non-URL value (e.g. a bare phone number) is silently skipped rather
  // than handed to window.open. Runs even if the tab-open is blocked by
  // the browser's popup blocker — the clipboard copy above already
  // succeeded either way, so copyMsg feedback isn't held hostage by it.
  const copyMessage = async () => {
    if (!referralLink) return;
    const message = composeOutreachMessage(lead, referralLink);
    if (!(await writeToClipboard(message))) return;
    setCopiedMsg(true);
    if (copyMsgResetTimer.current) clearTimeout(copyMsgResetTimer.current);
    copyMsgResetTimer.current = setTimeout(() => setCopiedMsg(false), 2000);
    if (isWebUrl(lead.source_link)) {
      window.open(lead.source_link, "_blank", "noopener,noreferrer");
    }
  };

  const changeStatus = async (status: PipelineStatus) => {
    if (status === lead.pipeline_status || savingStatus) return;
    setSavingStatus(true);
    try {
      await onUpdate(lead.id, { status }, lead.source);
    } finally {
      setSavingStatus(false);
    }
  };

  const saveNotes = async () => {
    if (notesDraft === lead.notes) return;
    setSavingNotes(true);
    try {
      await onUpdate(lead.id, { notes: notesDraft }, lead.source);
    } finally {
      setSavingNotes(false);
    }
  };

  const removeSelf = async () => {
    if (deleting) return;
    if (!window.confirm(`ลบ "${lead.clinic_name}" ออกจาก Pipeline ของคุณ?`)) return;
    setDeleting(true);
    try {
      await onDelete(lead.id);
    } finally {
      setDeleting(false);
    }
  };

  const badge = lead.review_status ? REVIEW_BADGE[lead.review_status] : undefined;

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-1.5 flex-wrap">
        <span className="text-[13px] font-medium text-primary leading-snug break-words">{lead.clinic_name}</span>
      </div>
      {lead.province && <div className="text-[11px] text-tertiary mt-0.5">{lead.province}</div>}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {/* Self-sourced leads never go through the AI check, so there's
            never a review badge for them — this pill just says where the
            lead came from, so the two kinds are easy to tell apart on a
            board that now mixes both. */}
        {lead.source === "self" && (
          <span className="inline-block rounded-pill px-2 py-0.5 text-[10px] font-medium bg-accentSoft text-accent border border-accentSoft">
            หาเอง
          </span>
        )}
        {badge && (
          <span className={`inline-block rounded-pill px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
            {badge.label}
            {typeof lead.flag_count === "number" ? ` · ${lead.flag_count} จุด` : ""}
          </span>
        )}
      </div>
      {/* New (2569-09-05, per user request "ให้ hunter ทำแค่ คัดลอก แล้วส่งให้
          ลูกค้าเลย"): only for leads that actually went through the AI
          check (result_url set). A self-sourced or still-awaiting-images
          lead never has a result_url.
          FIX (2569-09-05, found via live test): this used to also require a
          non-null flag_count, but 2 real production leads have status=done
          and a result_url with flag_count/review_status never backfilled —
          composeOutreachMessage already degrades gracefully when flag_count
          is missing, so gating on it here only hid the button on real,
          checked leads for no benefit. */}
      {lead.result_url && (
        <button
          type="button"
          onClick={copyMessage}
          disabled={!referralLink}
          className="mt-2 w-full rounded-md bg-inverse text-onInverse px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
        >
          {!referralLink ? "กำลังโหลดลิงก์…" : copiedMsg ? "คัดลอกแล้ว ✓ พร้อมส่งลูกค้า" : "ข้อความส่งลูกค้า"}
        </button>
      )}
      <textarea
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
        onBlur={saveNotes}
        placeholder="โน้ต เช่น เบอร์ติดต่อ, นัดหมาย"
        rows={2}
        className="mt-2 w-full rounded-md border border-border bg-page px-2 py-1.5 text-[11px] text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      {/* CHANGE (2569-09-01, per user request "ช่องดูเบียดไปปรับให้เป็น
          ระเบียบ" / "สถานะปรับเป็น DROPDOWN"): the 6 status pill buttons
          used to wrap across 2-3 crowded rows on a narrow card — replaced
          with a single <select> that shows only the current stage until
          opened, so the card stays a fixed, tidy height regardless of
          label length. Same STAGES list, same changeStatus handler. */}
      <select
        value={lead.pipeline_status}
        disabled={savingStatus}
        onChange={(e) => changeStatus(e.target.value as PipelineStatus)}
        className="mt-2 w-full rounded-md border border-border bg-page px-2 py-1.5 text-[11px] text-primary disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {/* CHANGE (2569-09-02, per user request "ทุกครั้งที่เปลี่ยนสถานะ อยากให้
          กำกับวันที่ด้วย ทุกครั้งที่เปลี่ยน" + "เพิ่มในแต่ละคลินิก"): shows when
          THIS Hunter last moved this card's stage — not when the card was
          created/sent, and not bumped by a notes-only save (see
          lib/hunterPipeline.ts's status_changed_at). */}
      <div className="mt-1 text-[10px] text-tertiary">อัพเดท: {timeAgoLabel(lead.status_changed_at)}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {savingNotes ? <div className="text-[10px] text-tertiary">กำลังบันทึกโน้ต…</div> : <span />}
        {lead.source === "self" && (
          <button
            type="button"
            onClick={removeSelf}
            disabled={deleting}
            className="text-[10px] text-danger hover:underline disabled:opacity-50 shrink-0"
          >
            {deleting ? "กำลังลบ…" : "ลบ"}
          </button>
        )}
      </div>
    </div>
  );
}

// New (2569-09-01, per user request "เพิ่มปุ่ม ที่สามารถเพิ่มคลินิกที่หามาเอง
// ได้ ลงใน pipeline"): a small inline form, toggled by the "+ เพิ่มคลินิกที่
// หาเอง" button — only clinic_name is required, matching how little the
// admin's own Excel-import row needs (clinic/province/link, all free text).
function AddSelfLeadForm({ onAdd, onClose }: { onAdd: (fields: { clinicName: string; province: string; sourceLink: string }) => Promise<boolean>; onClose: () => void }) {
  const [clinicName, setClinicName] = useState("");
  const [province, setProvince] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!clinicName.trim() || saving) return;
    setSaving(true);
    try {
      const ok = await onAdd({ clinicName: clinicName.trim(), province: province.trim(), sourceLink: sourceLink.trim() });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-3 max-w-md">
      <div className="flex flex-col gap-2">
        <input
          value={clinicName}
          onChange={(e) => setClinicName(e.target.value)}
          placeholder="ชื่อคลินิก *"
          className="w-full rounded-md border border-border bg-page px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <input
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          placeholder="จังหวัด (ไม่บังคับ)"
          className="w-full rounded-md border border-border bg-page px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <input
          value={sourceLink}
          onChange={(e) => setSourceLink(e.target.value)}
          placeholder="ลิงก์เพจต้นทาง (ไม่บังคับ)"
          className="w-full rounded-md border border-border bg-page px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!clinicName.trim() || saving}
          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {saving ? "กำลังเพิ่ม…" : "เพิ่มลง Pipeline"}
        </button>
        <button type="button" onClick={onClose} className="text-xs text-secondary hover:underline">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export function HunterPipelineTab() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // New (2569-09-05): this Hunter's own referral link (same id + /login?ref=
  // pattern HunterOverviewTab.tsx already uses via /api/hunter/settings),
  // fetched once here and passed to every LeadCard so the "copy message"
  // button can append it. Left null (button stays disabled) if the fetch
  // fails — never send a message silently missing the Hunter's own link.
  const [referralLink, setReferralLink] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hunter/settings", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok && data?.settings?.id) {
          setReferralLink(`${window.location.origin}/login?ref=${data.settings.id}`);
        }
      } catch {
        // Silent — the copy-message button just stays disabled/loading.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUpdate = useCallback(
    async (id: string, updates: { status?: PipelineStatus; notes?: string }, source: LeadSource) => {
      // Bug Audit 4 (2569-09-02): fetch itself can reject (offline, DNS)
      // — previously that unhandled rejection left the card's saving
      // spinner stuck with no message. Same guard on onAdd/onDelete.
      let res: Response;
      let data: any;
      try {
        res = await fetch(`/api/hunter/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...updates, source }),
        });
        data = await res.json().catch(() => null as any);
      } catch {
        window.alert("อัปเดตไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง");
        return;
      }
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      setLeads((prev) =>
        prev
          ? prev.map((l) =>
              l.id === id
                ? {
                    ...l,
                    pipeline_status: data.pipelineStatus ?? l.pipeline_status,
                    notes: data.notes ?? l.notes,
                    status_changed_at: data.statusChangedAt ?? l.status_changed_at,
                  }
                : l
            )
          : prev
      );
    },
    []
  );

  const onAdd = useCallback(
    async (fields: { clinicName: string; province: string; sourceLink: string }) => {
      let res: Response;
      let data: any;
      try {
        res = await fetch("/api/hunter/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clinicName: fields.clinicName,
            province: fields.province || undefined,
            sourceLink: fields.sourceLink || undefined,
          }),
        });
        data = await res.json().catch(() => null as any);
      } catch {
        window.alert("เพิ่มคลินิกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง");
        return false;
      }
      if (!res.ok) {
        window.alert(data?.error || "เพิ่มคลินิกไม่สำเร็จ");
        return false;
      }
      setLeads((prev) => (prev ? [data.lead, ...prev] : [data.lead]));
      return true;
    },
    []
  );

  const onDelete = useCallback(async (id: string) => {
    let res: Response;
    let data: any;
    try {
      res = await fetch(`/api/hunter/leads/${id}?source=self`, { method: "DELETE" });
      data = await res.json().catch(() => null as any);
    } catch {
      window.alert("ลบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง");
      return;
    }
    if (!res.ok) {
      window.alert(data?.error || "ลบไม่สำเร็จ");
      return;
    }
    setLeads((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!leads) return <p className="text-sm text-secondary">กำลังโหลด…</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-secondary max-w-2xl">
          คลินิกที่แอดมินส่งมาให้ และคลินิกที่คุณหามาเอง — เลือกสถานะเพื่อย้ายขั้นตอน และจดโน้ตการติดต่อไว้ที่การ์ดแต่ละใบ (เห็นเฉพาะคุณ)
        </p>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="shrink-0 rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium whitespace-nowrap"
        >
          {showAddForm ? "ปิดฟอร์ม" : "+ เพิ่มคลินิกที่หาเอง"}
        </button>
      </div>
      {showAddForm && <AddSelfLeadForm onAdd={onAdd} onClose={() => setShowAddForm(false)} />}
      {leads.length === 0 ? (
        <p className="mt-5 text-sm text-secondary">
          ยังไม่มีคลินิกใน Pipeline — รอแอดมินส่งมาให้ หรือกด &quot;+ เพิ่มคลินิกที่หาเอง&quot; ด้านบนเพื่อเพิ่มเอง
        </p>
      ) : (
        // CHANGE (2569-09-01, per user request "ขยายการแสดงผลให้กว้างขึ้น ให้
        // ดูสวยงาม" after the page's max-width grew from max-w-4xl to
        // max-w-6xl — see components/hunter/HunterShell.tsx): the extra
        // room goes to a wider gap between columns and a touch more
        // padding inside each one, so the board reads as spacious instead
        // of the tight, edge-to-edge look it had at the old narrower
        // width. Column count/breakpoints unchanged — still all 6 visible
        // with no scrollbar from the lg breakpoint up.
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
                    stageLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onUpdate={onUpdate} onDelete={onDelete} referralLink={referralLink} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
