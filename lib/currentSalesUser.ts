import { auth } from "@/auth";
import { getActiveSalesUserByEmail } from "@/lib/salesLeads";

// The single place every /sales page/route goes to find "which sales rep
// is this" — mirrors lib/currentBusiness.ts's getCurrentBusiness() and
// lib/platformAdmin.ts's getCurrentPlatformAdminEmail() in spirit (read
// the signed-in Google account's email off the session, look it up), but
// deliberately does NOT auto-create anything the way getCurrentBusiness()
// does: a sales rep must already exist as an active sales_users row, added
// by a platform admin from the Hunter page's "เซลล์ & การกระจาย Lead"
// section (see lib/salesLeads.ts:createSalesUser). No match — including an
// email that was deactivated — returns null exactly the same as "never
// whitelisted at all", so a deactivated rep is locked out on their very
// next request. This hits the DB fresh every call rather than trusting a
// role claim cached on the session/JWT, same trade-off
// lib/platformAdmin.ts makes and for the same reason: correctness the
// instant an admin flips active off beats saving one DB round-trip.
//
// Returns null when there's no signed-in session at all — callers decide
// what to do with that (redirect to /sales/login from a page, 401 from an
// API route), same contract as getCurrentBusiness().
export async function getCurrentSalesUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return getActiveSalesUserByEmail(email.trim().toLowerCase());
}
