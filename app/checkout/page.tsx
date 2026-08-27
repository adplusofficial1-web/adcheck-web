export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getPlans } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { Nav } from "@/components/Nav";
import { CheckoutForm } from "./CheckoutForm";

// There is no per-clinic checkout any more — every purchase here (whether
// it's a solo clinic's own package or an agency's shared code='agency'
// package) always bills the signed-in business itself. A child clinic has
// no login of its own and no package of its own to buy; every review it
// runs draws from its managing agency's pool instead (see
// lib/agency.ts:hasActiveAgencyPlan and app/api/submissions/route.ts).
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const plans = await getPlans();
  const plan = plans.find((p: any) => p.code === (searchParams.plan || "standard")) || plans[1];
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-lg mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">ยืนยันการชำระเงิน</h1>
        <div className="bg-accentSoft rounded-lg p-4 flex items-center justify-between mb-8 mt-4">
          <div>
            <div className="font-medium">
              แพ็ก{plan.name} — {plan.monthly_image_credits} ครั้ง
            </div>
            <div className="text-xs text-secondary">เครดิตใหม่จะถูกตั้งเป็นยอดนี้ทันที นับรอบ 30 วันใหม่จากวันนี้</div>
          </div>
          <div className="text-xl font-medium">{Number(plan.price_thb).toLocaleString()} บาท</div>
        </div>
        {/* Payment gateway isn't connected yet — every charge attempt fails
            server-side by design (see app/api/checkout/route.ts). Warn
            before the user picks a channel and fills anything in, instead
            of only surfacing the failure after they hit "ชำระเงิน" (C2). */}
        <div className="bg-warningSoft text-warning rounded-lg p-4 mb-6 text-sm">
          ระบบชำระเงินออนไลน์ยังไม่เปิดให้บริการในขณะนี้ กรุณาติดต่อทีมงานเพื่อเติมเครดิตด้วยตนเองก่อน
        </div>
        <CheckoutForm planCode={plan.code} amount={Number(plan.price_thb)} />
      </div>
    </main>
  );
}
