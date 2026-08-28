export const dynamic = "force-dynamic";

// Agency-mode twin of app/processing/[id]/page.tsx — lives under /agency/...
// so components/Nav.tsx's path-prefix check (rendered inside
// components/ProcessingScreen.tsx) keeps Agency-mode chrome instead of
// dropping back to Clinic-mode chrome. Part of the bug audit #5 fix.
// ProcessingPage itself has no route-specific behavior — it resolves the
// submission by id (ownership-scoped to every business this session can
// act on, regardless of URL prefix) and hands off to ProcessingScreen,
// which already detects Agency vs Clinic mode from the actual URL
// (usePathname) — so re-exporting the default export is enough, same
// pattern already used for /agency/checkout and /agency/pricing.
export { default } from "@/app/processing/[id]/page";
