import { auth } from "@/auth";
import { getActiveHunterUserByEmail } from "@/lib/hunterUsers";

// The single place every /hunter page/route goes to find "is this an
// authorized Hunter freelancer" — mirrors lib/currentSalesUser.ts exactly
// (read the signed-in Google account's email off the session, look it up
// against the admin-managed whitelist, hit the DB fresh every call rather
// than trusting a cached role claim so a deactivated freelancer is locked
// out on their very next request). Does NOT auto-create anything — a
// Hunter freelancer must already exist as an active hunter_users row,
// added by a platform admin from /admin/marketing/hunter (see
// lib/hunterUsers.ts:createHunterUser).
//
// Returns null when there's no signed-in session at all — callers decide
// what to do with that (redirect to /hunter/login from a page, 403 from
// an API route), same contract as getCurrentSalesUser/getCurrentBusiness.
export async function getCurrentHunterUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return getActiveHunterUserByEmail(email.trim().toLowerCase());
}
