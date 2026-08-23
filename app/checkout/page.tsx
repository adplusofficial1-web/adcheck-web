export const dynamic = "force-dynamic";
import { getPlans } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const plans = await getPlans();
  const plan = plans.find((p: any) => p.code === (searchParams.plan || "standard")) || plans[1];

  return (
    <main>
      <Nav backHref="/dashboard" />
      <div className="max-w-lg mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-6">ยืนยันการชำระเงิน</h1>
        <div className="bg-accentSoft rounded-lg p-4 flex items-center justify-between mb-8">
          <div>
            <div className="font-medium">
              แพ็ก{plan.name} — {plan.monthly_image_credits} ครั้ง
            </div>
            <div className="text-xs text-secondary">เครดิตใหม่จะถูกเพิ่มในบัญชีทันที</div>
          </div>
          <div className="text-xl font-medium">{Number(plan.price_thb).toLocaleString()} บาท</div>
        </div>
        <CheckoutForm planCode={plan.code} amount={Number(plan.price_thb)} />
      </div>
    </main>
  );
}
