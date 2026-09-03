// Payment mode switch (2569-09-03): ADCheck's Omise merchant account is not
// approved yet -- Omise's own review takes a minimum of ~30 days -- but the
// business needs to be able to sell packages before that clears. Rather
// than deleting/rewriting the existing card/Omise checkout (app/checkout/
// CheckoutForm.tsx, lib/omise.ts, app/api/billing/card/route.ts, app/api/
// webhooks/omise/route.ts, scripts/runAutoBilling.ts), this is a single
// env-driven toggle: while PAYMENT_MODE is unset or "qr" (the default),
// every checkout page renders the QR PromptPay + bank-transfer flow
// (app/checkout/QrCheckoutForm.tsx) instead. The moment Omise approves the
// account, set PAYMENT_MODE=omise on Render and redeploy (no code change)
// to bring the original card/Omise checkout straight back exactly as it
// was built.
export type PaymentMode = "qr" | "omise";

export function getPaymentMode(): PaymentMode {
  return process.env.PAYMENT_MODE === "omise" ? "omise" : "qr";
}

export function isQrPaymentMode(): boolean {
  return getPaymentMode() === "qr";
}
