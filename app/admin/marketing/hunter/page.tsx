import { HunterImport } from "@/components/admin/HunterImport";
import { MarketingSubNav } from "@/components/admin/MarketingSubNav";
import { SalesOverview } from "@/components/admin/SalesOverview";
import { HunterUsersManager } from "@/components/admin/HunterUsersManager";

// Admin > Marketing > Hunter — see components/admin/HunterImport.tsx for
// the full writeup. Kept as a route sibling of /admin/marketing (not a
// replacement for it) so the existing association-outreach tracker there
// stays untouched.
//
// ADDED (Sales Lead Distribution, 2026-09-01): the "เซลล์ & การกระจาย Lead"
// section — see components/admin/SalesOverview.tsx. Kept on this same page
// (not a new route) per the design doc, so an admin watching Hunter's queue
// and watching sales activity is one page, not two tabs to flip between.
//
// ADDED (Hunter Freelancer Page, 2026-09-01): this admin page (full
// editing controls: Excel import, image URLs, run/delete, plus the Sales
// section) stays platform-admin-only — per explicit user request, the
// external Hunter freelancers now get their OWN separate, read-only page at
// /hunter instead of ever touching this one. HunterUsersManager is just the
// admin-side whitelist control for who can sign into that separate page —
// it does not render any of /hunter's own content here. See
// app/hunter/page.tsx and the project doc "Hunter Freelancer Page -
// Design.md".
//
// CHANGE (2026-09-01, per user request): SalesOverview + HunterUsersManager
// moved ABOVE HunterImport (which has a long, scrollable per-clinic table —
// 50+ rows in practice) — an admin adding/disabling a sales rep or Hunter
// freelancer used to have to scroll past the entire clinic queue to reach
// those forms every time.
export default function MarketingHunterPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-medium text-primary">Marketing — Hunter</h1>
        <p className="mt-2 text-sm text-secondary max-w-2xl">
          Hunter อัปโหลดรายชื่อคลินิกเป็นไฟล์ Excel ระบบจับคอลัมน์ชื่อคลินิก/จังหวัด/ลิงก์อัตโนมัติ แล้วนำเข้าคิว
          &quot;รอ Hunter ดึงรูป&quot; ให้ Hunter ตามไปดึงรูป 3 รูปต่อคลินิกและส่งต่อให้ QC ตรวจสอบผ่าน adcheck.pro จริง
        </p>
      </div>

      <div className="mt-6">
        <MarketingSubNav />
      </div>

      <SalesOverview />

      <HunterUsersManager />

      <div className="mt-10">
        <HunterImport />
      </div>
    </div>
  );
}
