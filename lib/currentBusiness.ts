import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getBusinessByEmail, createBusinessForEmail } from "@/lib/db";
import { isSalesUserEmail } from "@/lib/salesLeads";
import { isHunterUserEmail, isActiveHunterUserId } from "@/lib/hunterUsers";

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

  // Hunter Referral Commission (2569-09-01): the ONE moment this business
  // row will ever exist — see migrations/014_hunter_referral_commissions.sql
  // and lib/db.ts:createBusinessForEmail for why referred_by_hunter_user_id
  // is set here and never again. middleware.ts stashed the `ref` query
  // param from https://adcheck.pro/login?ref=<hunter_user_id> into this
  // cookie before the OAuth round trip; re-validated here (not trusted as
  // given) against an active hunter_users row, since a cookie is
  // client-controlled and the id could be stale, forged, or belong to a
  // since-deactivated Hunter.
  const refCookie = (await cookies()).get("hunter_ref")?.value;
  const referredByHunterUserId =
    refCookie && (await isActiveHunterUserId(refCookie)) ? refCookie : null;

  // First time we've seen this email — normally auth.ts's signIn callback
  // already created the row before the session existed at all, so this is
  // just a fallback for the rare case that step didn't run.
  return createBusinessForEmail(email, session?.user?.name, referredByHunterUserId);
}
