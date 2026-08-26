export const dynamic = "force-dynamic";

// Agency-mode twin of app/pricing/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome (the bug this route fixes).
// PricingPage has no route-specific behavior of its own (it just reads
// the signed-in business + the shared plans table), so re-exporting its
// default export is enough — this route is never a separate copy of the
// pricing content, it's literally the same component, so plan/price
// updates apply to both modes automatically with nothing to keep in sync
// by hand.
export { default } from "@/app/pricing/page";
