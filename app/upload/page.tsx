export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UploadForm } from "./UploadForm";
import { Nav } from "@/components/Nav";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner, hasActiveAgencyPlan } from "@/lib/agency";
import { MAX_UPLOAD_IMAGES } from "@/lib/uploadLimits";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: { business?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }

  // ?business=<id> is how an Agency dashboard/clinic card sends someone
  // here to upload against a specific clinic's credits instead of the
  // signed-in account's own — ownership-checked the same way checkout and
  // the submissions API are (see lib/agency.ts:getBusinessByIdForOwner).
  const target = searchParams.business
    ? await getBusinessByIdForOwner(searchParams.business, business.id)
    : business;
  if (!target) {
    notFound();
  }
  const isForOther = target.id !== business.id;
  // Uploading on behalf of a child clinic requires the signed-in agency
  // account's own plan to be an active code='agency' package — see
  // lib/agency.ts:hasActiveAgencyPlan. This mirrors the same check in
  // app/api/submissions/route.ts (that one is what actually blocks a
  // bypass via direct POST); this one keeps someone from even seeing a
  // working-looking upload form here if they got to this URL directly
  // (e.g. a bookmarked link) instead of via a disabled dashboard button.
  const agencyPlanBlocked = isForOther && !hasActiveAgencyPlan(business);

  return (
    <main>
      <Nav credits={business?.credits_remaining ?? 0} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">อัพโหลดภาพโฆษณา</h1>
        {isForOther && !agencyPlanBlocked && (
          <p className="text-sm text-secondary mb-2">
            กำลังอัพโหลดให้ <span className="font-medium text-primary">{target.name}</span> ในเครือข่ายของคุณ —
            ใช้เครดิตรวมจากแพ็กเกจ Agency ของคุณ
          </p>
        )}
        {agencyPlanBlocked ? (
          <div className="rounded-lg border border-warning bg-warningSoft p-5 mt-6">
            <p className="text-sm font-medium mb-1">
              ต้องสมัครแพ็กเกจ Agency ก่อนอัพโหลดให้คลินิกในเครือข่าย
            </p>
            <p className="text-sm text-secondary mb-4">
              บัญชีของคุณยังไม่ได้สมัคร หรือแพ็กเกจ Agency (หลายสาขา) หมดอายุแล้ว — สมัครหรือต่ออายุเพื่อปลดล็อกการ
              อัพโหลดให้ทุกคลินิกในเครือข่ายนี้อีกครั้ง
            </p>
            <Link
              href="/checkout?plan=agency"
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
            {/* creditsRemaining always reflects `business` (the signed-in
                account), never `target` — that's what actually gets billed,
                see app/api/submissions/route.ts. For a solo clinic
                reviewing its own ad, business === target, so this is
                unchanged for that case. */}
            <UploadForm creditsRemaining={business.credits_remaining ?? 0} businessId={isForOther ? target.id : undefined} />
          </>
        )}
      </div>
    </main>
  );
}
