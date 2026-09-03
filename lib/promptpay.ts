// Dynamic PromptPay QR payload generator (EMV QR Code spec used by the
// Bank of Thailand / PromptPay -- TLV tags 00/01/29/53/54/58 + a CRC-16
// checksum in tag 63). Written as a small, dependency-free module rather
// than pulling in the `promptpay-qr` npm package: this project's whole
// payment stack (see lib/omise.ts) already keeps money-adjacent code in
// this repo where it's easy to read end-to-end, and a ~60-line TLV
// serializer + CRC-16/XMODEM implementation is simple enough that vendoring
// it (and being able to unit-verify the CRC against the standard
// "123456789" -> 0x31C3 test vector) is safer than trusting an unaudited
// third-party package with the string that tells every scanning bank app
// where the money goes.
//
// Interim measure (2569-09-03): ADCheck's own Omise merchant account isn't
// approved yet (min. 30-day review) -- see PAYMENT_MODE in
// lib/paymentMode.ts. Until Omise is live, every checkout renders a QR
// built from this module against AD Plus's own PromptPay-registered
// juristic Tax ID instead of a card/Omise flow. None of the Omise
// integration below or elsewhere in the repo is touched -- flipping
// PAYMENT_MODE back to "omise" once approved brings the original checkout
// back exactly as it was, no code changes needed.

// Tag-length-value serialization: each field is `${2-digit id}${2-digit
// length}${value}`, per the EMVCo QR Code spec.
function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

// CRC-16/XMODEM: poly 0x1021, init 0x0000, no input/output reflection, no
// final XOR -- the exact variant EMVCo's spec (and every PromptPay-scanning
// bank app) expects in tag 63. Verified against the standard test vector:
// crc16Xmodem("123456789") === 0x31c3.
function crc16Xmodem(input: string): number {
  let crc = 0x0000;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export type PromptPayTargetType = "MSISDN" | "NATID" | "EWALLETID";

// Accepts a mobile number (10 digits, starts with 0), a 13-digit Tax ID /
// national ID, or a 15-digit e-Wallet ID -- the three identifier types
// PromptPay supports. Anything else is a caller mistake, not a recoverable
// runtime state, so this throws rather than silently building a QR that
// would fail to scan.
function detectTargetType(rawTarget: string): { type: PromptPayTargetType; sanitized: string } {
  const digits = rawTarget.replace(/[^0-9]/g, "");
  if (/^0[0-9]{9}$/.test(digits)) return { type: "MSISDN", sanitized: digits };
  if (/^[0-9]{13}$/.test(digits)) return { type: "NATID", sanitized: digits };
  if (/^[0-9]{15}$/.test(digits)) return { type: "EWALLETID", sanitized: digits };
  throw new Error(`ไม่ใช่หมายเลข PromptPay ที่ถูกต้อง (เบอร์โทร 10 หลัก / เลขผู้เสียภาษี 13 หลัก / e-Wallet ID 15 หลัก): ${rawTarget}`);
}

const PROMPTPAY_AID = "A000000677010111";

// Builds a dynamic PromptPay QR payload (fixed amount baked in, so the
// customer's banking app fills the amount in for them and can't fat-finger
// it) for `target` (this business's PromptPay-registered Tax ID or phone
// number) and `amountThb`. The returned string is what gets encoded into
// the QR image (see app/checkout/page.tsx, which passes this through the
// `qrcode` package to render a PNG data URL) -- it is plain, non-secret
// text; nothing about generating or displaying it costs anything or calls
// any external, paid API. It is the exact same kind of code any bank's own
// PromptPay QR generator produces.
export function buildPromptPayQrPayload(target: string, amountThb: number): string {
  if (!(amountThb > 0)) {
    throw new Error("จำนวนเงินต้องมากกว่า 0");
  }
  const { type, sanitized } = detectTargetType(target);
  // MSISDN target: PromptPay wants the country-code form 0066xxxxxxxxx
  // (drop the leading 0, prefix 0066) rather than the local 0xxxxxxxxxx
  // form people actually type.
  const ppTarget = type === "MSISDN" ? "0066" + sanitized.slice(1) : sanitized;
  const merchantSubId = type === "MSISDN" ? "01" : type === "NATID" ? "02" : "03";

  const merchantAccountInfo = tlv("00", PROMPTPAY_AID) + tlv(merchantSubId, ppTarget);

  const fields = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", "12"), // Point of Initiation Method: 12 = dynamic (amount is fixed)
    tlv("29", merchantAccountInfo), // Merchant Account Information -- PromptPay
    tlv("53", "764"), // Transaction Currency: 764 = THB
    tlv("54", amountThb.toFixed(2)), // Transaction Amount
    tlv("58", "TH"), // Country Code
  ].join("");

  // The CRC covers everything including the "6304" tag/length prefix of
  // itself, per spec -- only the 4 checksum hex digits themselves are left
  // off before computing it.
  const withCrcPlaceholder = fields + "6304";
  const crc = crc16Xmodem(withCrcPlaceholder).toString(16).toUpperCase().padStart(4, "0");
  return withCrcPlaceholder + crc;
}
