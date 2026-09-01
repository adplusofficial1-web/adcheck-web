import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentHunterUser } from "@/lib/currentHunterUser";
import { HunterFreelancerList } from "@/components/hunter/HunterFreelancerList";

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
    <div className="min-h-screen bg-page">
      <header className="bg-inverse text-onInverse px-6 md:px-14 py-5">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-medium">ADCheck</span>
            <span className="rounded-pill bg-white/10 border border-onInverse/30 px-3 py-1 text-xs">Hunter</span>
          </div>
          <span className="text-sm text-onInverse/70">
            {hunterUser.name} · {hunterUser.email}
          </span>
        </div>
      </header>
      <main className="px-6 md:px-14 py-10 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-medium text-primary">รายชื่อคลินิก</h1>
          <p className="mt-2 text-sm text-secondary max-w-2xl">
            กดชื่อคลินิกเพื่อเปิดลิงก์เพจ และกด &quot;ผลตรวจสอบ&quot; เพื่อคัดลอกลิงก์ผลตรวจสอบที่พร้อมใช้งานทันที
          </p>
        </div>
        <div className="mt-6">
          <HunterFreelancerList />
        </div>
      </main>
    </div>
  );
}
