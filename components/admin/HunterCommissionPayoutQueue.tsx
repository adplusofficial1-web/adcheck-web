"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Admin > Marketing > Hunter — "Finance" tab (formerly "คิวจ่ายค่าคอมมิชชั่น",
// previously a sub-section inside HunterCommissionOverview.tsx). Split out
// into its own file (2026-09-02, Hunter tab restructure, per user request)
// so it can be its own tab — see HunterCommissionOverview.tsx's comment
// for the split rationale, and components/admin/HunterMarketingTabs.tsx
// for how the two tabs mount independently.
//
// Deliberately duplicates the fetch to GET /api/admin/hunter-commissions
// (the same endpoint the Commission tab uses, which returns both
// `overview` and `payouts` together) rather than sharing state with that
// component: the two are now separate tabs that mount/unmount
// independently as the admin switches between them, so each fetching its
// own slice on mount is simpler than lifting shared state into a parent
// that outlives both tabs.

const POLL_MS = 15000;

const thClass = "bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left";
const tdClass = "px-3 py-2 border-b border-border text-left align-top";

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

const thb = (v: string | number) =>
  Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function payoutChannelLabel(row: PayoutRow): string {
  if (row.payout_method === "promptpay") return `PromptPay ${row.payout_promptpay_id ?? "-"}`;
  if (row.payout_method === "bank") {
    return `${row.payout_bank_name ?? "-"} ${row.payout_bank_account_no ?? "-"}`;
  }
  return "ยังไม่ได้ตั้งค่า";
}

export function HunterCommissionPayoutQueue() {
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
    <div>
      <h2 className="text-lg font-medium text-primary">Finance</h2>
      <p className="mt-1 text-sm text-secondary max-w-2xl">
        กด &quot;ทำเครื่องหมายว่าจ่ายแล้ว&quot; หลังโอนเงินจริงตามช่องทางที่ Hunter ตั้งค่าไว้เท่านั้น — อัปเดตทุก{" "}
        {Math.round(POLL_MS / 1000)} วินาที
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 overflow-x-auto">
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
