"use client";

import { useCallback, useEffect, useState } from "react";

// /hunter's "ค่าคอมมิชชั่น & การรับเงิน" tab — where a Hunter sets up how
// they get paid (PromptPay or bank transfer) and sees every commission
// line item. Payout fields live on hunter_users
// (migrations/014_hunter_referral_commissions.sql); ledger rows come from
// GET /api/hunter/commissions (see lib/hunterCommission.ts).

type PayoutMethod = "promptpay" | "bank";

type Settings = {
  id: string;
  payout_method: PayoutMethod | null;
  payout_promptpay_id: string | null;
  payout_bank_name: string | null;
  payout_bank_account_no: string | null;
  payout_bank_account_name: string | null;
};

type LedgerRow = {
  id: string;
  clinic_name: string;
  payment_sequence: number;
  commission_rate: string;
  commission_thb: string;
  payout_status: "pending" | "paid";
  created_at: string;
};

const thb = (v: string | number) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function HunterCommissionTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayoutMethod>("promptpay");
  const [promptpayId, setPromptpayId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settingsRes, commissionsRes] = await Promise.all([
        fetch("/api/hunter/settings", { cache: "no-store" }),
        fetch("/api/hunter/commissions", { cache: "no-store" }),
      ]);
      const settingsData = await settingsRes.json();
      const commissionsData = await commissionsRes.json();
      if (!settingsRes.ok) throw new Error(settingsData?.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!commissionsRes.ok) throw new Error(commissionsData?.error || "โหลดข้อมูลไม่สำเร็จ");

      setSettings(settingsData.settings);
      setLedger(commissionsData.ledger);
      setMethod(settingsData.settings?.payout_method ?? "promptpay");
      setPromptpayId(settingsData.settings?.payout_promptpay_id ?? "");
      setBankName(settingsData.settings?.payout_bank_name ?? "");
      setBankAccountNo(settingsData.settings?.payout_bank_account_no ?? "");
      setBankAccountName(settingsData.settings?.payout_bank_account_name ?? "");
      setError(null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/hunter/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutMethod: method,
          promptpayId,
          bankName,
          bankAccountNo,
          bankAccountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "บันทึกไม่สำเร็จ");
        return;
      }
      setSettings(data.settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!settings || !ledger) return <p className="text-sm text-secondary">กำลังโหลด…</p>;

  return (
    <div>
      <p className="text-sm text-secondary max-w-2xl">
        ผูกช่องทางรับเงินของคุณไว้ล่วงหน้า ทีมงานจะโอนค่าคอมเข้าช่องทางนี้เป็นประจำทุกเดือน
      </p>

      <div className="mt-5 rounded-lg border border-border bg-surface p-4" style={{ maxWidth: 480 }}>
        <div className="flex gap-2">
          {(["promptpay", "bank"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setSaved(false);
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium border ${
                method === m ? "bg-inverse text-onInverse border-inverse" : "bg-surface text-secondary border-border"
              }`}
            >
              {m === "promptpay" ? "PromptPay" : "โอนเข้าบัญชีธนาคาร"}
            </button>
          ))}
        </div>

        {method === "promptpay" ? (
          <div className="mt-4">
            <label className="block text-xs text-secondary mb-1.5">หมายเลข PromptPay (เบอร์โทร/เลขบัตรประชาชน)</label>
            <input
              value={promptpayId}
              onChange={(e) => {
                setPromptpayId(e.target.value);
                setSaved(false);
              }}
              placeholder="081-234-5678"
              className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1.5">ธนาคาร</label>
              <input
                value={bankName}
                onChange={(e) => {
                  setBankName(e.target.value);
                  setSaved(false);
                }}
                placeholder="กสิกรไทย"
                className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">เลขที่บัญชี</label>
              <input
                value={bankAccountNo}
                onChange={(e) => {
                  setBankAccountNo(e.target.value);
                  setSaved(false);
                }}
                placeholder="123-4-56789-0"
                className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">ชื่อบัญชี</label>
              <input
                value={bankAccountName}
                onChange={(e) => {
                  setBankAccountName(e.target.value);
                  setSaved(false);
                }}
                placeholder="นายสมชาย ใจดี"
                className="w-full rounded-md border border-border bg-page px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-inverse text-onInverse px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก…" : "บันทึกช่องทางรับเงิน"}
          </button>
          {saved && <span className="text-xs text-accent">บันทึกแล้ว ✓</span>}
        </div>
      </div>

      <h2 className="mt-8 text-base font-medium text-primary">ประวัติค่าคอมมิชชั่น</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">วันที่</th>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">คลินิก</th>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">งวดชำระ</th>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">อัตรา</th>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">ค่าคอม</th>
              <th className="bg-inverse text-onInverse text-xs font-medium px-3 py-2 text-left">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-tertiary py-6">
                  ยังไม่มีรายการค่าคอมมิชชั่น
                </td>
              </tr>
            ) : (
              ledger.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 border-b border-border">
                    {new Date(row.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-3 py-2 border-b border-border">{row.clinic_name}</td>
                  <td className="px-3 py-2 border-b border-border">ครั้งที่ {row.payment_sequence}</td>
                  <td className="px-3 py-2 border-b border-border">{Math.round(Number(row.commission_rate) * 100)}%</td>
                  <td className="px-3 py-2 border-b border-border">฿{thb(row.commission_thb)}</td>
                  <td className="px-3 py-2 border-b border-border">
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        row.payout_status === "paid" ? "bg-accentSoft text-accent" : "bg-warningSoft text-warning"
                      }`}
                    >
                      {row.payout_status === "paid" ? "โอนแล้ว" : "รอโอน"}
                    </span>
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
