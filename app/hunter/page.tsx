import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
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
export default async function HunterFreelancerPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/hunter/login");
  }

  const hunterUser = await getCurrentHunterUser();
  if (!hunterUser) {
    // Signed in with Google, but not (or no longer) an active hunter_users
    // row — same "signed in but not authorized" treatment as
    // app/sales/page.tsx gives a non-whitelisted sales rep.
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-medium text-primary">ยังไม่ได้รับสิทธิ์เข้าใช้งาน</p>
          <p className="mt-2 text-sm text-secondary">
            บัญชี {session.user.email} ยังไม่อยู่ในรายชื่อ Hunter ที่แอดมินเพิ่มไว้ (หรือถูกปิดใช้งานอยู่) —
            ติดต่อทีม AD Plus หากคิดว่านี่เป็นความผิดพลาด
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
