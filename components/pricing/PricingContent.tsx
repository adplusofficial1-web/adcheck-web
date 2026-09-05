import { SelectPlanButton } from "@/components/pricing/SelectPlanButton";
import { Nav } from "@/components/Nav";
import { DisclaimerBox } from "@/components/DisclaimerBox";
import { DbdTrustBadge } from "@/components/DbdTrustBadge";
import { getPlans } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Shared "แพ็กเกจรายเดือน" pricing UI for both /pricing (clinic mode) and
// /agency/pricing (agency mode) — plan data (lib/db.ts:getPlans) is
// identical either way, so this component is the single place that renders
// it. checkoutBasePath picks which checkout route each "เลือกแพ็กนี้" button
// points at — Agency-mode visitors need /agency/checkout (not /checkout) so
// Nav.tsx's path-prefix check keeps Agency-mode chrome all the way through
// checkout instead of flipping back to Clinic-mode chrome partway through
// (same twin-route pattern already used for /agency/articles and this
// component's own /agency/pricing wrapper — see app/agency/checkout/page.tsx
// for the checkout-side half of this fix).
export async function PricingContent({ checkoutBasePath = "/checkout" }: { checkoutBasePath?: string }) {
  const plans = await getPlans();
  // /pricing stays public (see middleware.ts) — an anonymous visitor
  // legitimately has no business yet, so unlike other pages this one
  // doesn't redirect on null, it just renders the Nav without a credits
  // count.
  const business = await getCurrentBusiness();

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
              <div className="text-sm text-secondary mb-4">{Number(p.monthly_image_credits).toLocaleString()} รูปภาพ/เดือน</div>
              <ul className="text-sm space-y-1 mb-6">
                {(p.features || []).map((f: string) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
<SelectPlanButton
  href={`${checkoutBasePath}?plan=${p.code}`}
  planCode={p.code}
  planName={p.name}
  priceThb={Number(p.price_thb)}
  isPopular={p.is_popular}
  >
เลือกแพ็กนี้
</SelectPlanButton>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-12">
          <DbdTrustBadge />
        </div>

        <DisclaimerBox className="mt-8" />
      </div>
    </main>
  );
}
