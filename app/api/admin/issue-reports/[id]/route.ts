import { NextResponse } from "next/server";
import { getCurrentPlatformAdminEmail } from "@/lib/platformAdmin";
import { updateIssueReportStatus, type IssueReportStatus } from "@/lib/issueReports";
import { isValidUuid } from "@/lib/validation";

const VALID_STATUSES: IssueReportStatus[] = ["new", "in_progress", "resolved"];

// PATCH /api/admin/issue-reports/[id] — the only mutation the admin inbox
// needs (components/admin/IssueReportsManager.tsx): move a report between
// new / in_progress / resolved. Same admin gate as every other
// app/api/admin/** route (getCurrentPlatformAdminEmail).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminEmail = await getCurrentPlatformAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const status = body.status as IssueReportStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const updated = await updateIssueReportStatus(params.id, status);
    if (!updated) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error(`Failed to update issue report ${params.id}:`, e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
