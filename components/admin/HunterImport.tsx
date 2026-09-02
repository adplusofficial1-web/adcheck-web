"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import type { HunterLead } from "@/lib/hunterLeads";

// Admin > Marketing > Hunter — Hunter อัปโหลดรายชื่อคลินิกเป็นไฟล์ Excel
// (.xlsx/.xls/.csv) ระบบจะจับคอลัมน์ ชื่อคลินิก / จังหวัด / ลิงก์ อัตโนมัติ
// (รองรับหัวตารางไทย/อังกฤษ) แล้วนำเข้าคิว "รอ Hunter ดึงรูป" ให้ Hunter
// กรอกลิงก์รูปที่ดึงมาได้ (สูงสุด 3 รูปต่อคลินิก) แล้วกดปุ่ม "ตรวจสอบอัตโนมัติ"
// เพื่อส่งแต่ละรูปเข้า AI ตรวจสอบจริงและได้ลิงก์ผลตรวจสอบ
// (adcheck.pro/share/{token}) กลับมาโดยอัตโนมัติ — ไม่ต้องมีคนอัปโหลดเข้า
// adcheck.pro ทีละรูปด้วยมืออีกต่อไป
//
// CHANGE: คิวนี้เคยเก็บใน localStorage ของเบราว์เซอร์ (เห็นเฉพาะเครื่องที่
// import ไว้) — ย้ายมาเก็บในตาราง hunter_leads จริง (ดู
// migrations/009_hunter_queue.sql, lib/hunterLeads.ts) ผ่าน
// /api/admin/hunter เพื่อให้ทุกคนที่เข้าหน้านี้เห็นคิวเดียวกัน และเพื่อให้ปุ่ม
// "ตรวจสอบอัตโนมัติ" (/api/admin/hunter/[id]/run) มีที่เก็บผลลัพธ์ฝั่งเซิร์ฟเวอร์
// ให้เขียนกลับ
//
// สร้างเป็นแท็บย่อยของ /admin/marketing (ไม่ใช่ /admin/hunter ตามที่ไฟล์ต้นฉบับ
// แนะนำ) ตามคำขอผู้ใช้ — ดู components/admin/MarketingSubNav.tsx
//
// ADDED (2026-09-01, per user request: "ทุกครั้งที่เพิ่มคลินิก หรือ เพิ่มไฟล์
// ให้ระบบลบชื่อที่ซ้ำกับที่ในระบบมีก่อนทุกครั้ง ถ้าเพิ่ม 1000 รายการ ให้มี
// ตัวเลื่อนหน้า ให้ดูง่ายขึ้น แล้วมีปุ่มติ๊กที่สามารถลบเป็นกลุ่มได้"): three
// additions, all scoped to this file (+ the small server changes noted
// where they apply):
//   1. Dedupe by clinic name (confirmed with user: name only, not
//      name+province) — the authoritative skip happens server-side in
//      lib/hunterLeads.ts:importHunterLeads; this file just previews it
//      (dupInFile / dupInSystem badges below) before the admin even clicks
//      "นำเข้าทั้งหมดเข้าคิว", and shows how many were actually skipped once
//      the import response comes back.
//   2. Pagination on "คิว Hunter" (PAGE_SIZE below) — status-filter tabs
//      and pagination compose: the filter narrows visibleLeads, pagination
//      then pages through whatever that filter left.
//   3. Checkbox column + "ลบที่เลือก" bulk delete, calling the new
//      DELETE /api/admin/hunter/bulk endpoint (lib/hunterLeads.ts:
//      bulkDeleteHunterLeads) — reports partial failures (a lead already
//      assigned to a sales rep can't be deleted, see that function's
//      comment) rather than silently losing track of them.

type ParsedRow = {
  clinic: string;
  province: string;
  link: string;
  // Preview-only hints, computed in handleFile — see normalizeClinicName
  // below. Neither one blocks import; the server is the authority on what
  // actually gets skipped (importHunterLeads in lib/hunterLeads.ts).
  dupInFile?: boolean;
  dupInSystem?: boolean;
};

const CLINIC_KEYS = ["ชื่อคลินิก", "คลินิก", "clinic", "clinic name", "name", "ชื่อ"];
const PROVINCE_KEYS = ["จังหวัด", "province"];
// NOTE: ลิงก์เพจตรึงไว้ที่คอลัมน์ D (index 3) ตรงๆ แล้ว — ดูจุดที่กำหนด
// linkIdx = 3 ด้านล่าง — จึงไม่ต้องมี LINK_KEYS สำหรับเดาจากชื่อหัวตารางอีก

function findKeyIndex(header: string[], keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const norm = String(header[i] || "").trim().toLowerCase();
    if (keys.some((k) => norm === k || norm.includes(k))) return i;
  }
  return -1;
}

// Mirrors lib/hunterLeads.ts:normalizeClinicName exactly (trim + lowercase,
// clinic name only) — duplicated here as a small pure function rather than
// imported, since this is a client component and lib/hunterLeads.ts pulls
// in the server-only @/lib/db Neon client that has no business in the
// browser bundle. Used only for the preview badges below; the server call
// in lib/hunterLeads.ts is what's actually authoritative.
function normalizeClinicName(name: string): string {
  return name.trim().toLowerCase();
}

// NOTE: the old STATUS_META badge map (สถานะ column) was removed along
// with the "สถานะ" column per user request (2026-08-31) — lead.status is
// still used internally (gating run/delete buttons, the "failed" error
// message, the run-all-ready count) even though it's no longer shown as
// its own badge.
//
// CHANGE (2026-09-01, "ส่ง" workflow): a "สถานะ" column is back, but it's a
// different, coarser 3-state view than the old one — รอตรวจสอบ (not
// status='done' yet) / รอคิว (status='done' but not sent to Hunter
// freelancers yet) / ส่งสำเร็จ (hunter_sent_at is set — visible on /hunter).
// See displayStatus() below and migrations/013_hunter_sent.sql.

type DisplayStatus = "awaiting_review" | "queued" | "sent";

function displayStatus(lead: HunterLead): DisplayStatus {
  if (lead.hunter_sent_at) return "sent";
  if (lead.status === "done") return "queued";
  return "awaiting_review";
}

const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  awaiting_review: "รอตรวจสอบ",
  queued: "รอคิว",
  sent: "ส่งสำเร็จ",
};

function StatusBadge({ status }: { status: DisplayStatus }) {
  const cls =
    status === "sent"
      ? "bg-accentSoft text-accent"
      : status === "queued"
      ? "bg-warningSoft text-warning"
      : "bg-page text-tertiary border border-border";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";
const smallInputClass =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";

// Pagination page size for "คิว Hunter" (2026-09-01, per user request: "ถ้า
// เพิ่ม 1000 รายการ ให้มีตัวเลื่อนหน้า ให้ดูง่ายขึ้น"). Applies AFTER the
// status-filter tabs narrow the list — see visibleLeads/pagedLeads below.
const PAGE_SIZE = 50;

// One lead row's inline "up to 3 image URL" editor + run/delete buttons —
// split out so its own useState for the 3 url inputs doesn't have to live
// in the parent's per-row map.
function LeadRow({
  lead,
  index,
  disableActions,
  selected,
  onToggleSelect,
  onSaved,
  onRun,
  onDelete,
  onSend,
  onUnsend,
}: {
  lead: HunterLead;
  index: number;
  disableActions: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSaved: (l: HunterLead) => void;
  onRun: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSend: (id: string) => Promise<void>;
  onUnsend: (id: string) => Promise<void>;
}) {
  // MAX_IMAGE_URLS mirrors the DB CHECK constraint / MAX_IMAGE_URLS in
  // app/api/admin/hunter/[id]/route.ts — kept as a local literal here since
  // this is a client component and can't import a server-only constant;
  // if that cap ever changes, update both.
  const MAX_IMAGE_URLS = 3;
  const [urls, setUrls] = useState<string[]>(() => {
    const base = [...lead.image_urls];
    while (base.length < 3) base.push("");
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Timer for the "คัดลอกแล้ว ✓" label reset — see copyResultLink below.
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce ref for auto-save — see saveUrls below.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CHANGE (2026-08-31): removed the separate "บันทึกลิงก์" button per user
  // request — typing a URL now auto-saves (debounced 600ms after the last
  // keystroke, so it doesn't fire a PATCH per character) and, once saved,
  // "ตรวจสอบอัตโนมัติ" is immediately clickable with no extra save step.
  // saveUrls takes the URLs to save explicitly (rather than reading `urls`
  // from closure) so the debounce timer always saves the latest value even
  // if the user kept typing after the timer was scheduled.
  //
  // CHANGE (2026-08-31, same day): once the save lands with all
  // MAX_IMAGE_URLS (3) slots filled, kick off the automation run
  // automatically instead of waiting for the button — the user asked for
  // "กรอกครบ 3 ลิงก์แล้วทำงานทันที". Filling only 1-2 and stopping does
  // NOT auto-run (confirmed with the user) — that still needs the manual
  // button, since a partial set might not be "done entering" yet. Runs
  // only out of a state where a run makes sense (not already
  // running/done/failed) so this can't fire twice for the same save or
  // re-trigger on every subsequent unrelated re-render.
  const saveUrls = useCallback(
    async (nextUrls: string[]) => {
      setSaving(true);
      setSaveMsg(null);
      try {
        const cleaned = nextUrls.map((u) => u.trim()).filter(Boolean);
        const res = await fetch(`/api/admin/hunter/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: cleaned }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
        onSaved(data.lead);

        if (cleaned.length >= MAX_IMAGE_URLS && data.lead.status === "ready") {
          // setRunning here (rather than calling the run() helper defined
          // below) so the "ตรวจสอบอัตโนมัติ" button visibly flips to
          // "กำลังตรวจสอบ…" for this auto-triggered run too, not just for
          // manual clicks.
          setRunning(true);
          onRun(lead.id).finally(() => setRunning(false));
        }
      } catch (e: any) {
        setSaveMsg(e?.message || "บันทึกไม่สำเร็จ");
      } finally {
        setSaving(false);
      }
    },
    [lead.id, onSaved, onRun, MAX_IMAGE_URLS]
  );

  const handleUrlChange = (i: number, value: string) => {
    const next = [...urls];
    next[i] = value;
    setUrls(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveUrls(next);
    }, 600);
  };

  // Clear any pending debounce on unmount so it can't fire (and call
  // onSaved) after this row is gone — e.g. the lead was deleted or the
  // list reloaded out from under it.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      await onRun(lead.id);
    } finally {
      setRunning(false);
    }
  };

  // CHANGE (2026-08-31): "ดูผลตรวจสอบ" used to open result_url in a new tab
  // — per user request it now copies the link to the clipboard instead, so
  // it's immediately ready to paste (into a message to the clinic, a
  // spreadsheet, etc.) with no extra "copy from address bar" step. Same
  // clipboard-with-fallback approach as components/ShareLinkButton.tsx.
  const copyResultLink = async () => {
    if (!lead.result_url) return;
    try {
      await navigator.clipboard.writeText(lead.result_url);
    } catch {
      // Clipboard API needs a secure-context permission that isn't always
      // granted — fall back to the classic hidden-textarea + execCommand
      // trick instead of doing nothing.
      const textarea = document.createElement("textarea");
      textarea.value = lead.result_url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Truly nothing left to try — skip the "copied" claim below so
        // the admin isn't told it worked when it didn't.
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const del = async () => {
    if (!window.confirm(`ลบ "${lead.clinic_name}" ออกจากคิว Hunter?`)) return;
    setDeleting(true);
    try {
      await onDelete(lead.id);
    } finally {
      setDeleting(false);
    }
  };

  // "ส่ง" — hand this checked lead's result to Hunter freelancers (makes it
  // appear on their read-only /hunter list). "ยกเลิกส่ง" undoes that without
  // touching the lead or its result. See app/api/admin/hunter/[id]/send/route.ts.
  const send = async () => {
    setSending(true);
    try {
      await onSend(lead.id);
    } finally {
      setSending(false);
    }
  };
  const unsend = async () => {
    setSending(true);
    try {
      await onUnsend(lead.id);
    } finally {
      setSending(false);
    }
  };

  // Run is blocked only while a save is actually in flight (to avoid
  // racing the automation run against an unsaved edit) — not on "dirty"
  // anymore, since every edit now auto-saves within 600ms with no separate
  // save step. lead.image_urls (the server's last-saved value) still gates
  // having at least one URL to run against.
  const canRun = lead.image_urls.length > 0 && !saving && lead.status !== "running" && !disableActions;

  return (
    <tr>
      <td className={tdClass}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          disabled={disableActions}
          aria-label={`เลือก ${lead.clinic_name}`}
        />
      </td>
      <td className={tdClass}>{index + 1}</td>
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            {urls.map((u, i) => (
              <input
                key={i}
                value={u}
                placeholder={`รูป ${i + 1}`}
                // CHANGE (2026-09-01, per user request): narrowed to w-14
                // (half of the previous w-28) to free up horizontal room so
                // the 3 action buttons on the right fit on one line — see
                // the actions <div> below.
                className={`${smallInputClass} w-14`}
                onChange={(e) => handleUrlChange(i, e.target.value)}
              />
            ))}
          </div>
          {/* CHANGE (2026-08-31): the inline "กำลังบันทึก…" / "บันทึกลิงก์แล้ว"
              / "บันทึกลิงก์ครบแล้ว — กำลังตรวจสอบอัตโนมัติ…" status line was
              removed per user request — it looked stuck/leftover once a run
              actually finished (the row's action button already reflects
              save/run state via canRun and the "ดูผลตรวจสอบ"/"ตรวจสอบอัตโนมัติ"
              swap, so this extra text under the inputs was redundant).
              saveMsg is now ONLY surfaced when a save itself actually fails
              (bad URL, network error, etc.) — that's a real problem the
              admin needs to see and has no other visible indicator, unlike
              the routine "saved"/"auto-running" progress text this removed. */}
          {saveMsg && <span className="text-[11px] text-danger">{saveMsg}</span>}
          {/* The "สถานะ" column was removed per an earlier user request — a
              failed run's error message still needs to surface somewhere, so
              it shows directly under this row's own url inputs instead of
              under a status badge. */}
          {lead.status === "failed" && lead.last_error && (
            <div className="text-[11px] text-danger max-w-[280px]">ล้มเหลว: {lead.last_error}</div>
          )}
        </div>
      </td>
      <td className={tdClass}>
        <StatusBadge status={displayStatus(lead)} />
      </td>
      <td className={tdClass}>
        {/* CHANGE (2026-09-01, per user request): no more flex-wrap — all 3
            buttons (view/run, ส่ง/ยกเลิกส่ง, ลบ) now stay on one row. The
            table's own overflow-x-auto wrapper (see the parent return
            below) scrolls horizontally if a row ever needs more space than
            the viewport, rather than the buttons wrapping to a second
            line. */}
        <div className="flex items-center gap-1.5 flex-nowrap">
          {/* CHANGE (2026-08-31): the separate "ผลตรวจสอบ" column was
              removed per user request — once a lead has a result_url, this
              slot now shows a "ดูผลตรวจสอบ" button in place of the
              "ตรวจสอบอัตโนมัติ" button (rather than showing both side by
              side), since re-running a 'done' lead is a no-op anyway (see
              app/api/admin/hunter/[id]/run/route.ts) until its image_urls
              are edited — at which point result_url is cleared and this
              reverts to the run button automatically.
              CHANGE (2026-08-31, same day): this button used to be a plain
              <a target="_blank"> that opened result_url in a new tab — per
              user request, clicking it now copies the link to the
              clipboard instead (ready to paste immediately), rather than
              navigating away. */}
          {lead.result_url ? (
            <button
              type="button"
              onClick={copyResultLink}
              className="rounded-md bg-inverse text-onInverse px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              {copied ? "คัดลอกแล้ว ✓" : "ดูผลตรวจสอบ"}
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!canRun || running}
              className="rounded-md bg-inverse text-onInverse px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {running || lead.status === "running" ? "กำลังตรวจสอบ…" : "ตรวจสอบอัตโนมัติ"}
            </button>
          )}
          {lead.status === "done" &&
            (lead.hunter_sent_at ? (
              <button
                type="button"
                onClick={unsend}
                disabled={sending || disableActions}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-secondary disabled:opacity-40 whitespace-nowrap"
              >
                {sending ? "กำลังยกเลิก…" : "ยกเลิกส่ง"}
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={sending || disableActions}
                className="rounded-md border border-accent text-accent px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
              >
                {sending ? "กำลังส่ง…" : "ส่ง"}
              </button>
            ))}
          <button
            onClick={del}
            disabled={deleting || lead.status === "running" || disableActions}
            className="rounded-md border border-danger text-danger px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
          >
            {deleting ? "กำลังลบ…" : "ลบ"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function HunterImport() {
  const [leads, setLeads] = useState<HunterLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [colMapMsg, setColMapMsg] = useState("");
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter");
      const data = await res.json();
      if (res.ok) setLeads(data.leads || []);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(`ไฟล์: ${file.name}`);
      setUploadMsg(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (!rows.length) throw new Error("ไฟล์ว่างเปล่า");

          const header = rows[0];
          const clinicIdx = (() => {
            const i = findKeyIndex(header, CLINIC_KEYS);
            return i >= 0 ? i : 0;
          })();
          const provinceIdx = findKeyIndex(header, PROVINCE_KEYS);
          // CHANGE (2026-08-31): ลิงก์เพจคลินิกตรึงไว้ที่คอลัมน์ D (index 3) ของ
          // ไฟล์ Excel ตรงๆ ตามคำขอผู้ใช้ แทนที่จะเดาจากชื่อหัวตาราง (LINK_KEYS
          // เดิม) — ไฟล์รายชื่อคลินิกจริงที่ Hunter ใช้มีคอลัมน์ลิงก์อยู่ตำแหน่ง D
          // เสมอ ไม่ว่าหัวตารางจะเขียนว่าอะไร การเดาจากชื่อหัวตารางเคยพลาดเวลา
          // หัวตารางเขียนไม่ตรงกับ LINK_KEYS ที่รู้จัก
          const linkIdx = 3;

          setColMapMsg(
            `ตรวจพบคอลัมน์: ชื่อคลินิก = "${header[clinicIdx] || "คอลัมน์ที่ 1"}"` +
              (provinceIdx >= 0 ? `, จังหวัด = "${header[provinceIdx]}"` : ", จังหวัด = ไม่พบ (เว้นว่างได้)") +
              `, ลิงก์ = คอลัมน์ D ("${header[linkIdx] || "ไม่มีหัวตาราง"}")`
          );

          const result: ParsedRow[] = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every((v) => String(v).trim() === "")) continue;
            const clinic = String(row[clinicIdx] || "").trim();
            const province = provinceIdx >= 0 ? String(row[provinceIdx] || "").trim() : "";
            const link = linkIdx >= 0 ? String(row[linkIdx] || "").trim() : "";
            if (!clinic && !link) continue;
            result.push({ clinic: clinic || "(ไม่ระบุชื่อ - ต้องเช็ค)", province, link });
          }

          if (!result.length) {
            setUploadMsg({ text: "อ่านไฟล์ไม่พบข้อมูลคลินิก กรุณาตรวจสอบหัวตาราง", ok: false });
            setParsedRows([]);
            return;
          }

          // ADDED (2026-09-01, dedupe preview): flag rows whose clinic name
          // (normalizeClinicName — trim + lowercase, name only) already
          // appears earlier in THIS file (dupInFile), or already exists in
          // the system from a previous import (dupInSystem, checked against
          // whatever `leads` finished loading with — a preview hint only,
          // the server re-checks authoritatively at import time regardless
          // of whether `leads` has loaded yet). Neither flag removes the
          // row from the preview or blocks import — see importRows below
          // for what actually gets skipped.
          const existingSystemNames = new Set(leads.map((l) => normalizeClinicName(l.clinic_name)));
          const seenInFile = new Set<string>();
          for (const r of result) {
            const key = normalizeClinicName(r.clinic);
            if (seenInFile.has(key)) r.dupInFile = true;
            else seenInFile.add(key);
            if (existingSystemNames.has(key)) r.dupInSystem = true;
          }

          const dupCount = result.filter((r) => r.dupInFile || r.dupInSystem).length;
          setParsedRows(result);
          setUploadMsg({
            text:
              `อ่านไฟล์สำเร็จ พบ ${result.length} รายการ` +
              (dupCount > 0 ? ` (${dupCount} รายการซ้ำ — ระบบจะข้ามให้อัตโนมัติตอนนำเข้า)` : "") +
              " — ตรวจสอบด้านล่างก่อนนำเข้า",
            ok: true,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setUploadMsg({ text: `อ่านไฟล์ไม่สำเร็จ: ${message}`, ok: false });
          setParsedRows([]);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [leads]
  );

  const cancelPreview = () => {
    setParsedRows([]);
    setFileName("");
    setColMapMsg("");
    setUploadMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const importRows = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/admin/hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "นำเข้าไม่สำเร็จ");
      // CHANGE (2026-09-01, dedupe): the server now also reports
      // skippedDuplicate (see app/api/admin/hunter/route.ts) — surfaced
      // here so the admin sees both how many actually landed in the queue
      // and how many were skipped as already-existing clinic names.
      const skippedMsg = data.skippedDuplicate > 0 ? ` (ข้ามชื่อซ้ำ ${data.skippedDuplicate} รายการ)` : "";
      setImportMsg({ text: `นำเข้า ${data.inserted} รายการเข้าคิวแล้ว${skippedMsg}`, ok: true });
      cancelPreview();
      await loadLeads();
    } catch (e: any) {
      setImportMsg({ text: e?.message || "นำเข้าไม่สำเร็จ", ok: false });
    } finally {
      setImporting(false);
    }
  };

  const runAutomation = async (id: string) => {
    const res = await fetch(`/api/admin/hunter/${id}/run`, { method: "POST" });
    const data = await res.json();
    if (data?.lead) {
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    }
    if (!res.ok) {
      // Error is already reflected in lead.last_error/status from the
      // response above — nothing else to show here.
    }
  };

  const deleteLead = async (id: string) => {
    const res = await fetch(`/api/admin/hunter/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      const data = await res.json().catch(() => null);
      window.alert(data?.error || "ลบไม่สำเร็จ");
    }
  };

  // "ส่ง" / "ยกเลิกส่ง" — see app/api/admin/hunter/[id]/send/route.ts and the
  // "ส่ง" workflow note at the top of this file.
  const sendLead = async (id: string) => {
    const res = await fetch(`/api/admin/hunter/${id}/send`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.lead) {
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    } else {
      window.alert(data?.error || "ส่งไม่สำเร็จ");
    }
  };

  const unsendLead = async (id: string) => {
    const res = await fetch(`/api/admin/hunter/${id}/send`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.lead) {
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    } else {
      window.alert(data?.error || "ยกเลิกการส่งไม่สำเร็จ");
    }
  };

  // "ตรวจสอบอัตโนมัติทั้งหมด" — runs every lead currently sitting at
  // 'ready' (has image_urls, not yet run) ONE AT A TIME, sequentially,
  // reusing the exact same /run endpoint each row's own button calls.
  // Deliberately sequential rather than Promise.all: each call is a real
  // AI review (or up to 3, per lead) hitting the shared automation
  // business's credit balance, so firing them all at once would just
  // contend with itself for no benefit and make a failed run harder to
  // attribute to one lead. runningAll disables every row's own run/delete
  // controls for the duration so two runs can't target the same lead at
  // once.
  const [runningAll, setRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<{ done: number; total: number } | null>(null);

  const runAllReady = async () => {
    const targets = leads.filter((l) => l.status === "ready").map((l) => l.id);
    if (targets.length === 0) return;
    setRunningAll(true);
    setRunAllProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        await runAutomation(targets[i]);
        setRunAllProgress({ done: i + 1, total: targets.length });
      }
    } finally {
      setRunningAll(false);
      setRunAllProgress(null);
    }
  };

  const readyCount = leads.filter((l) => l.status === "ready").length;

  // Counts for the 3-state สถานะ summary next to "คิว Hunter" — see
  // displayStatus() at the top of this file. Always computed off the FULL
  // leads array (not the filtered view below) so the tab counts don't
  // shrink to 0 once you've clicked into a filter.
  const awaitingReviewCount = leads.filter((l) => displayStatus(l) === "awaiting_review").length;
  const queuedCount = leads.filter((l) => displayStatus(l) === "queued").length;
  const sentCount = leads.filter((l) => displayStatus(l) === "sent").length;

  // "ส่งทั้งหมด" (2026-09-01) — mirrors runAllReady above but for the send
  // step: sends every currently-"รอคิว" (queued = checked, not yet sent)
  // lead in one go. Unlike runAllReady this fires all requests in
  // parallel — each send is just a single lightweight UPDATE (no AI /
  // credit cost like a review run), so there's no shared resource to
  // contend over by going one at a time.
  const [sendingAll, setSendingAll] = useState(false);

  const sendAllQueued = async () => {
    const targets = leads.filter((l) => displayStatus(l) === "queued").map((l) => l.id);
    if (targets.length === 0) return;
    setSendingAll(true);
    try {
      const res = await fetch("/api/admin/hunter/send-all", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert(data?.error || "ส่งไม่สำเร็จ");
        return;
      }
      await loadLeads();
      const failedCount = (data?.failed || []).length;
      if (failedCount > 0) {
        window.alert("ส่งไม่สำเร็จ " + failedCount + " รายการ: " + (data.failed[0]?.error || ""));
      }
    } finally {
      setSendingAll(false);
    }
  };

  // Clickable status filter tabs (2026-09-01, replacing the old plain-text
  // summary line) — click a tab to show only leads in that สถานะ; click the
  // active tab again to clear the filter. null = show everything.
  const [statusFilter, setStatusFilter] = useState<DisplayStatus | null>(null);
  const visibleLeads = statusFilter ? leads.filter((l) => displayStatus(l) === statusFilter) : leads;

  // --- Pagination (2026-09-01) ---------------------------------------
  // Pages through visibleLeads (i.e. AFTER the status filter above), so
  // switching tabs and paging compose naturally instead of one resetting
  // the other unexpectedly.
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(visibleLeads.length / PAGE_SIZE));
  // Clamp rather than reset-on-every-render: deleting rows can shrink
  // totalPages out from under whatever page the admin was on (e.g. bulk-
  // deleting most of the last page), so this pulls them back to the new
  // last page instead of showing an empty page silently.
  const currentPage = Math.min(page, totalPages);
  const pagedLeads = visibleLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Switching status-filter tabs always goes back to page 1 — staying on
  // e.g. page 4 after switching to a tab with only 1 page would just show
  // an empty table until the clamp above kicks in on the next render.
  const changeStatusFilter = (next: DisplayStatus | null) => {
    setStatusFilter(next);
    setPage(1);
  };

  // --- Checkbox multi-select + bulk delete (2026-09-01) ---------------
  // selectedIds persists across page/filter changes (not scoped to the
  // current page) so an admin can select rows across multiple pages before
  // deleting them all in one "ลบที่เลือก" click.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteMsg, setBulkDeleteMsg] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = pagedLeads.length > 0 && pagedLeads.every((l) => selectedIds.has(l.id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pagedLeads.forEach((l) => next.delete(l.id));
      } else {
        pagedLeads.forEach((l) => next.add(l.id));
      }
      return next;
    });
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`ลบ ${ids.length} รายการที่เลือกออกจากคิว Hunter? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    setBulkDeleting(true);
    setBulkDeleteMsg(null);
    try {
      const res = await fetch("/api/admin/hunter/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      const deletedSet = new Set<string>(data.deletedIds || []);
      setLeads((prev) => prev.filter((l) => !deletedSet.has(l.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedSet.forEach((id) => next.delete(id));
        return next;
      });
      const failedCount = (data.failed || []).length;
      setBulkDeleteMsg(
        failedCount > 0
          ? `ลบสำเร็จ ${deletedSet.size} รายการ, ล้มเหลว ${failedCount} รายการ (อาจถูกมอบหมายให้เซลล์แล้ว)`
          : `ลบสำเร็จ ${deletedSet.size} รายการ`
      );
    } catch (e: any) {
      setBulkDeleteMsg(e?.message || "ลบไม่สำเร็จ");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div>
      <div className="rounded-lg border border-warning bg-warningSoft px-4 py-3 text-xs text-warning leading-relaxed mb-6">
        ขั้นตอน: อัปโหลดไฟล์ Excel รายชื่อคลินิก → ระบบนำเข้าคิว &quot;รอ Hunter ดึงรูป&quot; → Hunter กรอกลิงก์รูปที่ดึงมาได้
        (สูงสุด 3 รูป) — กรอกครบ 3 ลิงก์แล้วระบบจะเริ่มตรวจสอบอัตโนมัติทันที ไม่ต้องกดปุ่ม (กรอกไม่ครบ 3 ให้กดปุ่ม
        &quot;ตรวจสอบอัตโนมัติ&quot; เอง) → ระบบส่งแต่ละรูปเข้า AI ตรวจสอบผ่าน adcheck.pro จริงและได้ลิงก์ผลตรวจสอบ
        กลับมาอัตโนมัติ (ไม่หักเครดิตจากคลินิกจริง — ใช้บัญชีภายในของ AD Plus)
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-inverse text-onInverse px-4 py-2 text-sm font-medium whitespace-nowrap"
          >
            📄 อัปโหลดรายชื่อคลินิก (.xlsx/.xls/.csv)
          </button>
          {fileName && <span className="text-xs font-medium text-primary">{fileName}</span>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFile(e.target.files[0]);
          }}
        />

        {colMapMsg && <div className="text-xs text-tertiary mt-2">{colMapMsg}</div>}
        {uploadMsg && (
          <div className={`text-xs mt-1 ${uploadMsg.ok ? "text-accent" : "text-danger"}`}>{uploadMsg.text}</div>
        )}

        {parsedRows.length > 0 && (
          <div className="mt-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClass}>#</th>
                    <th className={thClass}>ชื่อคลินิก</th>
                    <th className={thClass}>จังหวัด</th>
                    <th className={thClass}>ลิงก์</th>
                    <th className={thClass}>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i} className={r.dupInFile || r.dupInSystem ? "opacity-60" : undefined}>
                      <td className={tdClass}>{i + 1}</td>
                      <td className={tdClass}>{r.clinic}</td>
                      <td className={tdClass}>{r.province || "-"}</td>
                      <td className={`${tdClass} break-all`}>{r.link || "-"}</td>
                      <td className={tdClass}>
                        {r.dupInSystem ? (
                          <span className="rounded-pill bg-dangerSoft text-danger px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                            มีอยู่แล้วในระบบ
                          </span>
                        ) : r.dupInFile ? (
                          <span className="rounded-pill bg-warningSoft text-warning px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                            ซ้ำในไฟล์นี้
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                onClick={importRows}
                disabled={importing}
                className="rounded-md bg-inverse text-onInverse px-5 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {importing ? "กำลังนำเข้า…" : "นำเข้าทั้งหมดเข้าคิว"}
              </button>
              <button
                onClick={cancelPreview}
                disabled={importing}
                className="rounded-md border border-border px-4 py-2 text-sm text-secondary"
              >
                ยกเลิก
              </button>
              {importMsg && (
                <span className={`text-xs ${importMsg.ok ? "text-accent" : "text-danger"}`}>{importMsg.text}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-base font-medium text-primary">คิว Hunter</h2>
          <div className="flex items-center gap-2">
            {runAllProgress && (
              <span className="text-xs text-tertiary">
                กำลังตรวจสอบ… ({runAllProgress.done}/{runAllProgress.total})
              </span>
            )}
            <button
              onClick={runAllReady}
              disabled={runningAll || readyCount === 0}
              className="rounded-md bg-inverse text-onInverse px-4 py-2 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {runningAll ? "กำลังตรวจสอบทั้งหมด…" : `ตรวจสอบอัตโนมัติทั้งหมด (${readyCount} รายการพร้อมตรวจ)`}
            </button>
            <button
              onClick={sendAllQueued}
              disabled={sendingAll || queuedCount === 0}
              className="rounded-md bg-accent text-onInverse px-4 py-2 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {sendingAll ? "กำลังส่งทั้งหมด…" : `ส่งทั้งหมด (${queuedCount} รายการรอคิว)`}
            </button>
          </div>
        </div>
        {/* Clickable status filter tabs (2026-09-01) — replaces the old
            plain-text "รอตรวจสอบ N · รอคิว N · ส่งสำเร็จ N" summary.
            Clicking a tab filters the table below to only that สถานะ;
            clicking the already-active tab clears the filter. Counts always
            reflect the full unfiltered queue, not the filtered view. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(
            [
              ["awaiting_review", awaitingReviewCount],
              ["queued", queuedCount],
              ["sent", sentCount],
            ] as [DisplayStatus, number][]
          ).map(([status, count]) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => changeStatusFilter(active ? null : status)}
                className={`rounded-pill px-3 py-1 text-xs font-medium whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-inverse text-onInverse border-inverse"
                    : "bg-surface text-secondary border-border hover:border-accent/50"
                }`}
              >
                {DISPLAY_STATUS_LABEL[status]} {count}
              </button>
            );
          })}
          {statusFilter && (
            <button
              type="button"
              onClick={() => changeStatusFilter(null)}
              className="text-xs text-tertiary underline whitespace-nowrap"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Bulk-delete action bar (2026-09-01) — only shown once at least one
            row is checked, so it doesn't take up space during normal use. */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-3 flex-wrap rounded-lg border border-danger/40 bg-dangerSoft px-3 py-2">
            <span className="text-xs font-medium text-danger">เลือกแล้ว {selectedIds.size} รายการ</span>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="rounded-md bg-danger text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {bulkDeleting ? "กำลังลบ…" : `ลบที่เลือก (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="text-xs text-tertiary underline whitespace-nowrap"
            >
              ยกเลิกการเลือก
            </button>
            {bulkDeleteMsg && <span className="text-xs text-secondary">{bulkDeleteMsg}</span>}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thClass}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    disabled={pagedLeads.length === 0 || runningAll || sendingAll}
                    aria-label="เลือกทั้งหมดในหน้านี้"
                  />
                </th>
                <th className={thClass}>ลำดับ</th>
                <th className={thClass}>คลินิก</th>
                <th className={thClass}>ลิงก์รูป</th>
                <th className={thClass}>สถานะ</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {loadingLeads ? (
                <tr>
                  <td colSpan={6} className="text-center text-tertiary py-6">
                    กำลังโหลด…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-tertiary py-6">
                    ยังไม่มีรายการ
                  </td>
                </tr>
              ) : visibleLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-tertiary py-6">
                    ไม่มีรายการในสถานะนี้
                  </td>
                </tr>
              ) : (
                pagedLeads.map((lead, i) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    index={(currentPage - 1) * PAGE_SIZE + i}
                    disableActions={runningAll || sendingAll}
                    selected={selectedIds.has(lead.id)}
                    onToggleSelect={toggleSelect}
                    onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
                    onRun={runAutomation}
                    onDelete={deleteLead}
                    onSend={sendLead}
                    onUnsend={unsendLead}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls (2026-09-01, per user request: "ถ้าเพิ่ม 1000
            รายการ ให้มีตัวเลื่อนหน้า ให้ดูง่ายขึ้น") — only shown once there's
            more than one page, so it doesn't clutter the common case of a
            small queue. */}
        {visibleLeads.length > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary disabled:opacity-40"
            >
              ‹ ก่อนหน้า
            </button>
            <span className="text-xs text-tertiary whitespace-nowrap">
              หน้า {currentPage} จาก {totalPages} ({visibleLeads.length} รายการ)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary disabled:opacity-40"
            >
              ถัดไป ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
