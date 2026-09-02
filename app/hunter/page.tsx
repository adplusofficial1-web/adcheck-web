import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { autoRegisterHunterUser } from "@/lib/hunterUsers";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { isSalesUserEmail } from "@/lib/salesLeads";
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
// CHANGE (Hunter Self-Serve Auto-Registration, 2569-09-01): a
// signed-in-but-unknown Google account used to see a flat
// "ยังไม่ได้รับสิทธิ์" message, then (briefly, same day) a "pending —
// wait for admin approval" message. Per the site owner's EXPLICIT
// decision — made after being warned this means anyone with a Google
// account can reach clinic lead data and the commission/payout tabs — this
// is now instant: a brand-new email is auto-registered as active=true
// (lib/hunterUsers.ts:autoRegisterHunterUser) and dropped straight into
// <HunterShell> in the same request, no interstitial screen at all. See
// the project doc "Hunter Self-Serve Signup Request.md" for the full
// tradeoff writeup — do NOT reintroduce a pending/approval gate here
// without re-reading that context and re-confirming with the site owner.
//
// The ONE case that still blocks access below: autoRegisterHunterUser
// returning a row with active=false. That can only happen when the row
// already existed (ON CONFLICT DO NOTHING skipped the insert) and was
// already inactive — i.e. an admin explicitly deactivated this person.
// That must NOT be silently overridden, or admin deactivation would be
// meaningless (a banned Hunter could just sign out and back in). This is
// the only path left that still shows an access-denied-style message.
//
// CHANGE (Bug Audit 4, 2569-09-02): two refinements that keep the instant
// self-serve decision above intact —
//   1. A platform admin (ADMIN_EMAILS) or a sales rep (sales_users) who
//      opens /hunter with no hunter_users row is NOT auto-registered.
//      Before this, an admin merely visiting the page created a Hunter row
//      for their own account, which then started receiving clinic leads
//      from the automatic picker and became eligible for referral
//      commission on their own staff account. They get a clear notice
//      instead. An admin who genuinely wants a Hunter row for an email can
//      still add it from /admin/marketing/hunter.
//   2. A self-registered row is created with assignment_approved=false
//      (lib/hunterUsers.ts:autoRegisterHunterUser) — access is still
//      instant, but admin-"ส่ง" leads only start flowing after an admin
//      approves them. HunterOverviewTab shows a notice until then.
export default async function HunterFreelancerPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/hunter/login");
  }

  let hunterUser = await getCurrentHunterUser();
  if (!hunterUser) {
    const email = session.user.email.trim().toLowerCase();

    const [adminEmail, isSales] = await Promise.all([getCurrentPlatformAdminEmail(), isSalesUserEmail(email)]);
    if (adminEmail || isSales) {
      return (
        <div className="min-h-screen bg-page flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-lg font-medium text-primary">บัญชีนี้ใช้เป็น Hunter ไม่ได้</p>
            <p className="mt-2 text-sm text-secondary">
              บัญชี {session.user.email} เป็นบัญชี{adminEmail ? "แอดมิน" : "เซลล์"}ของ AD Plus ไม่สามารถใช้เป็น Hunter ได้ —
              หากต้องการทดลองใช้หน้า Hunter ให้ล็อกอินด้วยบัญชี Google อื่น
            </p>
          </div>
        </div>
      );
    }

    const registered = await autoRegisterHunterUser(email, session.user.name);

    if (!registered.active) {
      // Pre-existing row, and it's inactive — an admin deactivated this
      // person on purpose. Do NOT auto-grant access.
      return (
        <div className="min-h-screen bg-page flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-lg font-medium text-primary">ยังไม่ได้รับสิทธิ์เข้าใช้งาน</p>
            <p className="mt-2 text-sm text-secondary">
              บัญชี {session.user.email} ถูกปิดใช้งานโดยแอดมิน — ติดต่อทีม AD Plus หากต้องการเปิดสิทธิ์อีกครั้ง
            </p>
          </div>
        </div>
      );
    }

    // Freshly auto-created and active — authorize immediately, no
    // interstitial screen.
    hunterUser = registered;
  }

  return (
    <HunterShell
      hunterUser={{ name: hunterUser.name, email: hunterUser.email, avatarUrl: hunterUser.avatar_url ?? null }}
    />
  );
}
