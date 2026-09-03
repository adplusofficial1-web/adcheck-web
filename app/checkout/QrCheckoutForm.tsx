"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type BankAccount = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

type PendingInfo = { invoiceNumber: string; createdAt: string } | null;

const MAX_SLIP_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone screenshot/photo of a bank app receipt.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Interim checkout flow (2569-09-03) while ADCheck's Omise merchant account
// is still pending approval — see lib/paymentMode.ts and
// app/checkout/page.tsx, which renders this instead of CheckoutForm.tsx
// (left completely untouched) whenever PAYMENT_MODE isn't "omise". No
// gateway is involved here at all: the customer scans a dynamic PromptPay
// QR (or copies the bank details below it) built server-side in
// app/checkout/page.tsx (lib/promptpay.ts), transfers manually, then
// uploads a screenshot of the transfer as proof. An AD Plus admin reviews
// that slip (app/admin/manual-payments) and only THEN are credits granted
// — see lib/qrPayments.ts. Nothing here can auto-confirm a transfer really
// happened, unlike a card/Omise charge.
export function QrCheckoutForm({
  planCode,
  planName,
  amount,
  qrDataUrl,
  bankAccount,
  pending,
}: {
  planCode: string;
  planName: string;
  amount: number;
  qrDataUrl: string;
  bankAccount: BankAccount;
  pending: PendingInfo;
}) {
  const pathname = usePathname();
  const isAgencyCheckout = pathname?.startsWith("/agency") ?? false;
  const dashboardHref = isAgencyCheckout ? "/agency/dashboard" : "/dashboard";

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ invoiceNumber: string } | null>(
    pending ? { invoiceNumber: pending.invoiceNumber } : null
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setFilePreview(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError("รองรับเฉพาะไฟล์รูปภาพ (JPG/PNG/WEBP) หรือ PDF เท่านั้น");
      return;
    }
    if (f.size > MAX_SLIP_BYTES) {
      setError("ไฟล์ใหญ่เกินไป (จำกัด 8MB)");
      return;
    }
    setFile(f);
    setFilePreview(f.type === "application/pdf" ? null : URL.createObjectURL(f));
  }

  async function submit() {
    if (!termsAccepted) {
      setError("กรุณายอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบก่อนดำเนินการ");
      return;
    }
    if (!file) {
      setError("กรุณาแนบสลิปการโอนเงิน");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("planCode", planCode);
      form.append("termsAccepted", "true");
      form.append("slip", file);
      const res = await fetch("/api/checkout/qr/submit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
      setSubmitted({ invoiceNumber: data.invoiceNumber });
    } catch (err: any) {
      setError(err?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-10">
        <div className="text-lg font-medium mb-2">ส่งสลิปการโอนเงินแล้ว — รอตรวจสอบ</div>
        <div className="text-sm text-secondary mb-1">เลขที่ใบแจ้งชำระ {submitted.invoiceNumber}</div>
        <div className="text-sm text-secondary max-w-sm mx-auto">
          ทีมงานจะตรวจสอบและเติมเครดิตแพ็ก{planName}ให้ภายใน 1 วันทำการ ระบบจะไม่เติมเครดิตอัตโนมัติจนกว่าทีมงานจะยืนยันยอดโอนแล้ว
        </div>
        <a
          href={dashboardHref}
          className="inline-block mt-6 rounded-md bg-inverse text-onInverse py-3 px-6 text-sm font-medium"
        >
          กลับไปหน้าแดชบอร์ด
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-warningSoft text-warning rounded-lg p-4 mb-6 text-sm">
        ระบบชำระเงินออนไลน์ผ่านบัตร/เกตเวย์อยู่ระหว่างรออนุมัติจากผู้ให้บริการ ขณะนี้กรุณาชำระเงินด้วยการโอนผ่าน QR PromptPay ด้านล่าง แล้วแนบสลิปเพื่อให้ทีมงานตรวจสอบและเติมเครดิตให้
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`PromptPay QR ชำระเงิน ${amount.toLocaleString("th-TH")} บาท`}
          width={220}
          height={220}
          className="rounded-md border border-border"
        />
        <div className="mt-3 text-sm text-secondary">
          สแกนด้วยแอปธนาคารใดก็ได้ — ยอดเงิน {amount.toLocaleString("th-TH")} บาท ถูกกรอกไว้ให้แล้วอัตโนมัติ
        </div>
        <div className="w-full border-t border-border mt-5 pt-4 text-left text-sm text-secondary space-y-1">
          <div className="text-xs uppercase tracking-wide text-tertiary mb-1">หรือโอนเข้าบัญชีธนาคารโดยตรง</div>
          <div>ธนาคาร: {bankAccount.bankName}</div>
          <div>เลขที่บัญชี: {bankAccount.accountNumber}</div>
          <div>ชื่อบัญชี: {bankAccount.accountName}</div>
        </div>
      </div>

      <div className="text-sm font-medium mb-2">แนบสลิปการโอนเงิน</div>
      <label className="block rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-secondary cursor-pointer hover:border-accent mb-1">
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFileChange} />
        {file ? file.name : "แตะเพื่อเลือกไฟล์ภาพสลิป หรือ PDF (ไม่เกิน 8MB)"}
      </label>
      {filePreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={filePreview} alt="ตัวอย่างสลิป" className="mt-3 max-h-48 rounded-md border border-border mx-auto" />
      )}

      <label className="flex items-start gap-2 text-xs text-secondary pt-4 pb-3">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>ฉันได้อ่านและยอมรับข้อกำหนดและข้อจำกัดความรับผิดชอบข้างต้นแล้ว</span>
      </label>

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      <button
        onClick={submit}
        disabled={loading || !termsAccepted || !file}
        className="w-full rounded-md bg-inverse text-onInverse py-3 text-sm font-medium disabled:opacity-50 mt-2"
      >
        {loading ? "กำลังส่งข้อมูล..." : "แจ้งชำระเงินแล้ว"}
      </button>
    </div>
  );
}
