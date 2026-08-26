import Link from "next/link";
import type { ActivePackage } from "@/lib/credits";

// Whole days left until `expiresAt`, ceil()'d so "later today" still reads
// as at least 1 day. 0 or negative means that package's own 30-day cycle
// has already lapsed.
function daysRemaining(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Shared "แพ็กเกจและเครดิต" card: the combined credit total up top, then one
// row per still-active package purchase (its own price/credits/expiry),
// plus a dashed row for any non-expiring legacy/free balance. A package
// simply stops appearing (and stops counting toward the total) once its
// own expiry passes — see lib/credits.ts on the server.
//
// Used on both the solo-clinic settings page
// (components/settings/SettingsClient.tsx) and the Agency settings page
// (app/agency/settings/page.tsx). An agency's own credits_remaining is the
// single shared pool every child clinic it manages draws from — child
// clinics don't have their own packages — so this card reads exactly the
// same way in both modes, just fed the signed-in business's own numbers.
export function PackageCreditsCard({
  creditsRemaining,
  packages,
  buyHref = "/pricing",
  buyLabel = "ซื้อแพ็กเกจเพิ่ม",
}: {
  creditsRemaining: number;
  packages: ActivePackage[];
  buyHref?: string;
  buyLabel?: string;
}) {
  // creditsRemaining is already the combined total (legacy balance + every
  // active package's remaining credits — see
  // lib/db.ts:withActivePackageCredits on the server). Subtracting the
  // packages back out gives just the non-expiring legacy portion, so the
  // per-package rows below plus this one row always add back up to the
  // total shown above them.
  const packageCreditsSum = packages.reduce((sum, p) => sum + p.credits_remaining, 0);
  const legacyCredits = Math.max(creditsRemaining - packageCreditsSum, 0);

  return (
    <section className="border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium">แพ็กเกจและเครดิต</div>
        <Link
          href={buyHref}
          className="shrink-0 rounded-md bg-inverse text-onInverse px-3.5 py-2 text-xs font-medium"
        >
          {buyLabel}
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-accentSoft px-5 py-4 mb-5">
        <div className="text-sm text-accent">เครดิตคงเหลือรวมทุกแพ็กเกจ</div>
        <div className="text-2xl font-medium text-accent">{creditsRemaining}</div>
      </div>

      {packages.length === 0 && legacyCredits <= 0 ? (
        <div className="text-sm text-secondary">ยังไม่มีแพ็กเกจ</div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => {
            const remaining = daysRemaining(pkg.expires_at);
            return (
              <div
                key={pkg.id}
                className="flex items-center gap-4 border border-border rounded-md p-4"
              >
                <div className="flex-1 min-w-0">
                  <span className="inline-block rounded-pill bg-accentSoft text-accent text-xs font-medium px-3 py-1 mb-2">
                    {pkg.plan_name}
                  </span>
                  <div className="text-sm font-medium">
                    {pkg.price_thb ? `${Number(pkg.price_thb).toLocaleString()} บาท` : "—"}
                    {pkg.credits_granted ? `  ·  ${pkg.credits_granted} เครดิต/แพ็กเกจ` : ""}
                  </div>
                  <div className="text-xs text-secondary mt-1">
                    {remaining > 0
                      ? `เหลืออีก ${remaining} วัน — หมดอายุวันที่ ${new Date(
                          pkg.expires_at
                        ).toLocaleDateString("th-TH")}`
                      : "กำลังจะหมดอายุ"}
                  </div>
                </div>
                <div className="rounded-lg bg-page border border-border px-5 py-3 text-center shrink-0">
                  <div className="text-xl font-medium">{pkg.credits_remaining}</div>
                  <div className="text-xs text-secondary">/{pkg.credits_granted} เครดิต</div>
                </div>
              </div>
            );
          })}
          {legacyCredits > 0 && (
            <div className="flex items-center gap-4 border border-dashed border-border rounded-md p-4">
              <div className="flex-1 min-w-0">
                <span className="inline-block rounded-pill bg-page text-secondary text-xs font-medium px-3 py-1 mb-2">
                  เครดิตฟรี / ไม่มีวันหมดอายุ
                </span>
                <div className="text-xs text-secondary">เครดิตคงเหลือที่ไม่ได้ผูกกับแพ็กเกจใดๆ</div>
              </div>
              <div className="rounded-lg bg-page border border-border px-5 py-3 text-center shrink-0">
                <div className="text-xl font-medium">{legacyCredits}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
