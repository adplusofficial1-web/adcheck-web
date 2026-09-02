import { MarketingSubNav } from "@/components/admin/MarketingSubNav";
import { HunterPipelineOverview } from "@/components/admin/HunterPipelineOverview";
import { HunterMarketingTabs } from "@/components/admin/HunterMarketingTabs";

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
// ADDED (Hunter Referral Commission, 2569-09-01): HunterCommissionOverview
// — the admin-side payout queue (per-Hunter totals + mark-paid) — sits
// right below HunterUsersManager, same reasoning as the ordering above:
// an admin managing who's whitelisted and who's owed money shouldn't have
// to scroll past the clinic import queue to reach either.
//
// ADDED (Pipeline รวม, 2569-09-01, per user request): HunterPipelineOverview
// — a combined total of the 6 pipeline statuses across every Hunter (see
// lib/hunterPipeline.ts's getHunterPipelineOverview). Scoped by the user to
// just this summary row, not a per-Hunter table or a merged Kanban board —
// those stay private to each Hunter on /hunter.
//
// CHANGE (2026-09-02, Hunter tab restructure, per user request): this page
// used to stack SalesOverview, HunterUsersManager, HunterCommissionOverview
// and HunterImport directly on top of each other — one long scroll below
// the Pipeline summary. All four (Commission's payout-queue half split out
// into a 5th) now live inside HunterMarketingTabs as tabs instead —
// HunterPipelineOverview is the one exception, staying pinned above the
// tab bar since it's glance-level info relevant no matter which tab is
// open. See components/admin/HunterMarketingTabs.tsx for the tab list and
// the renamed labels.
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

      <HunterPipelineOverview />

      <div className="mt-10">
        <HunterMarketingTabs />
      </div>
    </div>
  );
}
