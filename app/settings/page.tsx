export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { sql, getPaymentMethods } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

export default async function SettingsPage() {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  const [cards, invoices] = await Promise.all([
    getPaymentMethods(business.id),
    sql`
      SELECT * FROM transactions WHERE business_id = ${business.id} ORDER BY created_at DESC LIMIT 10
    ` as Promise<any[]>,
  ]);

  return (
    <main>
      <Nav credits={business.credits_remaining} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">ตั้งค่าคลินิก</h1>
        <p className="text-sm text-secondary mb-8">
          จัดการข้อมูลคลินิก การเรียกเก็บเงิน แพ็กเกจ และบัตรที่ผูกไว้ทั้งหมดในที่เดียว
        </p>
        <SettingsClient business={business} cards={cards} invoices={invoices} />
      </div>
    </main>
  );
}
