import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getBusinessByEmail, createBusinessForEmail } from "@/lib/db";
import { isSalesUserEmail } from "@/lib/salesLeads";
import { isActiveHunterUserEmail, isActiveHunterUserId } from "@/lib/hunterUsers";
import { isValidUuid } from "@/lib/validation";

// The single place every authenticated page/API route goes to find "whose
// data is this". Reads the signed-in Google account's email off the
// session and looks up (or lazily creates, on the very first call for a
// new email) its business row.
//
// FIX (bug audit, 2569-09-01): this comment used to say auth.ts's signIn
// callback "normally" creates the row eagerly, before this fallback path
// ever runs — that's inaccurate. auth.ts (see that file) only defines a
// `session` callback, no `signIn` callback, and grepping the repo confirms
// lib/db.ts:createBusinessForEmail is called from nowhere else. This
// function's own lazy-create branch below (which validates and applies
// hunter_ref, see that block) is the ONE AND ONLY place a business row is
// ever created — not a rare-case fallback. Correcting this here matters
// specifically because a reader who believed the old comment could
// reasonably conclude the Hunter Referral Commission attribution logic
// below rarely runs — it isn't a fallback path at all, it runs on every
// single first sign-in.
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
  //
  // Bug Audit 4 (2569-09-02): this used to block on the mere EXISTENCE of a
  // hunter_users row (active or not). Combined with self-serve Hunter
  // signup that meant any email that had ever opened /hunter — including a
  // clinic owner who was sent the wrong link — could never become a
  // customer, and an admin couldn't undo it (deactivating the Hunter row
  // didn't help). Now only an ACTIVE Hunter is blocked, so "ปิดใช้งาน" on
  // the admin Hunter list is the escape hatch.
  if (await isActiveHunterUserEmail(email)) return null;

  // Hunter Referral Commission (2569-09-01): the ONE moment this business
  // row will ever exist — see migrations/014_hunter_referral_commissions.sql
  // and lib/db.ts:createBusinessForEmail for why referred_by_hunter_user_id
  // is set here and never again. middleware.ts stashed the `ref` query
  // param from https://adcheck.pro/login?ref=<hunter_user_id> into this
  // cookie before the OAuth round trip; re-validated here (not trusted as
  // given) against an active hunter_users row, since a cookie is
  // client-controlled and the id could be stale, forged, or belong to a
  // since-deactivated Hunter.
  //
  // Bug Audit 4 (2569-09-02): the cookie value is user-controlled and used
  // to be passed straight into a `WHERE id = ${...}` on a uuid column — a
  // non-UUID value (`/login?ref=abc`, a truncated link) made Postgres throw
  // on this exact lazy-create branch, so a brand-new sign-up got a 500 on
  // every page for the cookie's 30-day lifetime. middleware.ts now refuses
  // to set the cookie for a non-UUID `ref` in the first place, and this
  // guard covers cookies set before that fix (or crafted by hand).
  const refCookie = (await cookies()).get("hunter_ref")?.value;
  let referredByHunterUserId: string | null = null;
  if (refCookie && isValidUuid(refCookie)) {
    try {
      if (await isActiveHunterUserId(refCookie)) referredByHunterUserId = refCookie;
    } catch (e) {
      // Attribution is a nice-to-have; creating the customer's business row
      // is not. Never let the referral lookup block sign-up.
      console.error("hunter_ref lookup failed; creating business without referral:", e);
    }
  }

  // First time we've seen this email — this call is what actually creates
  // the business row (see the corrected comment at the top of this file).
  return createBusinessForEmail(email, session?.user?.name, referredByHunterUserId);
}
