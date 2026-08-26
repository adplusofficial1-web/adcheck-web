export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { UploadForm } from "./UploadForm";
import { Nav } from "@/components/Nav";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getBusinessByIdForOwner } from "@/lib/agency";

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

  return (
    <main>
      <Nav credits={business?.credits_remaining ?? 0} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-2">อัปโหลดภาพโฆษณา</h1>
        {isForOther && (
          <p className="text-sm text-secondary mb-2">
            กำลังอัปโหลดให้ <span className="font-medium text-primary">{target.name}</span> ในเครือข่ายของคุณ —
            ใช้เครดิตของคลินิกนี้
          </p>
        )}
        <p className="text-sm text-secondary mb-8">
          เลือกได้สูงสุด 5 ภาพต่อครั้ง รองรับ JPG, PNG, PDF ไม่เกิน 10MB ต่อไฟล์
        </p>
        <UploadForm creditsRemaining={target.credits_remaining ?? 0} businessId={isForOther ? target.id : undefined} />
      </div>
    </main>
  );
}
