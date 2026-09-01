import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { requestHunterAccess } from "@/lib/hunterUsers";
import { HunterShell } from "@/components/hunter/HunterShell";

// Hunter Freelancer Page — a completely separate area from
// /admin/marketing/hunter, built 2026-09-01 at the user's explicit request
// ("อยากให้แยกส่วนกันชัดเจน... เพราะเป็น Freelance คนนอกเท่านั้น"): the
// admin Hunter page has full queue-editing controls (Excel import, image
// URL entry, run/delete) AND the Sales overview section — none of that is
// appropriate to hand an external freelancer a login for. This route is
// its own small, read-only page (same "not shared with any other layout"
// pattern as app/sales/page.tsx — a Hunter freelancer is neither a
// platform admin nor a clinic/business account, so this never touches
// app/admin/layout.tsx or getCurrentBusiness()).
//
// CHANGE (Hunter Referral Commission, 2569-09-01): replaced the old
// single-table HunterFreelancerList with a multi-tab switcher — a Hunter
// now has a dashboard, a private working Pipeline, referral commission +
// payout settings, personal/tax details, and a help page, not just a
// read-only clinic list.
//
// CHANGE (2569-09-01, per user request "ปรับไปอยู่ด้านบน ไว้ตรง NAV"): the
// header + tab switcher (previously this file's own <header> plus a
// separate components/hunter/HunterTabs.tsx strip further down the page)
// are now one client component, components/hunter/HunterShell.tsx — see
// that file for why. This page stays a thin server component: check auth,
// look up the Hunter, hand the header info to HunterShell.
//
// CHANGE (Hunter Self-Serve Signup Request, 2569-09-01): previously a
// signed-in-but-not-whitelisted visitor just saw a flat "ยังไม่ได้รับสิทธิ์"
// message and the admin had to be told the email out-of-band before they
// could type it into the /admin/marketing/hunter whitelist form. Now this
// page itself records a pending hunter_users row (via
// lib/hunterUsers.ts:requestHunterAccess) the moment a signed-in Google
// account with no active row hits /hunter, so the admin can find + approve
// it on the existing roster (HunterUsersManager, same toggle button)
// without needing that out-of-band email first. Does NOT touch
// getCurrentHunterUser() itself or any other /hunter route — those still
// require an ACTIVE row exactly as before; this only changes what happens
// on this landing page while a request is pending.
export default async function HunterFreelancerPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/hunter/login");
  }

  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) {
    // Signed in with Google, but no active hunter_users row yet — either
    // this is their first-ever visit, or they already requested and are
    // still waiting on an admin, or an admin deactivated them. In every
    // case, (re-)recording the pending request is safe: requestHunterAccess
    // uses ON CONFLICT (email) DO NOTHING, so it never overwrites a row an
    // admin already approved (active=true) or deliberately turned off.
    const email = session.user.email.trim().toLowerCase();
    await requestHunterAccess(email, session.user.name);

    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-medium text-primary">คำขอเข้าใช้งานถูกส่งแล้ว</p>
          <p className="mt-2 text-sm text-secondary">
            บัญชี {session.user.email} ถูกบันทึกเป็นคำขอเข้าใช้งาน Hunter เรียบร้อยแล้ว
            ทีมงาน AD Plus จะตรวจสอบและเปิดสิทธิ์ให้เร็วที่สุด — กรุณาลองเข้าสู่ระบบอีกครั้งในภายหลัง
          </p>
        </div>
      </div>
    );
  }

  return (
    <HunterShell
      hunterUser={{ name: hunterUser.name, email: hunterUser.email, avatarUrl: hunterUser.avatar_url ?? null }}
    />
  );
}
