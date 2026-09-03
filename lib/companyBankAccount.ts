// AD Plus's own bank account / PromptPay details for the interim manual QR
// checkout (2569-09-03) -- see lib/paymentMode.ts. Not secret: this is
// exactly what gets shown on the checkout page for a customer to pay into,
// same as any bank's own PromptPay QR poster in a shop. Kept as one small
// constants module (not env vars) since, unlike OMISE_SECRET_KEY, there is
// no confidentiality reason to keep it out of the repo, and a company
// changing bank accounts is rare enough that a one-line code change +
// deploy is simpler than another Render env var to keep track of.
export const COMPANY_BANK_ACCOUNT = {
  bankName: "ธนาคารกสิกรไทย",
  accountNumber: "198-8-67285-4",
  accountName: "บจก. แอดพลัส แอดเวอร์ไทซิ่ง",
  // 13-digit juristic Tax ID, registered for PromptPay against the account
  // above -- the identifier lib/promptpay.ts encodes into the dynamic QR.
  promptPayTaxId: "0105567141491",
} as const;
