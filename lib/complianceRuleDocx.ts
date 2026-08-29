import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } from "docx";
import type { ComplianceRule } from "@/lib/complianceRules";

// Builds a standalone .docx for one คลังความรู้ (compliance knowledge base)
// row, used by app/api/admin/knowledge-base/[id]/docx/route.ts — the
// "ดาวน์โหลดเอกสาร" button on the admin knowledge-base page.
//
// Deliberately a small, self-contained generator (no shared template
// system) since this is the only place in the app that produces a .docx —
// the printable-PDF route next to it reuses the existing browser-print
// pattern (see app/results/[id]/pdf/page.tsx's header comment) instead of
// a rendering dependency; a real .docx has no such browser-native
// equivalent, so `docx` (pure JS, no native/headless-browser dependency)
// is the one new dependency this feature adds.
//
// `content` is rendered as plain justified paragraphs split on blank
// lines — the knowledge base stores plain text (typed directly, or
// extracted from an uploaded PDF/DOCX/TXT by lib/fileTextExtract.ts),
// never markup, so there is no richer structure to preserve.

const FONT = "TH Sarabun New";
const INK = "1a1a1a";
const MUTED = "555555";
const ACCENT = "1f4e5f";
const TAG_BG = "eef3f4";

function titleParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 34, bold: true, color: ACCENT })],
  });
}

function metaParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label} `, font: FONT, size: 22, bold: true, color: MUTED }),
      new TextRun({ text: value, font: FONT, size: 22, color: INK }),
    ],
  });
}

function tagParagraph(text: string) {
  return new Paragraph({
    spacing: { before: 160, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: TAG_BG },
    children: [new TextRun({ text: `  ${text}  `, font: FONT, size: 20, bold: true, color: ACCENT })],
  });
}

function hr() {
  return new Paragraph({
    spacing: { before: 40, after: 200 },
    border: { bottom: { color: "cfcfcf", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    children: [new TextRun({ text: "", font: FONT })],
  });
}

function bodyParagraphs(content: string) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const paras: Paragraph[] = [];
  for (const block of blocks) {
    const text = block.replace(/\s+/g, " ").trim();
    if (!text) continue;
    paras.push(
      new Paragraph({
        spacing: { after: 160, line: 300 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text, font: FONT, size: 24, color: INK })],
      })
    );
  }
  if (paras.length === 0) {
    paras.push(new Paragraph({ children: [new TextRun({ text: "(ไม่มีเนื้อหา)", font: FONT, size: 24, color: MUTED })] }));
  }
  return paras;
}

export async function buildComplianceRuleDocx(rule: ComplianceRule): Promise<Buffer> {
  const children: Paragraph[] = [
    titleParagraph(rule.title),
    metaParagraph("หมวดหมู่:", rule.category || "ไม่ระบุ"),
    metaParagraph("แหล่งที่มา:", rule.source_type === "upload" ? rule.source_filename || "ไฟล์ที่อัพโหลด" : "พิมพ์/วางข้อความโดยผู้ดูแลระบบ"),
    tagParagraph(rule.always_include ? "ใช้เสมอทุกภาพ (always_include)" : "ค้นหาตามบริบท (context search)"),
    hr(),
    ...bodyParagraphs(rule.content),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// Keeps generated filenames readable and header-safe: strips characters
// that would break a Content-Disposition filename or a filesystem path,
// collapses whitespace, and caps length.
export function safeExportFilename(title: string, ext: "docx" | "pdf"): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${cleaned || "knowledge-base"}.${ext}`;
}
