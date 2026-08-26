import { auth } from "@/auth";

// Gate for the platform-level Admin area (app/admin/**) that manages the
// legal knowledge base — this is AD Plus's own internal staff area, NOT
// the per-clinic `users.role = 'admin'/'staff'` distinction used elsewhere
// in the app (that one scopes a clinic team member's permissions *within
// their own clinic's* businesses row; this one is "can this Google account
// touch AdCheck's shared compliance knowledge base at all").
//
// Deliberately kept as a flat email allowlist instead of a new DB
// table/role: the set of people who should be able to edit the legal
// knowledge base is small (AD Plus staff), changes rarely, and a wrong
// entry here is a one-line env var fix on Render rather than a migration.
// Revisit if this ever needs to support many admins or per-admin audit
// trails beyond what created_by on compliance_rules already gives.
//
// Set ADMIN_EMAILS on Render as a comma-separated list, e.g.:
//   ADMIN_EMAILS=adplusofficial1@gmail.com,someone-else@adplus.co
function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getCurrentPlatformAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const allowlist = adminEmailAllowlist();
  if (allowlist.length === 0) {
    // Fail closed, not open — an unset env var must never accidentally
    // expose the knowledge base editor to every signed-in clinic account.
    console.warn("ADMIN_EMAILS is not set — platform Admin area is inaccessible to everyone until it is.");
    return null;
  }
  return allowlist.includes(email) ? email : null;
}

export async function requirePlatformAdmin(): Promise<string> {
  const email = await getCurrentPlatformAdminEmail();
  if (!email) throw new PlatformAdminError();
  return email;
}

export class PlatformAdminError extends Error {
  constructor() {
    super("Not authorized: platform admin only");
  }
}
