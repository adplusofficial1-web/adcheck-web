import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set — DB calls will fail.");
}

export const sql = neon(process.env.DATABASE_URL || "");

// Demo tenant used throughout the app until real auth/session is wired up.
export const DEMO_BUSINESS_EMAIL = "contact@abc-clinic.com";

export async function getDemoBusiness() {
  const rows = await sql`
    SELECT b.*, p.name AS plan_name, p.code AS plan_code, p.price_thb, p.monthly_image_credits
    FROM businesses b
    LEFT JOIN plans p ON p.id = b.plan_id
    WHERE b.contact_email = ${DEMO_BUSINESS_EMAIL}
    LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}

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
