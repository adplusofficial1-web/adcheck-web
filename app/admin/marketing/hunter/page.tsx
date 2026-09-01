import { HunterImport } from "@/components/admin/HunterImport";
import { MarketingSubNav } from "@/components/admin/MarketingSubNav";
import { SalesOverview } from "@/components/admin/SalesOverview";

// Admin > Marketing > Hunter — see components/admin/HunterImport.tsx for
// the full writeup. Kept as a route sibling of /admin/marketing (not a
// replacement for it) so the existing association-outreach tracker there
// stays untouched.
//
// ADDED (Sales Lead Distribution, 2026-09-01): the "เซลล์ & การกระจาย Lead"
// section below HunterImport — see components/admin/SalesOverview.tsx.
// Kept on this same page (not a new route) per the design doc, so an admin
// watching Hunter's queue and watching sales activity is one page, not two
// tabs to flip between.
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

      <div className="mt-2">
        <HunterImport />
      </div>

      <SalesOverview />
    </div>
  );
}
