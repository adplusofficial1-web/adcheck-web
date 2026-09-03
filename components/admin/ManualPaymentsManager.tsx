"use client";

import { useState } from "react";
import type { ManualPaymentRequest } from "@/lib/qrPayments";
import { formatThaiDateTime } from "@/lib/formatDateTime";

type Props = {
  initialPending: ManualPaymentRequest[];
  initialReviewed: ManualPaymentRequest[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

// Admin > ตรวจสอบสลิปโอนเงิน: the review queue for the interim manual QR
// PromptPay / bank-transfer checkout (see lib/paymentMode.ts,
// app/checkout/QrCheckoutForm.tsx). One card per pending request (slip
// preview + approve/reject) plus a reviewed-history list underneath —
// same two-section shape as CreditGrantManager.tsx.
export function ManualPaymentsManager({ initialPending, initialReviewed }: Props) {
  const [pending, setPending] = useState<ManualPaymentRequest[]>(initialPending);
  const [reviewed, setReviewed] = useState<ManualPaymentRequest[]>(initialReviewed);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  async function act(id: string, action: "approve" | "reject") {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    if (action === "approve" && !window.confirm(`ยืนยันว่าตรวจสอบยอดโอน ${Number(item.amount_thb).toLocaleString("th-TH")} บาท จากแอปธนาคารแล้ว และจะอนุมัติเติมเครดิตให้ ${item.business_name}?`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const note = noteDraft[id]?.trim() || undefined;
      const res = await fetch(`/api/admin/manual-payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { action, note } : { action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ดำเนินการไม่สำเร็จ");

      setPending((prev) => prev.filter((p) => p.id !== id));
      setReviewed((prev) => [
        {
          ...item,
          status: action === "approve" ? "approved" : "rejected",
          reviewed_at: new Date().toISOString(),
          review_note: action === "reject" ? note || null : null,
        },
        ...prev,
      ]);
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div>
        <h2 className="text-sm font-medium text-primary mb-3">รอตรวจสอบ ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-tertiary">
            ไม่มีรายการรอตรวจสอบ
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="shrink-0">
                    {p.slip_media_type === "application/pdf" ? (
                      <a
                        href={`/api/admin/manual-payments/${p.id}/slip`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-28 w-28 items-center justify-center rounded-md border border-border bg-page text-xs text-accent underline"
                      >
                        เปิดไฟล์ PDF
                      </a>
                    ) : (
                      <a href={`/api/admin/manual-payments/${p.id}/slip`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/admin/manual-payments/${p.id}/slip`}
                          alt={`สลิปโอนเงินของ ${p.business_name}`}
                          className="h-28 w-28 rounded-md border border-border object-cover"
                        />
                      </a>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="font-medium text-primary">
                        {p.business_name} <span className="text-tertiary font-normal">({p.business_email})</span>
                      </span>
                      <span className="font-medium text-primary tabular-nums">
                        {Number(p.amount_thb).toLocaleString("th-TH")} บาท
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-tertiary">
                      แพ็ก{p.plan_name} · เลขที่ใบแจ้งชำระ {p.invoice_number} · ส่งเมื่อ {formatThaiDateTime(p.created_at)}
                    </div>

                    <input
                      type="text"
                      value={noteDraft[p.id] || ""}
                      onChange={(e) => setNoteDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="หมายเหตุ (ใช้ตอนปฏิเสธ เช่น ยอดโอนไม่ตรง)"
                      className="mt-3 w-full rounded-md border border-border bg-page px-3 py-2 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => act(p.id, "approve")}
                        disabled={busyId === p.id}
                        className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-onInverse disabled:opacity-50"
                      >
                        {busyId === p.id ? "กำลังดำเนินการ..." : "อนุมัติ + เติมเครดิต"}
                      </button>
                      <button
                        onClick={() => act(p.id, "reject")}
                        disabled={busyId === p.id}
                        className="rounded-md border border-border px-4 py-2 text-xs font-medium text-danger disabled:opacity-50"
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-primary mb-3">ประวัติการตรวจสอบ</h2>
        <ul className="space-y-2">
          {reviewed.length === 0 && (
            <li className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-tertiary">
              ยังไม่มีประวัติ
            </li>
          )}
          {reviewed.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="font-medium text-primary">
                  {r.business_name} <span className="text-tertiary font-normal">({r.business_email})</span>
                </span>
                <span className={r.status === "approved" ? "text-accent font-medium" : "text-danger font-medium"}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4 flex-wrap text-xs text-tertiary">
                <span>
                  แพ็ก{r.plan_name} · {Number(r.amount_thb).toLocaleString("th-TH")} บาท · {r.invoice_number}
                  {r.review_note ? ` · ${r.review_note}` : ""}
                </span>
                <span>{r.reviewed_at ? formatThaiDateTime(r.reviewed_at) : ""} · โดย {r.reviewed_by}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
