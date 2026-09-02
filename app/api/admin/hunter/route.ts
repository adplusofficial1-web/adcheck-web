import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listHunterLeads, importHunterLeads, recoverStaleRunningLeads } from "@/lib/hunterLeads";
import { stripNulBytes } from "@/lib/validation";

// CHANGE (2569-09-02): raised from 500 — safe now that importHunterLeads
// (lib/hunterLeads.ts) batch-inserts in chunks instead of one INSERT per
// row, so a large import no longer risks a Render request timeout
// partway through. Still a real ceiling (not "unlimited"): a sanity
// bound, same spirit as MAX_GRANT_AMOUNT in app/api/admin/credits/route.ts.
const MAX_IMPORT_ROWS = 3000;

// GET /api/admin/hunter — the full queue table on
// app/admin/marketing/hunter/page.tsx. Replaces the old client-only
// localStorage.getItem("hunter_queue") read.
export async function GET() {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    // Stuck-'running' watchdog (2569-09-02, Bug Audit 4): every queue load
    // first flips any lead that's been 'running' too long (a run that died
    // with the server restart) back to 'failed', so the admin sees a
    // re-runnable row instead of a permanently greyed-out one. See
    // lib/hunterLeads.ts:recoverStaleRunningLeads.
    await recoverStaleRunningLeads();
    const leads = await listHunterLeads();
    return NextResponse.json({ leads });
  } catch (e) {
    console.error("GET /api/admin/hunter failed:", e);
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// POST /api/admin/hunter — bulk-import parsed Excel rows (the "นำเข้า
// ทั้งหมดเข้าคิว" button in HunterImport.tsx). Replaces the old client-only
// localStorage.setItem("hunter_queue", ...) write.
//
// CHANGE (2026-09-01, per user request: "ทุกครั้งที่เพิ่มคลินิก หรือ เพิ่มไฟล์
// ให้ระบบลบชื่อที่ซ้ำกับที่ในระบบมีก่อนทุกครั้ง"): importHunterLeads now also
// dedupes by clinic name (see lib/hunterLeads.ts) and returns how many rows
// were skipped as duplicates alongside how many were actually inserted, so
// the response — and the success message in HunterImport.tsx — can report
// both numbers.
export async function POST(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => null as any);
    const rows: unknown = body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows is required" }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `นำเข้าได้สูงสุด ${MAX_IMPORT_ROWS} รายการต่อครั้ง` }, { status: 400 });
    }

    const cleaned = rows
      .map((r: any) => ({
        clinic: typeof r?.clinic === "string" ? stripNulBytes(r.clinic).trim() : "",
        province: typeof r?.province === "string" ? stripNulBytes(r.province).trim() : "",
        link: typeof r?.link === "string" ? stripNulBytes(r.link).trim() : "",
      }))
      .filter((r) => r.clinic || r.link);

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลที่นำเข้าได้" }, { status: 400 });
    }

    // CHANGE (2569-09-02, Bug Audit 4): importHunterLeads now inserts every
    // chunk in one transaction (all-or-nothing) and returns
    // { inserted, skippedDuplicates } — both reported back so the UI's
    // success line can show them.
    const { inserted, skippedDuplicates } = await importHunterLeads(cleaned);
    return NextResponse.json({ inserted, skippedDuplicates });
  } catch (e) {
    console.error("POST /api/admin/hunter failed:", e);
    return NextResponse.json({ error: "นำเข้าไม่สำเร็จ" }, { status: 500 });
  }
}
