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
    // Every package purchase for this account, most recent first — no
    // LIMIT, since ประวัติการชำระเงิน here is meant to be the complete
    // record, not just a recent sample. Joins plans so each row can show
    // which package it was (a business's plan_id only ever reflects its
    // *current* plan — a past purchase of a since-changed plan would
    // otherwise be unlabeled).
    sql`
      SELECT t.*, p.name AS plan_name, p.code AS plan_code
      FROM transactions t
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE t.business_id = ${business.id}
      ORDER BY t.created_at DESC
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
