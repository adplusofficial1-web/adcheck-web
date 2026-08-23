export const dynamic = "force-dynamic";
import { Nav } from "@/components/Nav";
import { sql, getDemoBusiness, getPlans } from "@/lib/db";

const CHANNELS = ["บัตรเครดิต/เดบิต", "QR PromptPay", "Mobile Banking", "Direct Debit"];

export default async function SettingsPage() {
  const business = await getDemoBusiness();
  const plans = await getPlans();
  const invoices = (await sql`
    SELECT * FROM transactions WHERE business_id = ${business.id} ORDER BY created_at DESC LIMIT 10
  `) as any[];

  return (
    <main>
      <Nav credits={business.credits_remaining} backHref="/dashboard" />
      <div className="max-w-2xl mx-auto px-6 py-14 space-y-8">
        <h1 className="text-2xl font-medium">ตั้งค่าบัญชี</h1>

        <section className="border border-border rounded-lg p-6">
          <div className="text-sm font-medium mb-4">ข้อมูลบัญชี</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-secondary text-xs mb-1">ชื่อคลินิก</div>
              <div>{business.name}</div>
            </div>
            <div>
              <div className="text-secondary text-xs mb-1">อีเมล</div>
              <div>{business.contact_email}</div>
            </div>
            <div>
              <div className="text-secondary text-xs mb-1">เลขที่ใบอนุญาตสถานพยาบาล</div>
              <div>{business.license_number || "—"}</div>
            </div>
            <div>
              <div className="text-secondary text-xs mb-1">แพ็กปัจจุบัน</div>
              <div>{business.plan_name || "—"}</div>
            </div>
          </div>
        </section>

        <section className="border border-border rounded-lg p-6">
          <div className="text-sm font-medium mb-4">วิธีการชำระเงิน</div>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((c) => (
              <div
                key={c}
                className={`rounded-md border px-3 py-2 text-sm ${
                  business.default_payment_channel === c ? "border-accent" : "border-border"
                }`}
              >
                {c}
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border rounded-lg p-6">
          <div className="text-sm font-medium mb-4">เติมเครดิต</div>
          <div className="grid grid-cols-3 gap-3">
            {plans.map((p: any) => (
              <a
                key={p.id}
                href={`/checkout?plan=${p.code}`}
                className="rounded-md border border-border p-3 text-center text-sm hover:border-accent"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-secondary text-xs">{p.monthly_image_credits} ครั้ง</div>
                <div className="mt-1">{Number(p.price_thb).toLocaleString()} บาท</div>
              </a>
            ))}
          </div>
        </section>

        <section className="border border-border rounded-lg p-6">
          <div className="text-sm font-medium mb-4">ประวัติใบกำกับภาษี</div>
          {invoices.length === 0 && <p className="text-sm text-secondary">ยังไม่มีรายการ</p>}
          <div className="space-y-2">
            {invoices.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span>
                  {t.invoice_number} · {new Date(t.created_at).toLocaleDateString("th-TH")}
                </span>
                <span>{Number(t.amount_thb).toLocaleString()} บาท</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
