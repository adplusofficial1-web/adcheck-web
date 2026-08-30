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
const LINK_KEYS = ["ลิงก์", "ลิงค์", "link", "url", "เพจ", "facebook", "page", "แหล่งที่มา"];

function findKeyIndex(header: string[], keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const norm = String(header[i] || "").trim().toLowerCase();
    if (keys.some((k) => norm === k || norm.includes(k))) return i;
  }
  return -1;
}

const STATUS_META: Record<HunterLead["status"], { label: string; className: string }> = {
  awaiting_images: { label: "รอ Hunter ดึงรูป", className: "bg-page text-tertiary" },
  ready: { label: "พร้อมตรวจสอบ", className: "bg-warningSoft text-warning" },
  running: { label: "กำลังตรวจสอบ…", className: "bg-warningSoft text-warning" },
  done: { label: "ตรวจสอบเสร็จแล้ว", className: "bg-accentSoft text-accent" },
  failed: { label: "ล้มเหลว", className: "bg-dangerSoft text-danger" },
};

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";
const smallInputClass =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30";

// One lead row's inline "up to 3 image URL" editor + run button — split
// out so its own useState for the 3 url inputs doesn't have to live in
// the parent's per-row map.
function LeadRow({ lead, onSaved, onRun }: { lead: HunterLead; onSaved: (l: HunterLead) => void; onRun: (id: string) => Promise<void> }) {
  const [urls, setUrls] = useState<string[]>(() => {
    const base = [...lead.image_urls];
    while (base.length < 3) base.push("");
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const dirty = urls.some((u, i) => u.trim() !== (lead.image_urls[i] || ""));

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const cleaned = urls.map((u) => u.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/hunter/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      onSaved(data.lead);
      setSaveMsg("บันทึกแล้ว");
    } catch (e: any) {
      setSaveMsg(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    setRunning(true);
    try {
      await onRun(lead.id);
    } finally {
      setRunning(false);
    }
  };

  const status = STATUS_META[lead.status] || STATUS_META.awaiting_images;
  const canRun = lead.image_urls.length > 0 && !dirty && lead.status !== "running";

  return (
    <tr>
      <td className={tdClass}>{new Date(lead.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</td>
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
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          {urls.map((u, i) => (
            <input
              key={i}
              value={u}
              placeholder={`ลิงก์รูปที่ ${i + 1}`}
              className={smallInputClass}
              onChange={(e) => {
                const next = [...urls];
                next[i] = e.target.value;
                setUrls(next);
              }}
            />
          ))}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-md border border-border px-3 py-1 text-xs text-secondary disabled:opacity-40"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกลิงก์"}
            </button>
            {saveMsg && <span className="text-xs text-tertiary">{saveMsg}</span>}
          </div>
        </div>
      </td>
      <td className={tdClass}>
        <span className={`inline-block rounded-pill text-xs font-medium px-3 py-1 ${status.className}`}>{status.label}</span>
        {lead.status === "failed" && lead.last_error && (
          <div className="text-xs text-danger mt-1 max-w-[220px]">{lead.last_error}</div>
        )}
      </td>
      <td className={tdClass}>
        {lead.result_url ? (
          <a href={lead.result_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline break-all">
            ดูผลตรวจสอบ
          </a>
        ) : (
          <span className="text-xs text-tertiary">-</span>
        )}
      </td>
      <td className={tdClass}>
        <button
          onClick={run}
          disabled={!canRun || running}
          title={dirty ? "บันทึกลิงก์ก่อนตรวจสอบ" : undefined}
          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {running || lead.status === "running" ? "กำลังตรวจสอบ…" : "ตรวจสอบอัตโนมัติ"}
        </button>
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
        const linkIdx = findKeyIndex(header, LINK_KEYS);

        setColMapMsg(
          `ตรวจพบคอลัมน์: ชื่อคลินิก = "${header[clinicIdx] || "คอลัมน์ที่ 1"}"` +
            (provinceIdx >= 0 ? `, จังหวัด = "${header[provinceIdx]}"` : ", จังหวัด = ไม่พบ (เว้นว่างได้)") +
            (linkIdx >= 0 ? `, ลิงก์ = "${header[linkIdx]}"` : ", ลิงก์ = ไม่พบ")
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

  return (
    <div>
      <div className="rounded-lg border border-warning bg-warningSoft px-4 py-3 text-xs text-warning leading-relaxed mb-6">
        ขั้นตอน: อัปโหลดไฟล์ Excel รายชื่อคลินิก → ระบบนำเข้าคิว &quot;รอ Hunter ดึงรูป&quot; → Hunter กรอกลิงก์รูปที่ดึงมาได้
        (สูงสุด 3 รูป) → กดปุ่ม &quot;ตรวจสอบอัตโนมัติ&quot; → ระบบส่งแต่ละรูปเข้า AI ตรวจสอบผ่าน adcheck.pro จริงและได้ลิงก์ผลตรวจสอบ
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
        <h2 className="text-base font-medium text-primary mb-3">คิว Hunter</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thClass}>วันที่</th>
                <th className={thClass}>คลินิก</th>
                <th className={thClass}>ลิงก์รูป</th>
                <th className={thClass}>สถานะ</th>
                <th className={thClass}>ผลตรวจสอบ</th>
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
              ) : (
                leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
                    onRun={runAutomation}
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
