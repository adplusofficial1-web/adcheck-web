"use client";

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// Admin > Marketing > Hunter — Hunter อัปโหลดรายชื่อคลินิกเป็นไฟล์ Excel
// (.xlsx/.xls/.csv) ระบบจะจับคอลัมน์ ชื่อคลินิก / จังหวัด / ลิงก์ อัตโนมัติ
// (รองรับหัวตารางไทย/อังกฤษ) แล้วนำเข้าคิว "รอ Hunter ดึงรูป" เพื่อให้ Hunter
// ตามไปดึงรูป 3 รูปต่อคลินิก และส่งต่อให้ QC ตรวจสอบผ่าน adcheck.pro จริงใน
// ขั้นตอนถัดไป.
//
// สร้างเป็นแท็บย่อยของ /admin/marketing (ไม่ใช่ /admin/hunter ตามที่ไฟล์ต้นฉบับ
// แนะนำ) ตามคำขอผู้ใช้ — /admin/marketing มีหน้า Marketing Tracker (ติดตาม
// สมาคมวิชาชีพ, lib/marketingAssociations.ts) อยู่แล้วซึ่งเป็นคนละเรื่องกัน
// เก็บทั้งสองไว้เป็นแท็บแยก (ดู app/admin/marketing/hunter/page.tsx และ
// components/admin/MarketingSubNav.tsx) แทนที่จะทับของเดิม เพื่อไม่ให้ฟีเจอร์
// เดิมหายไป — เหตุผลเดียวกับที่ "รายงานปัญหา" แยกแท็บจาก "Marketing" ใน
// AdminNav.tsx.
//
// เก็บคิวไว้ที่ localStorage ของเบราว์เซอร์ (key: "hunter_queue") ชั่วคราว
// ตามที่ไฟล์ต้นฉบับตั้งใจไว้ — เมื่อทีมพัฒนาต้องการต่อเข้าฐานข้อมูลจริง
// (ตาราง Postgres ใหม่ + API route) ค่อยเปลี่ยนตรงนี้เป็น fetch แทน
// localStorage.getItem/setItem โดยไม่ต้องแตะ UI ส่วนอื่น.

type QueueRow = {
  date: string;
  clinic: string;
  province: string;
  source: string;
  hunter: string;
  images: string[];
  imgCount: number;
  note: string;
  status: string;
  send: string;
};

type ParsedRow = {
  clinic: string;
  province: string;
  link: string;
};

const CLINIC_KEYS = ["ชื่อคลินิก", "คลินิก", "clinic", "clinic name", "name", "ชื่อ"];
const PROVINCE_KEYS = ["จังหวัด", "province"];
const LINK_KEYS = ["ลิงก์", "ลิงค์", "link", "url", "เพจ", "facebook", "page", "แหล่งที่มา"];

// FIX (same bug class as components/admin/MarketingTracker.tsx:todayStr —
// see its comment): the original file computed this with
// `new Date().toISOString().slice(0, 10)`, which is always UTC — wrong
// "today" for a Thailand-based Hunter/admin team, and liable to land on
// the previous calendar day for anyone importing between 00:00-06:59
// Thailand time. Shifted by Thailand's fixed UTC+7 (no DST) first so
// "today" always means Thailand's today regardless of the host's own
// timezone.
function todayStr(): string {
  const bangkokMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().slice(0, 10);
}

function findKeyIndex(header: string[], keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const norm = String(header[i] || "").trim().toLowerCase();
    if (keys.some((k) => norm === k || norm.includes(k))) return i;
  }
  return -1;
}

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

export function HunterImport() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [colMapMsg, setColMapMsg] = useState("");
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Read the localStorage queue lazily on first client render rather than
  // in useEffect — avoids an extra render flash and matches the pattern
  // this component already needs anyway since localStorage is
  // client-only. `loaded` gates it so this only runs once.
  if (typeof window !== "undefined" && !loaded) {
    setLoaded(true);
    const raw = localStorage.getItem("hunter_queue");
    if (raw) {
      try {
        setQueue(JSON.parse(raw));
      } catch {
        // Corrupt/old data — start fresh rather than crashing the page.
      }
    }
  }

  const saveQueue = useCallback((rows: QueueRow[]) => {
    setQueue(rows);
    if (typeof window !== "undefined") {
      localStorage.setItem("hunter_queue", JSON.stringify(rows));
    }
  }, []);

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

  const importRows = () => {
    const additions: QueueRow[] = parsedRows.map((r) => ({
      date: todayStr(),
      clinic: r.clinic,
      province: r.province,
      source: r.link,
      hunter: "นำเข้าจากไฟล์ Excel",
      images: [],
      imgCount: 0,
      note: "นำเข้าจากรายชื่อ Excel — Hunter ยังต้องดึงรูป 3 รูปและกรอกลิงก์เพิ่มก่อนส่งตรวจสอบจริง",
      status: "รอ Hunter ดึงรูป",
      send: "รอแอดมินดึงไปส่ง",
    }));
    const next = [...queue, ...additions];
    saveQueue(next);
    setImportMsg({ text: `นำเข้า ${additions.length} รายการเข้าคิวแล้ว`, ok: true });
    cancelPreview();
  };

  return (
    <div>
      <div className="rounded-lg border border-warning bg-warningSoft px-4 py-3 text-xs text-warning leading-relaxed mb-6">
        ขั้นตอน: อัปโหลดไฟล์ Excel รายชื่อคลินิก → ระบบนำเข้าคิว &quot;รอ Hunter ดึงรูป&quot; → Hunter ตามไปดึงรูป 3
        รูปต่อคลินิกและกรอกลิงก์ → ทีม QC นำรูปไปตรวจสอบผ่าน adcheck.pro จริง → ใส่ลิงก์ผลตรวจสอบ
        (adcheck.pro/results/{"{id}"}) กลับเข้าคิว
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
                className="rounded-md bg-inverse text-onInverse px-5 py-2.5 text-sm font-medium"
              >
                นำเข้าทั้งหมดเข้าคิว
              </button>
              <button
                onClick={cancelPreview}
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
        <h2 className="text-base font-medium text-primary mb-3">คิวที่ส่งแล้ว (รอ QC ตรวจสอบผ่าน adcheck.pro)</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thClass}>วันที่</th>
                <th className={thClass}>คลินิก</th>
                <th className={thClass}>จังหวัด</th>
                <th className={thClass}>แหล่งที่มา/Hunter</th>
                <th className={thClass}>รูป</th>
                <th className={thClass}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-tertiary py-6">
                    ยังไม่มีรายการ
                  </td>
                </tr>
              ) : (
                [...queue].reverse().map((r, i) => (
                  <tr key={i}>
                    <td className={tdClass}>{r.date}</td>
                    <td className={tdClass}>{r.clinic}</td>
                    <td className={tdClass}>{r.province || "-"}</td>
                    <td className={tdClass}>{r.source || r.hunter || "-"}</td>
                    <td className={tdClass}>{r.imgCount || 0}/3</td>
                    <td className={tdClass}>
                      <span className="inline-block rounded-pill bg-page text-tertiary text-xs font-medium px-3 py-1">
                        {r.status || "รอ QC ตรวจสอบ"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
