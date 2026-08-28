export const dynamic = "force-dynamic";

// Agency-mode twin of app/pricing/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome. Renders the same shared
// PricingContent used by /pricing, just pointing checkoutBasePath at
// /agency/checkout instead of /checkout so Agency-mode visitors stay in
// Agency chrome all the way through checkout too (see
// app/agency/checkout/page.tsx — same fix applied there for the
// "สมัคร/ต่ออายุ" button on /agency/dashboard).
import { PricingContent } from "@/components/pricing/PricingContent";

export default function AgencyPricingPage() {
  return <PricingContent checkoutBasePath="/agency/checkout" />;
}
