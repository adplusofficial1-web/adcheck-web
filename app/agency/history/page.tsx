export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getChildClinics, getBusinessByIdForOwner, getRecentImagesByBusiness } from "@/lib/agency";

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  passed: { label: "ผ่าน", badge: "bg-accentSoft text-accent" },
  caution: { label: "ควรระวัง", badge: "bg-warningSoft text-warning" },
  violation: { label: "เข้าข่ายผิด", badge: "bg-dangerSoft text-danger" },
};
const FILTERS: { key?: string; label: string }[] = [
  { key: undefined, label: "ทัฉหมด" },
  { key: "violation", label: "เข้าข่ายผิด" },
  { key: "caution", label: "ควรระวัง" },
  { key: "passed", label: "ผ่าน" },
];

export default async function AgencyHistoryPage({
  searchParams,
}: {
  searchParams: { clinic?: string; filter?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) {
    redirect("/login");
  }
  const filter = searchParams.filter;

  const clinics = await getChildClinics(business.id);

  // A ?clinic= that doesn't resolve to a clinic this account actually owns
  // (bad id, someone else's clinic) just falls back to the "all clinics"
  // view below rather than erroring — same posture as the rest of this
  // feature: never reveal whether an id exists, just show what's actually
  // theirs.
  const focused = searchParams.clinic ? await getBusinessByIdForOwner(searchParams.clinic, business.id) : null;

  const filterHref = (clinicId?: string) => {
    const params = new URLSearchParams();
    if (clinicId) params.set("clinic", clinicId);
    if (filter) params.set("filter", filter);
    const qs = params.toString();
    return qs ? `/agency/history?${qs}` : "/agency/history";
  };

  return (
    <main>
      {/* Shared pool — see app/agency/dashboard/page.tsx's totalCredits comment. */}
      <Nav credits={business.credits_remaining} />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-2xl font-medium mb-6">
          ประวัติการตรวจสอบ{focused ? ` — ${focused.name}` : " — แยกตามคลินิก"}
        </h1>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <Link
            href={(() => {
              const p = new URLSearchParams();
              if (filter) p.set("filter", filter);
              const qs = p.toString();
              return qs ? `/agency/history?${qs}` : "/agency/history";
            })()}
            className={`px-4 py-2 text-sm shrink-0 rounded-pill border ${
              !focused ? "bg-inverse text-onInverse border-inverse" : "border-border"
            }`}
          >
            ทุกคลินิก
          </Link>
          {clinics.map((c) => (
            <Link
              key={c.id}
              href={filterHref(c.id)}
              className={`px-4 py-2 text-sm shrink-0 rounded-pill border ${
                focused?.id === c.id ? "bg-inverse text-onInverse border-inverse" : "border-border"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mb-8">
          {FILTERS.map((f) => {
            const params = new URLSearchParams();
            if (focused) params.set("clinic", focused.id);
            if (f.key) params.set("filter", f.key);
            const qs = params.toString();
            return (
              <Link
                key={f.label}
                href={qs ? `/agency/history?${qs}` : "/agency/history"}
                className={`px-4 py-2 text-sm rounded-pill border ${
                  filter === f.key ? "bg-accentSoft text-accent border-accent" : "border-border"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {focused ? (
          <SoloClinicHistory businessId={focused.id} filter={filter} />
        ) : (
          <GroupedHistory clinics={clinics} filter={filter} />
        )}
      </div>
    </main>
  );
}

async function SoloClinicHistory({ businessId, filter }: { businessId: string; filter?: string }) {
  // Bug Audit 4 (2569-09-02): `si.*` used to drag every row's base64
  // image_url (megabytes for 50 rows) out of Postgres on each visit and
  // then never render it. Select only what the list shows; the thumbnail
  // is loaded lazily from /api/images/[id] instead.
  const images = (filter
    ? await sql`
        SELECT si.id, si.submission_id AS image_submission_id, si.caption, si.file_type, si.file_size_bytes, si.sort_order, si.filename, si.status, (si.image_url LIKE 'data:%') AS has_image, s.id AS submission_id, s.created_at
        FROM submission_images si
        JOIN submissions s ON s.id = si.submission_id
        WHERE s.business_id = ${businessId} AND si.status = ${filter}
        ORDER BY s.created_at DESC
        LIMIT 50
      `
    : await sql`
        SELECT si.id, si.submission_id AS image_submission_id, si.caption, si.file_type, si.file_size_bytes, si.sort_order, si.filename, si.status, (si.image_url LIKE 'data:%') AS has_image, s.id AS submission_id, s.created_at
        FROM submission_images si
        JOIN submissions s ON s.id = si.submission_id
        WHERE s.business_id = ${businessId}
        ORDER BY s.created_at DESC
        LIMIT 50
      `) as any[];

  if (images.length === 0) return <p className="text-sm text-secondary">ไม่พบรายการ</p>;
  return (
    <div className="space-y-3">
      {images.map((img) => {
        const s = STATUS_LABEL[img.status] || STATUS_LABEL.passed;
        return (
          <Link
            key={img.id}
            href={`/agency/results/${img.submission_id}`}
            className="flex items-center justify-between border border-border rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              {img.has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/images/${img.id}`}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 rounded-md object-cover bg-accentSoft shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-accentSoft shrink-0" />
                  )}
              <span className="text-sm font-medium">{img.filename}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-secondary">
              {/* FIX (bug audit round 3): pin Asia/Bangkok on both dates in this
                  file — see the comment in components/results/ResultsPageContent.tsx
                  for why a missing timeZone shows the wrong calendar day. */}
              <span>{new Date(img.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
              <span className={`rounded-pill px-3 py-1 text-xs font-medium ${s.badge}`}>{s.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

async function GroupedHistory({
  clinics,
  filter,
}: {
  clinics: Awaited<ReturnType<typeof getChildClinics>>;
  filter?: string;
}) {
  const ids = clinics.map((c) => c.id);
  const byClinic = await getRecentImagesByBusiness(ids, 8, filter);

  if (clinics.length === 0) {
    return <p className="text-sm text-secondary">ยังไม่มีคลินิกในเครือข่าย</p>;
  }

  return (
    <div className="space-y-8">
      {clinics.map((c) => {
        const images = byClinic.get(c.id) || [];
        return (
          <div key={c.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-xs text-tertiary">({images.length} รายการ)</span>
            </div>
            {images.length === 0 ? (
              <p className="text-sm text-secondary">ไม่พบรายการ</p>
            ) : (
              <div className="space-y-3">
                {images.map((img: any) => {
                  const s = STATUS_LABEL[img.status] || STATUS_LABEL.passed;
                  return (
                    <Link
                      key={img.id}
                      href={`/agency/results/${img.submission_id}`}
                      className="flex items-center justify-between border border-border rounded-lg p-4"
                    >
                      <div className="flex items-center gap-3">
                        {img.has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/images/${img.id}`}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 rounded-md object-cover bg-accentSoft shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-accentSoft shrink-0" />
                  )}
                        <span className="text-sm font-medium">{img.filename}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-secondary">
                        <span>{new Date(img.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
                        <span className={`rounded-pill px-3 py-1 text-xs font-medium ${s.badge}`}>{s.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
