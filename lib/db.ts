import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set — DB calls will fail.");
}

// fetchOptions: { cache: "no-store" } stops Next.js's Data Cache from ever
// reusing a prior response for these queries. Without this, some server
// component render paths (e.g. a page rendered via Promise.all) can end up
// replaying the very first response forever instead of hitting the DB again
// on later requests — even with `export const dynamic = "force-dynamic"` on
// the page. This is Neon's documented fix for the App Router.
export const sql = neon(process.env.DATABASE_URL || "", {
    fetchOptions: { cache: "no-store" },
});

export async function getPlans() {
    const rows = await sql`SELECT * FROM plans ORDER BY price_thb ASC`;
    return rows as any[];
}

export async function getPaymentMethods(businessId: string) {
    const rows = await sql`
        SELECT id, brand, last4, exp_month, exp_year, is_default
            FROM payment_methods
                WHERE business_id = ${businessId}
                    ORDER BY is_default DESC, created_at ASC
                      `;
    return rows as any[];
}

// CHANGE (multi-package credits): a business can now hold several
// still-active package purchases at once (see migrations for
// business_packages, and app/api/checkout/route.ts which INSERTs a new
// row per purchase instead of overwriting a single plan). This business
// row's own `credits_remaining` column is now only the NON-expiring
// "legacy" balance (the free signup bonus, or whatever was left over from
// before this table existed) — the number every page/component actually
// wants to show is that plus every still-unexpired package's remaining
// credits. Centralizing that sum here means every caller that already
// reads `business.credits_remaining` (Nav badge, upload gating, the
// submissions credit check, …) keeps working unmodified and just sees the
// correct combined number, instead of every call site needing its own
// SUM query.
export async function withActivePackageCredits<T extends { id: string; credits_remaining: number }>(
    business: T
): Promise<T> {
    const [row] = (await sql`
        SELECT COALESCE(SUM(credits_remaining), 0)::int AS total
            FROM business_packages
                WHERE business_id = ${business.id} AND expires_at > now()
                  `) as any[];
    return { ...business, credits_remaining: business.credits_remaining + (row?.total ?? 0) };
}

// Added alongside Google Login (see /login, /auth.ts). Each business row
// maps 1:1 to the Google account that owns it (contact_email is UNIQUE) —
// see lib/currentBusiness.ts:getCurrentBusiness(), which every page/route
// calls to resolve "whose data is this" from the signed-in session.
export async function getBusinessByEmail(email: string) {
    const rows = await sql`
        SELECT b.*, p.name AS plan_name, p.code AS plan_code, p.price_thb, p.monthly_image_credits
            FROM businesses b
                LEFT JOIN plans p ON p.id = b.plan_id
                    WHERE b.contact_email = ${email}
                        LIMIT 1
                          `;
    const business = (rows[0] as any) ?? null;
    if (!business) return null;
    return withActivePackageCredits(business);
}

// Provisions a new business the moment a Google account is first seen —
// called from lib/currentBusiness.ts:getCurrentBusiness() when no existing
// row matches the session's email. `credits_remaining` is intentionally
// left out of the INSERT — the businesses table defaults it to 15, which is
// exactly the free-credit welcome bonus every new Google account should
// start with. ON CONFLICT DO NOTHING + the UNIQUE constraint on
// contact_email make this safe under concurrent calls (e.g. two tabs
// loading a protected page at once right after first sign-in) — at most
// one row (and one bonus) is ever created per email.
export async function createBusinessForEmail(email: string, name?: string | null) {
    await sql`
        INSERT INTO businesses (name, type, contact_email)
        VALUES (${name?.trim() || "คลินิกของฉัน"}, 'clinic', ${email})
        ON CONFLICT (contact_email) DO NOTHING
    `;
    return getBusinessByEmail(email);
}

// Resolves (lazily creating on first call) the single internal business row
// that automated, non-browser submissions -- currently just
// app/api/automation/check-ad/route.ts, the n8n-facing API-key-authenticated
// endpoint -- are attributed to and billed against. There is no Google
// account or session behind this row (unlike every other business, which is
// provisioned 1:1 with a signed-in email via createBusinessForEmail above),
// so it uses a fixed, non-guessable-in-practice sentinel contact_email
// instead of a real user's address, purely so the same UNIQUE(contact_email)
// + ON CONFLICT DO NOTHING + re-select pattern used above can be reused
// as-is instead of inventing a second provisioning strategy just for this
// one row.
//
// IMPORTANT: this is a REAL business row and draws from the SAME
// credits_remaining / business_packages accounting as every other clinic --
// it starts with nothing usable beyond the normal free signup bonus the
// businesses table defaults new rows to, which is not meant to sustain real
// automation volume. Someone must grant it an actual package/credits via
// the existing admin credit-grant flow (see app/api/admin/credits) after
// it's first created, or every /api/automation/check-ad call will fail
// reserveCredits() with the same 402 "insufficient credits" any ordinary
// business would get -- intentional, since it keeps automated traffic inside
// the exact same accounting the rest of the app already trusts, rather than
// carving out a free/unmetered side channel.
const AUTOMATION_BUSINESS_EMAIL = "automation@adcheck.pro";

export async function getOrCreateAutomationBusiness() {
    await sql`
        INSERT INTO businesses (name, type, contact_email)
        VALUES ('AdCheck Automation (Internal)', 'clinic', ${AUTOMATION_BUSINESS_EMAIL})
        ON CONFLICT (contact_email) DO NOTHING
    `;
    return getBusinessByEmail(AUTOMATION_BUSINESS_EMAIL);
}
