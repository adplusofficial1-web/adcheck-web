"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — "Hunter — ภาพรวมและค่าคอมมิชชั่น" section.
// Mirrors components/admin/SalesOverview.tsx's own structure (polling,
// thClass/tdClass table styling) for the Hunter Referral Commission
// feature — see migrations/014_hunter_referral_commissions.sql for the
// full design writeup and lib/hunterCommission.ts for how every figure
// here is derived. Two tables: per-Hunter overview (with the active
// toggle), and the full payout queue with a mark-paid action.

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

type PayoutRow = {
  id: string;
  hunter_name: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: "pending" | "paid";
  created_at: string;
  payout_method: "promptpay" | "bank" | null;
  payout_promptpay_id: string | null;
  payout_bank_name: string | null;
  payout_bank_account_no: string | null;
  payout_bank_account_name: string | null;
};

const thb = (v: string | number) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH");
}

function payoutChannelLabel(row: PayoutRow): string {
  if (row.payout_method === "promptpay") return `PromptPay ${row.payout_promptpay_id ?? "-"}`;
  if (row.payout_method === "bank") {
    return `${row.payout_bank_name ?? "-"} ${row.payout_bank_account_no ?? "-"}`;
  }
  return "ยังไม่ได้ตั้งค่า";
}

export function HunterCommissionOverview() {
  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hunter-commissions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!mounted.current) return;
      setOverview(data.overview);
      setPayouts(data.payouts);
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

  const markPaid = async (id: string) => {
    setMarkingId(id);
    try {
      const res = await fetch(`/api/admin/hunter-commissions/${id}`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      await load();
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="mt-10">
      <h2 className="text-lg font-medium text-primary">Hunter — ภาพรวมและค่าคอมมิชชั่น</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        ยอดนับจากคลินิกที่สมัครผ่านลิงก์ชวนสมัครของ Hunter แต่ละคน — ไม่เกี่ยวกับคิวคลินิกที่ &quot;ส่ง&quot; ด้านบน
        เพราะ Hunter หลายคนอาจเห็นคลินิกเดียวกันได้ แต่ค่าคอมจะนับให้เจ้าของลิงก์ที่คลินิกใช้สมัครจริงเท่านั้น —
        หน้านี้อัปเดตทุก {Math.round(POLL_MS / 1000)} วินาที
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

      <h3 className="mt-8 text-base font-medium text-primary">คิวจ่ายค่าคอมมิชชั่น</h3>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        กด &quot;ทำเครื่องหมายว่าจ่ายแล้ว&quot; หลังโอนเงินจริงตามช่องทางที่ Hunter ตั้งค่าไว้เท่านั้น
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>Hunter</th>
              <th className={thClass}>คลินิก</th>
              <th className={thClass}>งวด</th>
              <th className={thClass}>อัตรา</th>
              <th className={thClass}>จำนวนเงิน</th>
              <th className={thClass}>ช่องทางรับเงิน</th>
              <th className={thClass}>วันที่เกิดรายการ</th>
              <th className={thClass}>สถานะ</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody>
            {!payouts ? (
              <tr>
                <td colSpan={9} className="text-center text-tertiary py-6">
                  กำลังโหลด…
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-tertiary py-6">
                  ยังไม่มีรายการค่าคอมมิชชั่น
                </td>
              </tr>
            ) : (
              payouts.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>{p.hunter_name}</td>
                  <td className={tdClass}>{p.clinic_name}</td>
                  <td className={tdClass}>ครั้งที่ {p.payment_sequence}</td>
                  <td className={tdClass}>{Math.round(Number(p.commission_rate) * 100)}%</td>
                  <td className={tdClass}>฿{thb(p.commission_thb)}</td>
                  <td className={`${tdClass} text-secondary`}>{payoutChannelLabel(p)}</td>
                  <td className={tdClass}>{new Date(p.created_at).toLocaleDateString("th-TH")}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-medium ${
                        p.payout_status === "paid" ? "bg-accentSoft text-accent" : "bg-warningSoft text-warning"
                      }`}
                    >
                      {p.payout_status === "paid" ? "โอนแล้ว" : "รอโอน"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {p.payout_status === "pending" && (
                      <button
                        type="button"
                        onClick={() => markPaid(p.id)}
                        disabled={markingId === p.id}
                        className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                      >
                        {markingId === p.id ? "กำลังบันทึก…" : "ทำเครื่องหมายว่าจ่ายแล้ว"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
