export const dynamic = "force-dynamic";
import { PricingContent } from "@/components/pricing/PricingContent";

// Clinic-mode entry point for the shared pricing UI — see
// components/pricing/PricingContent.tsx for the actual page content and
// why checkoutBasePath exists (Agency-mode uses app/agency/pricing/page.tsx
// instead, passing checkoutBasePath="/agency/checkout").
//
// SEO: this page previously had no metadata export at all — added one.
export const metadata = {
  title: "ราคา — AdCheck",
  description: "แพ็กเกจตรวจสอบโฆษณาคลินิกด้วย AI เลือกตามปริมาณการใช้งาน เริ่มต้น 199 บาท/เดือน",
};

export default function PricingPage() {
  return <PricingContent />;
}
