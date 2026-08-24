export const dynamic = "force-dynamic";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { getPlans, getDemoBusiness } from "@/lib/db";

export default async function PricingPage() {
  const plans = await getPlans();
  const business = await getDemoBusiness();

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-5xl mx-auto px-6 py-14">
        <h1 className="text-center text-2xl font-medium mb-2">แพ็กเกจรายเดือน</h1>
        <p className="text-center text-sm text-secondary mb-12">
          เลือกแพ็กรายเดือนให้เหมาะกับปริมาณการตรวจสอบของคุณ โควตาคำนวณใหม่ทุกรอบเดือน เปลี่ยนแพ็กได้ทุกเมื่อ
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p: any) => (
            <div
              key={p.id}
              className={`rounded-lg border p-6 ${p.is_popular ? "border-accent" : "border-border"}`}
            >
              {p.is_popular && (
                <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-3">
                  ยอดนิยม · ประหยัด 30%
                </span>
              )}
              <div className="font-medium mb-1">{p.name}</div>
              <div className="text-3xl font-medium mb-1">
                {Number(p.price_thb).toLocaleString()}
                <span className="text-sm font-normal text-secondary"> บาท/เดือน</span>
              </div>
              <div className="text-sm text-secondary mb-4">{p.monthly_image_credits} รูปภาพ/เดือน</div>
              <ul className="text-sm space-y-1 mb-6">
                {(p.features || []).map((f: string) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link
                href={`/checkout?plan=${p.code}`}
                className={`block text-center rounded-md px-4 py-2 text-sm font-medium ${
                  p.is_popular ? "bg-inverse text-onInverse" : "border border-border"
                }`}
              >
                เลือกแพ็กนี้
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
