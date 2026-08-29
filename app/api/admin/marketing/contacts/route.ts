import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { listAllMarketingContacts } from "@/lib/marketingAssociations";

// GET /api/admin/marketing/contacts — every contact across every
// association. Default JSON (for the "ภาพรวมผู้ติดต่อทั้งหมด" table on
// app/admin/marketing/page.tsx); ?format=csv streams a downloadable CSV
// instead, built for the stated goal of this feature — a mail-merge/BCC
// source list an admin can pull into their own email client. AdCheck
// itself never sends the email.
function csvEscape(value: string | null): string {
  const v = value ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: Request) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const contacts = await listAllMarketingContacts();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("format") === "csv") {
      const header = "สมาคม,ชื่อ,นามสกุล,อีเมล,ตำแหน่ง,เบอร์โทร\n";
      const body = contacts
        .map((c) =>
          [c.association_name, c.first_name, c.last_name, c.email, c.role, c.phone]
            .map(csvEscape)
            .join(",")
        )
        .join("\n");
      // ﻿ (UTF-8 BOM) so Excel on Windows opens Thai text correctly
      // instead of mangling it into mojibake — the same reason
      // app/results/[id]/pdf needs no such marker (PDFs don't have this
      // problem) but any CSV consumed by Excel does.
      return new NextResponse("﻿" + header + body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="adcheck-marketing-contacts.csv"`,
        },
      });
    }

    return NextResponse.json({ contacts });
  } catch (e: any) {
    console.error("GET /api/admin/marketing/contacts failed:", e);
    return NextResponse.json({ error: e?.message || "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
