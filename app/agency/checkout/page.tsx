export const dynamic = "force-dynamic";

// Agency-mode twin of app/checkout/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome. Fixes the bug where clicking
// "สมัคร/ต่ออายุ →" on /agency/dashboard sent Agency-mode visitors to the
// plain /checkout route (not under /agency/...), so Nav flipped back to
// Clinic-mode chrome mid-purchase even though nothing about the purchase
// itself is Agency-specific. Same twin-route pattern already used for
// /agency/pricing and /agency/articles — CheckoutPage has no route-specific
// behavior of its own, so re-exporting its default export is enough.
export { default } from "@/app/checkout/page";
