"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — "กระจาย Lead" tab (formerly the "เซลล์ &
// การกระจาย Lead" section). Lets a platform admin add/deactivate sales reps
// and watch (near-)realtime how each rep's queue and recent status changes
// are doing, via GET /api/admin/sales-overview polled every POLL_MS — see
// the design doc (claude/Sales Lead Distribution - Design.md) for why
// polling was chosen over websockets/SSE for this. Styling mirrors
// HunterImport.tsx (thClass/tdClass, bg-inverse header, same button/input
// shapes) so this reads as one continuous page, not a bolted-on widget.
//
// CHANGE (2026-09-02, Hunter tab restructure, per user request): moved
// into its own tab (see components/admin/HunterMarketingTabs.tsx) instead
// of always-visible section; renamed its on-page heading from "เซลล์ &
// การกระจาย Lead" to just "กระจาย Lead" to match the shorter tab label.

const POLL_MS = 12000;
const DAILY_QUOTA = 10;

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

const SALES_STATUS_LABELS: Record<string, string> = {
  new: "ใหม่",
  contacted: "ติดต่อแล้ว",
  interested: "สนใจ",
  closed_won: "ปิดขายได้",
  closed_lost: "ปิดขายไม่ได้",
  no_response: "ไม่ตอบรับ",
};

type OverviewRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  open_count: number;
  closed_won_count: number;
  last_activity_at: string | null;
};

type ActivityEvent = {
  assignment_id: string;
  sales_status: string;
  status_updated_at: string;
  clinic_name: string;
  sales_user_name: string;
};

function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

export function SalesOverview() {
  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sales-overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!mounted.current) return;
      setOverview(data.overview);
      setActivity(data.activity);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    // Self-re-arming poll. tick() re-checks `mounted` AFTER the awaited
    // load() resolves — without that, an unmount during the in-flight fetch
    // would clear a timer that hasn't been created yet, and the next line
    // would arm a fresh one that polls forever on a dead component.
    const tick = () => {
      pollTimer.current = setTimeout(async () => {
        await load();
        if (!mounted.current) return;
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  const addSalesUser = async () => {
    const email = newEmail.trim();
    const name = newName.trim();
    if (!email || !name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/sales-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "เพิ่มเซลล์ไม่สำเร็จ");
        return;
      }
      setNewEmail("");
      setNewName("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/admin/sales-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      await load();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-primary">กระจาย Lead</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        Lead ที่ Hunter ตรวจพบปัญหาแล้ว (ควรระวัง/ห้ามเด็ดขาด) จะถูกกระจายให้เซลล์แต่ละคนวันละ {DAILY_QUOTA} รายชื่อ
        โดยอัตโนมัติ (เติมให้ครบทุกวัน) — หน้านี้อัปเดตทุก {Math.round(POLL_MS / 1000)} วินาที
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-secondary mb-1">อีเมล Google ของเซลล์</label>
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="sales@example.com"
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary mb-1">ชื่อ</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อเซลล์"
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <button
          type="button"
          onClick={addSalesUser}
          disabled={adding || !newEmail.trim() || !newName.trim()}
          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {adding ? "กำลังเพิ่ม…" : "เพิ่มเซลล์"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className={thClass}>ชื่อ</th>
              <th className={thClass}>อีเมล</th>
              <th className={thClass}>สถานะ</th>
              <th className={thClass}>วันนี้ใช้ไป</th>
              <th className={thClass}>ปิดขายได้</th>
              <th className={thClass}>อัปเดตล่าสุด</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {!overview ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  กำลังโหลด…
                </td>
              </tr>
            ) : overview.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  ยังไม่มีเซลล์ในระบบ — เพิ่มด้วยฟอร์มด้านบน
                </td>
              </tr>
            ) : (
              overview.map((row) => (
                <tr key={row.id}>
                  <td className={tdClass}>{row.name}</td>
                  <td className={tdClass}>{row.email}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        row.active ? "bg-accentSoft text-accent" : "bg-page text-tertiary border border-border"
                      }`}
                    >
                      {row.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {row.open_count}/{DAILY_QUOTA}
                  </td>
                  <td className={tdClass}>{row.closed_won_count}</td>
                  <td className={tdClass}>{row.last_activity_at ? timeAgoLabel(row.last_activity_at) : "-"}</td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      disabled={togglingId === row.id}
                      onClick={() => toggleActive(row.id, !row.active)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                    >
                      {row.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-primary">ความเคลื่อนไหวล่าสุด</h3>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-tertiary">ยังไม่มีการอัปเดตสถานะจากเซลล์</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {activity.map((ev) => (
              <li key={ev.assignment_id} className="text-sm text-secondary">
                <span className="font-medium text-primary">{ev.sales_user_name}</span> เปลี่ยน{" "}
                <span className="font-medium text-primary">{ev.clinic_name}</span> →{" "}
                {SALES_STATUS_LABELS[ev.sales_status] ?? ev.sales_status}{" "}
                <span className="text-tertiary">เมื่อ {timeAgoLabel(ev.status_updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
