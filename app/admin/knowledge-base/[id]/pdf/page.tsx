export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { getComplianceRule } from "@/lib/complianceRules";
import { formatThaiDateTime } from "@/lib/formatDateTime";
import { AutoPrint } from "@/components/AutoPrint";

/**
 * Printable "Download PDF" view of one คลังความรู้ (compliance knowledge
 * base) row — reached from the "ดาวน์โหลดเอกสาร" menu on
 * /admin/knowledge-base. Same pattern as app/results/[id]/pdf/page.tsx:
 * not a server-generated PDF file, just a plain page that AutoPrint opens
 * the browser's print dialog on, so "Save as PDF" produces the file. That
 * keeps this feature free of any PDF-rendering dependency (see this
 * app's existing note on Puppeteer/react-pdf on a small Render service);
 * the sibling /docx route generates a real .docx file directly instead,
 * since there's no browser-native equivalent for that format.
 *
 * Auth is handled by app/admin/layout.tsx (ADMIN_EMAILS-gated) — this
 * page only has to hide that layout's chrome when printing, which it does
 * via the print:hidden/print:p-0 classes added there.
 */
export default async function KnowledgeBaseRulePdfPage({ params }: { params: { id: string } }) {
  const rule = await getComplianceRule(params.id);
  if (!rule) notFound();

  return (
    <main className="bg-page text-primary print:bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact] max-w-3xl mx-auto">
      <AutoPrint />

      <header className="bg-inverse text-onInverse px-10 py-8">
        <p className="text-xs uppercase tracking-wide text-onInverse/70">คลังความรู้กฎหมาย — ADCheck</p>
        <h1 className="mt-2 text-xl font-medium">{rule.title}</h1>
      </header>

      <div className="px-10 py-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {rule.category && (
            <span className="rounded-pill bg-accentSoft text-accent px-2.5 py-1">{rule.category}</span>
          )}
          <span className="rounded-pill bg-page border border-border text-tertiary px-2.5 py-1">
            {rule.always_include ? "ใช้เสมอทุกภาพ (always_include)" : "ค้นหาตามบริบท (context search)"}
          </span>
          <span className="rounded-pill bg-page border border-border text-tertiary px-2.5 py-1">
            {rule.source_type === "upload" ? `ไฟล์ต้นฉบับ: ${rule.source_filename ?? ""}` : "พิมพ์/วางข้อความโดยผู้ดูแลระบบ"}
          </span>
        </div>

        <hr className="my-6 border-border" />

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary">{rule.content}</p>

        <p className="mt-10 text-xs text-tertiary">
          เพิ่มเข้าคลังความรู้เมื่อ {formatThaiDateTime(rule.created_at)}
          {rule.updated_at !== rule.created_at && ` · แก้ไขล่าสุด ${formatThaiDateTime(rule.updated_at)}`}
        </p>
      </div>
    </main>
  );
}
