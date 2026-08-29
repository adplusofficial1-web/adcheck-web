export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ReportProblemForm } from "@/components/ReportProblemForm";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Standalone "รายงานปัญหาแบบละเอียด" page — linked from the small card in
// /settings (see components/settings/SettingsClient.tsx) rather than
// embedded inline there, so the checklist + per-item detail fields have
// room to breathe instead of competing with the rest of the settings form
// for space. Submissions land in the admin inbox at /admin/reports.
export default async function ReportProblemPage() {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login?callbackUrl=/report-problem");
  }

  return (
    <main>
      <Nav credits={business.credits_remaining} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/settings" className="text-sm text-accent hover:underline">
          ← กลับไปตั้งค่า
        </Link>
        <h1 className="text-2xl font-medium mt-3 mb-2">รายงานปัญหา</h1>
        <p className="text-sm text-secondary mb-8">
          เลือกหัวข้อปัญหาที่พบได้มากกว่า 1 ข้อ แล้วระบุรายละเอียดของแต่ละข้อ — ทีมงานจะได้เข้าใจปัญหาและแก้ไขได้ตรงจุด
        </p>
        <ReportProblemForm contactEmail={business.contact_email} />
      </div>
    </main>
  );
}
