import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getBusinessByEmail, createBusinessForEmail } from "@/lib/db";
import { isSalesUserEmail, getActiveSalesUserById } from "@/lib/salesLeads";
import { isHunterUserEmail, getActiveHunterUserById } from "@/lib/hunterUsers";

// The single place every authenticated page/API route goes to find "whose
// data is this". Reads the signed-in Google account's email off the
// session and looks up (or, as a safety net, lazily creates) its business
// row — see auth.ts's signIn callback for the normal, eager creation path,
// and lib/db.ts:createBusinessForEmail for why calling both is safe.
//
// Returns null when there's no signed-in session at all — callers decide
// what to do with that (redirect to /login from a page, 401 from an API
// route). It intentionally does NOT throw, so a plain `if (!business)`
// check is enough everywhere this is used.
export async function getCurrentBusiness() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const existing = await getBusinessByEmail(email);
  if (existing) return existing;

  // Sales Lead Distribution (2026-09-01): a sales rep's Google account
  // must never get lazily turned into a customer/business row just
  // because they (or a link they clicked) landed on a clinic-facing page
  // while signed in — see lib/currentSalesUser.ts, the real "whose data
  // is this" lookup for the separate /sales area. Checked here (not only
  // in currentSalesUser.ts) so the guard holds no matter which page
  // triggers the very first lookup for that email.
  if (await isSalesUserEmail(email)) return null;

  // Hunter Freelancer Page (2026-09-01): same guard, same reasoning, for
  // the separate /hunter area's whitelist — see lib/currentHunterUser.ts.
  // A Hunter freelancer's Google account must never become a customer
  // business either.
  if (await isHunterUserEmail(email)) return null;

  // Sales Commission (2026-09-01): a signup that arrived via a sales rep's
  // referral link (/login?ref=<sales_user_id>, see app/login/page.tsx)
  // carries a short-lived "sales_ref" cookie set right before the Google
  // OAuth round trip. Read it here — the one moment a business row is
  // actually created — and validate it against active sales_users so an
  // expired/forged/deactivated id never gets attributed. See
  // lib/db.ts:createBusinessForEmail and migrations/012_sales_commissions.sql
  // for what this attribution is used for. Never re-checked after this —
  // attribution is permanent from the moment of signup.
  const salesRefId = cookies().get("sales_ref")?.value;
  const referredBySales = salesRefId ? await getActiveSalesUserById(salesRefId) : null;

  // Hunter Commission (2026-09-01): same mechanism as Sales Commission
  // above, for a Hunter freelancer's referral link
  // (/login?hunterRef=<hunter_user_id>) and its "hunter_ref" cookie — see
  // migrations/013_hunter_commissions.sql. Independent of the sales_ref
  // check above: a signup can carry neither, either, or (rare edge case,
  // if someone clicked both links) both cookies at once.
  const hunterRefId = cookies().get("hunter_ref")?.value;
  const referredByHunter = hunterRefId ? await getActiveHunterUserById(hunterRefId) : null;

  // First time we've seen this email — normally auth.ts's signIn callback
  // already created the row before the session existed at all, so this is
  // just a fallback for the rare case that step didn't run.
  return createBusinessForEmail(
    email,
    session?.user?.name,
    referredBySales?.id ?? null,
    referredByHunter?.id ?? null
  );
}
