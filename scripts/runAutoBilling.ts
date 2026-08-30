// Recurring auto-billing job. Meant to run as a Render Cron Job (see
// "cron:billing" in package.json), NOT as a route the browser can hit —
// there is no HTTP entry point here at all, only a script that talks
// straight to the DB and to Omise using the same server-side lib modules
// the app uses (relative imports, not the "@/..." alias, since this file
// runs outside Next's module resolution via tsx).
//
// Every charge here is a Merchant-Initiated Transaction (MIT) — the
// customer is not present, which is exactly the point of "auto-renew".
// This mirrors the successful-charge bookkeeping in
// app/api/billing/card/route.ts (insert transactions + business_packages,
// push credits_reset_at forward 30 days) so a renewed business looks
// identical in the DB to one who just paid manually.
import { sql } from "../lib/db";
import { isOmiseConfigured, chargeCustomer } from "../lib/omise";
import { nextInvoiceNumber } from "../lib/invoiceNumber";

const MAX_RETRIES = 3;

// FIX (bug audit round 3, high — confirmed live): this used to build the
// invoice number as `INV-2569-${Math.floor(Math.random() * 9000 + 1000)}` —
// a 4-digit random suffix into a UNIQUE column with no retry logic. Worse
// here than anywhere else it was used: this loop has no try/catch, so a
// collision on one business's INSERT throws and kills the whole cron run
// mid-loop — which also skips that business's `credits_reset_at` advance
// (the UPDATE right after the INSERT never runs), so the *next* run still
// sees it as due and charges it again. A real double-charge path, not just
// a missing record. See lib/invoiceNumber.ts for the sequence-based fix.

async function main() {
  if (!isOmiseConfigured()) {
    // Safe no-op until OMISE_SECRET_KEY + NEXT_PUBLIC_OMISE_PUBLIC_KEY are
    // set on this Cron Job's own environment (Render Cron Jobs have their
    // own env config, separate from the web service — both need the same
    // keys). This is intentional: the job can be created and scheduled
    // ahead of time without any risk of running before it's ready.
    console.log("[auto-billing] Omise not configured yet — skipping run.");
    return;
  }

  const due = (await sql`
    SELECT b.*, p.price_thb, p.monthly_image_credits, p.name AS plan_name
    FROM businesses b
    JOIN plans p ON p.id = b.plan_id
    WHERE b.auto_renew_enabled = true
      AND b.credits_reset_at IS NOT NULL
      AND b.credits_reset_at <= now()
  `) as any[];

  console.log(`[auto-billing] ${due.length} business(es) due for renewal`);

  for (const biz of due) {
    const [card] = (await sql`
      SELECT * FROM payment_methods WHERE business_id = ${biz.id} AND is_default = true LIMIT 1
    `) as any[];

    if (!card?.omise_customer_id || !card?.omise_card_id) {
      console.log(`[auto-billing] ${biz.id} has auto_renew on but no bound card — disabling auto_renew`);
      await sql`UPDATE businesses SET auto_renew_enabled = false, updated_at = now() WHERE id = ${biz.id}`;
      continue;
    }

    const result = await chargeCustomer(card.omise_customer_id, card.omise_card_id, Number(biz.price_thb), {
      description: `AdCheck ${biz.plan_name} — ต่ออายุอัตโนมัติ`,
      indicator: "MIT",
      metadata: { business_id: biz.id, plan_id: biz.plan_id },
    });

    if (result.success) {
      const invoiceNumber = await nextInvoiceNumber();
      const [transaction] = (await sql`
        INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number, omise_charge_id)
        VALUES (${biz.id}, ${biz.plan_id}, ${biz.price_thb}, 0, ${biz.price_thb}, 'บัตรเครดิต/เดบิต', 'สำเร็จ', ${invoiceNumber}, ${result.chargeId})
        ON CONFLICT (omise_charge_id) DO NOTHING
        RETURNING id
      `) as any[];

      if (transaction) {
        await sql`
          INSERT INTO business_packages (business_id, plan_id, transaction_id, credits_granted, credits_remaining, purchased_at, expires_at)
          VALUES (${biz.id}, ${biz.plan_id}, ${transaction.id}, ${biz.monthly_image_credits}, ${biz.monthly_image_credits}, now(), now() + interval '30 days')
        `;
      }
      await sql`
        UPDATE businesses
        SET credits_reset_at = now() + interval '30 days', billing_retry_count = 0, updated_at = now()
        WHERE id = ${biz.id}
      `;
      console.log(`[auto-billing] ${biz.id} charged successfully (${result.chargeId})`);
    } else {
      // Record the failed attempt for the transactions history even though
      // no credits are granted — same as any other declined charge would
      // show up on /settings.
      const invoiceNumber = await nextInvoiceNumber();
      await sql`
        INSERT INTO transactions (business_id, plan_id, amount_thb, fee_thb, net_thb, channel, status, invoice_number, omise_charge_id)
        VALUES (${biz.id}, ${biz.plan_id}, ${biz.price_thb}, 0, ${biz.price_thb}, 'บัตรเครดิต/เดบิต', 'ล้มเหลว', ${invoiceNumber}, ${result.chargeId ?? null})
        ON CONFLICT (omise_charge_id) DO NOTHING
      `;

      const retries = (biz.billing_retry_count ?? 0) + 1;
      if (retries >= MAX_RETRIES) {
        await sql`
          UPDATE businesses
          SET auto_renew_enabled = false, billing_retry_count = ${retries}, updated_at = now()
          WHERE id = ${biz.id}
        `;
        console.log(
          `[auto-billing] ${biz.id} failed ${retries} times — auto_renew disabled. ${result.failureMessage ?? ""}`
        );
      } else {
        // Retry tomorrow rather than waiting a full 30-day cycle again —
        // push credits_reset_at forward by 1 day so the next cron run
        // picks this business back up.
        await sql`
          UPDATE businesses
          SET billing_retry_count = ${retries}, credits_reset_at = now() + interval '1 day', updated_at = now()
          WHERE id = ${biz.id}
        `;
        console.log(
          `[auto-billing] ${biz.id} charge failed (attempt ${retries}/${MAX_RETRIES}) — retrying tomorrow. ${
            result.failureMessage ?? ""
          }`
        );
      }
    }
  }

  console.log("[auto-billing] run complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[auto-billing] fatal error:", err);
    process.exit(1);
  });
