import { listPendingManualPayments, listReviewedManualPayments } from "@/lib/qrPayments";
import { ManualPaymentsManager } from "@/components/admin/ManualPaymentsManager";

// Same reasoning as app/admin/credits/page.tsx's dynamic export — an admin
// approving/rejecting a request and immediately checking the history table
// below is the whole point of this page.
export const dynamic = "force-dynamic";

export default async function ManualPaymentsPage() {
  const [pending, reviewed] = await Promise.all([
    listPendingManualPayments(),
    listReviewedManualPayments(),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-medium text-primary">ตรวจสอบสลิปโอนเงิน (QR PromptPay)</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl">
          รายการชำระเงินที่ลูกค้าโอนผ่าน QR PromptPay / บัญชีธนาคารของบริษัทและแนบสลิปไว้ระหว่างที่ระบบชำระเงิน Omise
          ยังไม่เปิดให้บริการ (ดู lib/paymentMode.ts) — ตรวจสอบยอดโอนจริงในแอปธนาคารก่อนกด &quot;อนุมัติ&quot; ทุกครั้ง
          เครดิตจะถูกเติมให้คลินิกทันทีที่กดอนุมัติเท่านั้น ระบบไม่เติมเครดิตอัตโนมัติ
        </p>
      </div>

      <div className="mt-8">
        <ManualPaymentsManager initialPending={pending} initialReviewed={reviewed} />
      </div>
    </div>
  );
}
