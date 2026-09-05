// Thin wrapper around gtag so every call site doesn't need to re-check
// that GA4 (see app/layout.tsx) has actually loaded before dataLayer
// exists on window. Safe to call from anywhere, including before the
// GA4 script tag has finished loading (dataLayer.push queues events
// gtag.js picks up once it's ready) and during SSR (no-ops, window is
// undefined on the server).
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== "function") return;
  w.gtag("event", name, params);
}
