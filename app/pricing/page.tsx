export const dynamic = "force-dynamic";
import { PricingContent } from "@/components/pricing/PricingContent";

// Clinic-mode entry point for the shared pricing UI — see
// components/pricing/PricingContent.tsx for the actual page content and
// why checkoutBasePath exists (Agency-mode uses app/agency/pricing/page.tsx
// instead, passing checkoutBasePath="/agency/checkout").
export default function PricingPage() {
  return <PricingContent />;
}
