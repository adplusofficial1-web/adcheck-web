export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { getPlans } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner } from "@/lib/agency";
import { Nav } from "@/components/Nav";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string; business?: string };
}) {
  const plans = await getPlans();
  const plan = plans.find((p: any) => p.code === (searchParams.plan || "standard")) || plans[1];
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  // ?business=<id> lets an Agency page ("ซื้อ/เติมแพ็กเกจให้คลินิกนี้") send
  // someone here to pay for a specific clinic instead of their own account
  // — getBusinessByIdForOwner only resolves ids that are the signed-in
  // business itself or one of its own child clinics, so this page can never
  // be used to view or bill someone else's business.
  const target = searchParams.business ? await getBusinessByIdForOwner(searchParams.business, business.id) : business;
  if (!target) {
    notFound();
  }
  const isForOther = target.id !== business.id;

  return (
    <main>
      <Nav credits={business?.credits_remaining} />
      <div className="max-w-lg mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">ยืนยันการชำระเงิน</h1>
        {isForOther && (
          <p className="text-sm text-secondary mb-4">
            กำลังซื้อแพ็กเกจให้ <span className="font-medium text-primary">{target.name}</span> ในเครือข่ายของคุณ
          </p>
        )}
        <div className="bg-accentSoft rounded-lg p-4 flex items-center justify-between mb-8 mt-4">
          <div>
            <div className="font-medium">
              แพ็ก{plan.name} — {plan.monthly_image_credits} ครั้ง
            </div>
            <div className="text-xs text-secondary">เครดิตใหม่จะถูกตั้งเป็นยอดนี้ทันที นับรอบ 30 วันใหม่จากวันนี้</div>
          </div>
          <div className="text-xl font-medium">{Number(plan.price_thb).toLocaleString()} บาท</div>
        </div>
        <CheckoutForm planCode={plan.code} amount={Number(plan.price_thb)} businessId={isForOther ? target.id : undefined} />
      </div>
    </main>
  );
}
