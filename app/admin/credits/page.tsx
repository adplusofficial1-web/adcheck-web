import { listCreditGrants } from "@/lib/creditGrants";
import { CreditGrantManager } from "@/components/admin/CreditGrantManager";

// Same reasoning as app/admin/knowledge-base/page.tsx's dynamic export —
// an admin granting credits and immediately checking the history table
// below is the whole point of this page, so it must never serve a cached
// list.
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const grants = await listCreditGrants();

  return (
    <div className="max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-medium text-primary">ให้เครดิตตรวจฟรี</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl">
          ให้เครดิตตรวจฟรีแก่คลินิกโดยตรง (เช่น เป็นโปรโมชั่นชักชวน หรือทดลองใช้งาน) — เครดิตจะถูกเพิ่มเข้ายอดคงเหลือของคลินิกทันที
          และไม่มีวันหมดอายุ (เหมือนเครดิตเริ่มต้นที่คลินิกได้รับตอนสมัคร) ทุกครั้งที่ให้เครดิตจะถูกบันทึกไว้ในประวัติด้านล่างเสมอ
        </p>
      </div>

      <div className="mt-8">
        <CreditGrantManager initialGrants={grants} />
      </div>
    </div>
  );
}
