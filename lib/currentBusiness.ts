import { auth } from "@/auth";
import { getBusinessByEmail, createBusinessForEmail } from "@/lib/db";
import { isSalesUserEmail } from "@/lib/salesLeads";

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

  // First time we've seen this email — normally auth.ts's signIn callback
  // already created the row before the session existed at all, so this is
  // just a fallback for the rare case that step didn't run.
  return createBusinessForEmail(email, session?.user?.name);
}
