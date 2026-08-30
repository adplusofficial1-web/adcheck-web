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

type ParsedRow = {
  clinic: string;
  province: string;
  link: string;
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

// NOTE: the old STATUS_META badge map (สถานะ column) was removed along
// with the "สถานะ" column per user request (2026-08-31) — lead.status is
// still used internally (gating run/delete buttons, the "failed" error
// message, the run-all-ready count) even though it's no longer shown as
// its own badge.

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";
const smallInputClass =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";

// One lead row's inline "up to 3 image URL" editor + run/delete buttons —
// split out so its own useState for the 3 url inputs doesn't have to live
// in the parent's per-row map.
function LeadRow({
  lead,
  index,
  disableActions,
  onSaved,
  onRun,
  onDelete,
}: {
  lead: HunterLead;
  index: number;
  disableActions: boolean;
  onSaved: (l: HunterLead) => void;
  onRun: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

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

  const del = async () => {
    if (!window.confirm(`ลบ "${lead.clinic_name}" ออกจากคิว Hunter?`)) return;
    setDeleting(true);
    try {
      await onDelete(lead.id);
    } finally {
      setDeleting(false);
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
                className={`${smallInputClass} w-28`}
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
        <div className="flex items-center gap-2">
          {/* CHANGE (2026-08-31): the separate "ผลตรวจสอบ" column was
              removed per user request — once a lead has a result_url, this
              slot now shows a "ดูผลตรวจสอบ" link button in place of the
              "ตรวจสอบอัตโนมัติ" button (rather than showing both side by
              side), since re-running a 'done' lead is a no-op anyway (see
              app/api/admin/hunter/[id]/run/route.ts) until its image_urls
              are edited — at which point result_url is cleared and this
              reverts to the run button automatically. */}
          {lead.result_url ? (
            <a
              href={lead.result_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              ดูผลตรวจสอบ
            </a>
          ) : (
            <button
              onClick={run}
              disabled={!canRun || running}
              className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {running || lead.status === "running" ? "กำลังตรวจสอบ…" : "ตรวจสอบอัตโนมัติ"}
            </button>
          )}
          <button
            onClick={del}
            disabled={deleting || lead.status === "running" || disableActions}
            className="rounded-md border border-danger text-danger px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
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
  const [dragOver, setDragOver] = useState(false);
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

  const handleFile = useCallback((file: File) => {
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

        setParsedRows(result);
        setUploadMsg({ text: `อ่านไฟล์สำเร็จ พบ ${result.length} รายการ — ตรวจสอบด้านล่างก่อนนำเข้า`, ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setUploadMsg({ text: `อ่านไฟล์ไม่สำเร็จ: ${message}`, ok: false });
        setParsedRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

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
      setImportMsg({ text: `นำเข้า ${data.inserted} รายการเข้าคิวแล้ว`, ok: true });
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
    } else {
      const data = await res.json().catch(() => null);
      window.alert(data?.error || "ลบไม่สำเร็จ");
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

  return (
    <div>
      <div className="rounded-lg border border-warning bg-warningSoft px-4 py-3 text-xs text-warning leading-relaxed mb-6">
        ขั้นตอน: อัปโหลดไฟล์ Excel รายชื่อคลินิก → ระบบนำเข้าคิว &quot;รอ Hunter ดึงรูป&quot; → Hunter กรอกลิงก์รูปที่ดึงมาได้
        (สูงสุด 3 รูป) — กรอกครบ 3 ลิงก์แล้วระบบจะเริ่มตรวจสอบอัตโนมัติทันที ไม่ต้องกดปุ่ม (กรอกไม่ครบ 3 ให้กดปุ่ม
        &quot;ตรวจสอบอัตโนมัติ&quot; เอง) → ระบบส่งแต่ละรูปเข้า AI ตรวจสอบผ่าน adcheck.pro จริงและได้ลิงก์ผลตรวจสอบ
        กลับมาอัตโนมัติ (ไม่หักเครดิตจากคลินิกจริง — ใช้บัญชีภายในของ AD Plus)
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <h2 className="text-sm font-medium text-primary mb-1">อัปโหลดรายชื่อคลินิกจากไฟล์ Excel</h2>
        <p className="text-xs text-secondary mb-4">
          รองรับ .xlsx / .xls / .csv — ต้องมีคอลัมน์ชื่อคลินิกและลิงก์เพจอย่างน้อย (จังหวัดใส่หรือไม่ใส่ก็ได้)
        </p>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
          }}
          className={`rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-accent bg-accentSoft/40" : "border-border"
          }`}
        >
          <div className="text-2xl mb-1">📄</div>
          <div className="text-sm text-primary">ลากไฟล์มาวาง หรือ คลิกเพื่อเลือกไฟล์</div>
          <div className="text-xs text-tertiary mt-1">.xlsx, .xls, .csv</div>
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

        {fileName && <div className="text-xs font-medium text-primary mt-3">{fileName}</div>}
        {colMapMsg && <div className="text-xs text-tertiary mt-1.5">{colMapMsg}</div>}
        {uploadMsg && (
          <div className={`text-xs mt-2 ${uploadMsg.ok ? "text-accent" : "text-danger"}`}>{uploadMsg.text}</div>
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
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i}>
                      <td className={tdClass}>{i + 1}</td>
                      <td className={tdClass}>{r.clinic}</td>
                      <td className={tdClass}>{r.province || "-"}</td>
                      <td className={`${tdClass} break-all`}>{r.link || "-"}</td>
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
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
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
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thClass}>ลำดับ</th>
                <th className={thClass}>คลินิก</th>
                <th className={thClass}>ลิงก์รูป</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {loadingLeads ? (
                <tr>
                  <td colSpan={4} className="text-center text-tertiary py-6">
                    กำลังโหลด…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-tertiary py-6">
                    ยังไม่มีรายการ
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    index={i}
                    disableActions={runningAll}
                    onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
                    onRun={runAutomation}
                    onDelete={deleteLead}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
