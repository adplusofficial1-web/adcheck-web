// Extracts plain text from an uploaded knowledge-base document so its
// content can be stored in compliance_rules.content and searched the same
// way as manually-typed rules. Used by
// app/api/admin/knowledge-base/upload/route.ts.
//
// Supported: .pdf (pdf-parse), .docx (mammoth), .txt/.md (decoded as-is).
// .doc (legacy binary Word format) is intentionally NOT supported -- there's
// no good pure-JS parser for it; ask the admin to save as .docx or .pdf.

import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export type ExtractResult = { text: string; warning?: string };

// Postgres text columns reject the NUL byte (U+0000) outright ("invalid
// byte sequence for encoding \"UTF8\": 0x00") -- it's not a UTF-8 validity
// issue, Postgres just refuses to store U+0000 in text/varchar no matter
// how it's encoded. pdf-parse (and occasionally mammoth, for a .docx with
// embedded binary artifacts) can emit stray NUL bytes from certain PDF
// encoders, and until this was caught, a knowledge-base upload containing
// one would crash createComplianceRule()'s INSERT with an uncaught
// NeonDbError. Since app/api/admin/knowledge-base/upload/route.ts had no
// catch around that call, Next.js was returning an empty response body for
// the whole request, which the admin UI's `await res.json()` then failed
// to parse as "Unexpected end of JSON input" -- a confusing error with no
// hint of the real cause. Stripping NUL bytes here, right at extraction,
// is the fix; see also the try/catch added around both knowledge-base POST
// handlers as a second line of defense against any other unexpected
// extraction output.
function stripNulBytes(text: string): string {
  return text.replace(/\u0000/g, "");
}

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ExtractResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf" || mimeType === "application/pdf") {
    const parsed = await pdfParse(buffer);
    const text = stripNulBytes(parsed.text).trim();
    if (!text) {
      // Scanned/image-only PDF with no embedded text layer -- pdf-parse
      // can't OCR. Surface this clearly instead of silently creating an
      // empty knowledge-base entry that Claude would then treat as "no
      // relevant law found" for anything that should have matched it.
      return {
        text: "",
        warning:
          "ไม่พบข้อความในไฟล์ PDF นี้ (อาจเป็นไฟล์สแกน/รูปภาพล้วน) กรุณาพิมพ์เนื้อหาด้วยตนเอง หรืออัปโหลดไฟล์ที่มีข้อความจริง",
      };
    }
    return { text };
  }

  if (
    ext === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: stripNulBytes(result.value).trim() };
  }

  if (ext === "doc") {
    return {
      text: "",
      warning: "ไฟล์ .doc (Word รุ่นเก่า) ยังไม่รองรับ กรุณาบันทึกเป็น .docx หรือ .pdf แล้วอัปโหลดใหม่",
    };
  }

  if (ext === "txt" || ext === "md" || mimeType.startsWith("text/")) {
    return { text: stripNulBytes(buffer.toString("utf-8")).trim() };
  }

  return {
    text: "",
    warning: `ไม่รองรับไฟล์นามสกุล .${ext || "?"} -- รองรับเฉพาะ PDF, DOCX, TXT, MD`,
  };
}
