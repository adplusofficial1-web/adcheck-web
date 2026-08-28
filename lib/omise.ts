import Omise from "omise";

// Server-only wrapper around the official Omise Node SDK. Never import this
// from a "use client" component — OMISE_SECRET_KEY must never reach the
// browser. The browser only ever talks to Omise.js directly (loaded in
// app/checkout/CheckoutForm.tsx with NEXT_PUBLIC_OMISE_PUBLIC_KEY) to turn a
// raw card number into a one-time token — our server never sees the PAN,
// which is what keeps this integration inside PCI-DSS SAQ A instead of the
// much heavier SAQ D.

let client: ReturnType<typeof Omise> | null = null;

// Both keys are required: the secret key to actually call Omise's API here,
// and the public key so the client can tokenize a card at all. If either is
// missing, every payment code path must behave exactly like the old
// PAYMENT_GATEWAY_ENABLED = false — checkout stays visibly disabled instead
// of half-working.
export function isOmiseConfigured(): boolean {
  return Boolean(process.env.OMISE_SECRET_KEY && process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY);
}

function getClient() {
  if (!process.env.OMISE_SECRET_KEY) {
    throw new Error("OMISE_SECRET_KEY is not set");
  }
  if (!client) {
    client = Omise({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
      secretKey: process.env.OMISE_SECRET_KEY,
    });
  }
  return client;
}

export interface BoundCard {
  omiseCustomerId: string;
  omiseCardId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

// Turns a one-time Omise.js card token into a persistent Customer + Card on
// Omise's side, so later charges (the recurring cron run, a retry) never
// need the customer to re-enter their card. Per Omise's docs this is the
// only way to charge the same card more than once — a bare token charges
// once and is then burned.
export async function createCustomerWithCard(token: string, email?: string): Promise<BoundCard> {
  const omise = getClient();
  const customer = await omise.customers.create({ email, card: token });
  const card =
    customer.cards.data.find((c) => c.id === customer.default_card) ?? customer.cards.data[0];
  if (!card) {
    throw new Error("Omise ไม่ได้ส่งข้อมูลบัตรกลับมา กรุณาลองใหม่อีกครั้ง");
  }
  return {
    omiseCustomerId: customer.id,
    omiseCardId: card.id,
    brand: card.brand,
    last4: card.last_digits,
    expMonth: card.expiration_month,
    expYear: card.expiration_year,
  };
}

export interface ChargeResult {
  success: boolean;
  /** Set when the issuing bank requires a 3-D Secure step-up before the
   *  charge can complete — the caller must redirect the browser here. The
   *  charge itself stays "pending" until the webhook confirms the result. */
  pending3ds?: string;
  chargeId?: string;
  failureCode?: string;
  failureMessage?: string;
}

// indicator distinguishes a Customer-Initiated Transaction (the customer is
// actively in the checkout flow right now — first bind + first charge) from
// a Merchant-Initiated Transaction (the monthly cron charging a card with no
// customer present). Card networks require this flag to be accurate — it's
// what lets a card recognize a recurring charge as legitimate instead of an
// unrecognized/fraudulent one, and is required for the 3-D Secure exemption
// that lets MIT charges go through without the customer being there to
// authenticate.
export async function chargeCustomer(
  omiseCustomerId: string,
  omiseCardId: string,
  amountThb: number,
  opts: { description: string; indicator: "CIT" | "MIT"; metadata?: Record<string, string> }
): Promise<ChargeResult> {
  const omise = getClient();
  const charge = await omise.charges.create({
    amount: Math.round(amountThb * 100), // THB -> satang
    currency: "thb",
    customer: omiseCustomerId,
    card: omiseCardId,
    description: opts.description,
    transaction_indicator: opts.indicator,
    recurring_reason: opts.indicator === "MIT" ? "subscription" : undefined,
    metadata: opts.metadata,
  });

  if (charge.authorize_uri) {
    return { success: false, pending3ds: charge.authorize_uri, chargeId: charge.id };
  }
  if (charge.status === "successful" || charge.paid) {
    return { success: true, chargeId: charge.id };
  }
  return {
    success: false,
    chargeId: charge.id,
    failureCode: charge.failure_code ?? undefined,
    failureMessage: charge.failure_message ?? undefined,
  };
}

// Used by the webhook handler to get the authoritative status of a charge
// instead of trusting the webhook POST body's fields directly — Omise
// webhooks aren't HMAC-signed, so the safe pattern is: take only the charge
// id out of the webhook payload, then ask Omise's API (with our own secret
// key) what that charge's real status is, and act on that response only.
export async function retrieveCharge(chargeId: string) {
  const omise = getClient();
  return omise.charges.retrieve(chargeId);
}
