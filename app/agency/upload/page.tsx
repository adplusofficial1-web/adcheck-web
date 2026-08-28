export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UploadForm } from "@/app/upload/UploadForm";
import { Nav } from "@/components/Nav";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner, hasActiveAgencyPlan } from "@/lib/agency";
import { MAX_UPLOAD_IMAGES } from "@/lib/uploadLimits";

// Agency-mode twin of app/upload/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check (isAgency =
// pathname?.startsWith("/agency")) renders Agency-mode chrome instead of
// Clinic-mode chrome. Reuses the same UploadForm component; the only real
// difference from app/upload/page.tsx is that ?business= is REQUIRED here
// (Agency mode has no "own" upload target — every upload from this route
// is on behalf of a specific child clinic), whereas on /upload it's
// optional and defaults to the signed-in account itself.
export default async function AgencyUploadPage({
  searchParams,
}: {
  searchParams: { business?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  if (!searchParams.business) {
    notFound();
  }
  // Ownership-checked the same way checkout and the submissions API are —
  // see lib/agency.ts:getBusinessByIdForOwner.
  const target = await getBusinessByIdForOwner(searchParams.business, business.id);
  if (!target) {
    notFound();
  }

  // Uploading on behalf of a child clinic requires the signed-in agency
  // account's own plan to be an active code='agency' package — see
  // lib/agency.ts:hasActiveAgencyPlan. This mirrors the same check in
  // app/api/submissions/route.ts (that one is what actually blocks a
  // bypass via direct POST); this one keeps someone from even seeing a
  // working-looking upload form here if they got to this URL directly
  // (e.g. a bookmarked link) instead of via a disabled dashboard button.
  const agencyPlanBlocked = !(await hasActiveAgencyPlan(business));

  return (
    <main>
      <Nav credits={business.credits_remaining ?? 0} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">อัปโหลดภาพโฆษณา</h1>
        {!agencyPlanBlocked && (
          <p className="text-sm text-secondary mb-2">
            กำลังอัปโหลดให้ <span className="font-medium text-primary">{target.name}</span> ในเครือข่ายของคุณ —
            ใช้เครดิตรวมจากแพ็กเกจ Agency ของคุณ
          </p>
        )}
        {agencyPlanBlocked ? (
          <div className="rounded-lg border border-warning bg-warningSoft p-5 mt-6">
            <p className="text-sm font-medium mb-1">
              ต้องสมัครแพ็กเกจ Agency ก่อนอัปโหลดให้คลินิกในเครือข่าย
            </p>
            <p className="text-sm text-secondary mb-4">
              บัญชีของคุณยังไม่ได้สมัคร หรือแพ็กเกจ Agency (หลายสาขา) หมดอายุแล้ว — สมัครหรือต่ออายุเพื่อปลดล็อกการ
              อัปโหลดให้ทุกคลินิกในเครือข่ายนี้อีกครั้ง
            </p>
            <Link
              href="/agency/checkout?plan=agency"
              className="inline-block rounded-md bg-inverse text-onInverse px-4 py-2 text-sm font-medium"
            >
              สมัคร/ต่ออายุแพ็กเกจ Agency →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-secondary mb-8">
              เลือกได้สูงสุด {MAX_UPLOAD_IMAGES} ภาพต่อครั้ง รองรับ JPG, PNG, PDF ไม่เกิน 10MB ต่อไฟล์
            </p>
            <UploadForm creditsRemaining={business.credits_remaining ?? 0} businessId={target.id} />
          </>
        )}
      </div>
    </main>
  );
}
