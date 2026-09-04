export const dynamic = "force-dynamic";

// Agency-mode twin of app/pricing/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome. Renders the same shared
// PricingContent used by /pricing, just pointing checkoutBasePath at
// /agency/checkout instead of /checkout so Agency-mode visitors stay in
// Agency chrome all the way through checkout too (see
// app/agency/checkout/page.tsx — same fix applied there for the
// "สมัคร/ต่ออายุ" button on /agency/dashboard).
//
// SEO: this page previously had no metadata export at all, and identical
// pricing content to /pricing — added a title/description plus a
// canonical back to /pricing so the two don't split ranking signal.
import { PricingContent } from "@/components/pricing/PricingContent";

export const metadata = {
  title: "ราคา — AdCheck",
  description: "แพ็กเกจตรวจสอบโฆษณาคลินิกด้วย AI เลือกตามปริมาณการใช้งาน เริ่มต้น 199 บาท/เดือน",
  alternates: {
    canonical: "/pricing",
  },
};

export default function AgencyPricingPage() {
  return <PricingContent checkoutBasePath="/agency/checkout" />;
}
