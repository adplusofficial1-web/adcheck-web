"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — "Commission" tab (formerly the "Hunter —
// ภาพรวมและค่าคอมมิชชั่น" section). Mirrors components/admin/SalesOverview.tsx's
// own structure (polling, thClass/tdClass table styling) for the Hunter
// Referral Commission feature — see migrations/014_hunter_referral_commissions.sql
// for the full design writeup and lib/hunterCommission.ts for how every
// figure here is derived.
//
// CHANGE (2026-09-02, Hunter tab restructure, per user request): this file
// used to render BOTH the per-Hunter overview table AND the full payout
// queue in one always-visible section. Split into two tabs: this one keeps
// just the overview table (renamed "Commission" to match the shorter tab
// label); the payout queue moved to its own component,
// HunterCommissionPayoutQueue.tsx ("Finance" tab) — see that file's own
// comment for why it duplicates the fetch instead of sharing state with
// this one.

const POLL_MS = 15000;

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

type OverviewRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  referred_count: number;
  closed_won_count: number;
  pending_thb: string;
  paid_thb: string;
  last_activity: string | null;
};

const thb = (v: string | number) =>
  Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH");
}

export function HunterCommissionOverview() {
  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-commissions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!mounted.current) return;
      setOverview(data.overview);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const tick = () => {
      pollTimer.current = setTimeout(async () => {
        await load();
        tick();
      }, POLL_MS);
    };
    tick();
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  return (
    <div>
      <h2 className="text-lg font-medium text-primary">Commission</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        ยอดนับจากคลินิกที่สมัครผ่านลิงก์ชวนสมัครของ Hunter แต่ละคน — ไม่เกี่ยวกับคิวคลินิกที่ &quot;ส่ง&quot; ในแท็บ
        &quot;คิว Hunter&quot; เพราะ Hunter หลายคนอาจเห็นคลินิกเดียวกันได้ แต่ค่าคอมจะนับให้เจ้าของลิงก์ที่คลินิกใช้สมัครจริงเท่านั้น —
        อัปเดตทุก {Math.round(POLL_MS / 1000)} วินาที
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>ชื่อ</th>
              <th className={thClass}>อีเมล</th>
              <th className={thClass}>สถานะ</th>
              <th className={thClass}>คลินิกที่แนะนำ</th>
              <th className={thClass}>ปิดได้</th>
              <th className={thClass}>ค่าคอมรอโอน</th>
              <th className={thClass}>ค่าคอมโอนแล้ว</th>
              <th className={thClass}>กิจกรรมล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {!overview ? (
              <tr>
                <td colSpan={8} className="text-center text-tertiary py-6">
                  กำลังโหลด…
                </td>
              </tr>
            ) : overview.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-tertiary py-6">
                  ยังไม่มี Hunter ในระบบ
                </td>
              </tr>
            ) : (
              overview.map((h) => (
                <tr key={h.id}>
                  <td className={tdClass}>{h.name}</td>
                  <td className={tdClass}>{h.email}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-medium ${
                        h.active ? "bg-accentSoft text-accent" : "bg-dangerSoft text-danger"
                      }`}
                    >
                      {h.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className={tdClass}>{h.referred_count}</td>
                  <td className={tdClass}>{h.closed_won_count}</td>
                  <td className={tdClass}>฿{thb(h.pending_thb)}</td>
                  <td className={tdClass}>฿{thb(h.paid_thb)}</td>
                  <td className={`${tdClass} text-secondary`}>{h.last_activity ? timeAgoLabel(h.last_activity) : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
