export const dynamic = "force-dynamic";
import { PricingContent } from "@/components/pricing/PricingContent";

// Clinic-mode entry point for the shared pricing UI — see
// components/pricing/PricingContent.tsx for the actual page content and
// why checkoutBasePath exists (Agency-mode uses app/agency/pricing/page.tsx
// instead, passing checkoutBasePath="/agency/checkout").
//
// SEO audit (OpenRush, 2569-09-05): title was too short (14 chars) and this
// page had no self-referencing canonical — both fixed here.
export const metadata = {
  title: "ราคาแพ็กเกจตรวจสอบโฆษณาคลินิกด้วย AI — AdCheck",
  description: "แพ็กเกจตรวจสอบโฆษณาคลินิกด้วย AI เลือกตามปริมาณการใช้งาน เริ่มต้น 199 บาท/เดือน",
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  return <PricingContent />;
}
