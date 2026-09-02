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

// CHANGE (Bug Audit 4, 2569-09-02): mark-paid now asks for confirmation
// (it's irreversible from the UI), and a second irreversible action,
// "ยกเลิก (refund)" -> payout_status 'void', sits next to it for a refunded
// or mistaken commission — see lib/hunterCommission.ts:voidHunterCommission.

type PayoutRow = {
  id: string;
  hunter_name: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: "pending" | "paid" | "void";
  created_at: string;
  void_reason: string | null;
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

  const patchRow = async (id: string, body: { action: "paid" } | { action: "void"; reason: string }) => {
    setMarkingId(id);
    try {
      const res = await fetch(`/api/admin/hunter-commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "อัปเดตไม่สำเร็จ");
        return;
      }
      await load();
    } catch {
      window.alert("อัปเดตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setMarkingId(null);
    }
  };

  const markPaid = async (p: PayoutRow) => {
    if (!window.confirm(`ยืนยันว่าโอนเงิน ฿${thb(p.commission_thb)} ให้ ${p.hunter_name} แล้ว? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    await patchRow(p.id, { action: "paid" });
  };

  const voidRow = async (p: PayoutRow) => {
    if (
      !window.confirm(
        `ยกเลิกค่าคอม ฿${thb(p.commission_thb)} ของ ${p.hunter_name} (คลินิก ${p.clinic_name})? ใช้เมื่อคลินิกได้รับเงินคืน/บันทึกผิด — การกระทำนี้ย้อนกลับไม่ได้`
      )
    ) {
      return;
    }
    const reason = window.prompt("เหตุผล (ไม่บังคับ) เช่น refund ให้คลินิกแล้ว", "refund") ?? "";
    await patchRow(p.id, { action: "void", reason });
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
                  <td className={tdClass}>
                    {new Date(p.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}
                  </td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-medium ${
                        p.payout_status === "paid"
                          ? "bg-accentSoft text-accent"
                          : p.payout_status === "void"
                            ? "bg-page text-tertiary border border-border line-through"
                            : "bg-warningSoft text-warning"
                      }`}
                      title={p.payout_status === "void" && p.void_reason ? p.void_reason : undefined}
                    >
                      {p.payout_status === "paid" ? "โอนแล้ว" : p.payout_status === "void" ? "ยกเลิกแล้ว" : "รอโอน"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {p.payout_status === "pending" && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => markPaid(p)}
                          disabled={markingId === p.id}
                          className="rounded-md bg-inverse text-onInverse px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                        >
                          {markingId === p.id ? "กำลังบันทึก…" : "ทำเครื่องหมายว่าจ่ายแล้ว"}
                        </button>
                        <button
                          type="button"
                          onClick={() => voidRow(p)}
                          disabled={markingId === p.id}
                          className="rounded-md border border-dangerSoft text-danger px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                        >
                          ยกเลิก (refund)
                        </button>
                      </div>
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
