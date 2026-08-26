import Anthropic from "@anthropic-ai/sdk";
import { searchComplianceRules, type ComplianceRuleMatch } from "@/lib/complianceRules";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ReviewFlag = {
  quoted_text: string;
  category: string;
  legal_ref: string;
  severity: "ห้ามเด็ดขาด" | "ควรระวัง";
  confidence_level: "สูง" | "ปานกลาง" | "ต่ำ";
  topic: string;
  detailed_explanation: string;
  suggested_correction: string;
};

export type ReviewResult = {
  status: "passed" | "caution" | "violation";
  confidence: number;
  flags: ReviewFlag[];
};

// ---------------------------------------------------------------------
// CHANGE (knowledge-base grounding): the compliance rule TEXT itself no
// longer lives here. It used to be a hardcoded RULES_CONTEXT string (see
// git history) baked directly into this file — meaning updating the law
// meant a code change + redeploy, and there was no way to verify Claude
// was actually being judged against a specific, reviewable version of the
// rules. It now lives in the `compliance_rules` table, editable by AD
// Plus staff at /admin/knowledge-base (see lib/complianceRules.ts), and is
// fetched fresh per image below via searchComplianceRules().
//
// What stays here is only the PROCESS instructions — how to format a
// flag, the output schema, the "flags can't be empty if status isn't
// passed" safety rule, etc. None of that is legal content, so it's fine
// for it to stay static in code.
// ---------------------------------------------------------------------
const REVIEW_INSTRUCTIONS = `
คุณคือ AI ผู้ช่วยตรวจสอบโฆษณาสถานพยาบาล/คลินิกความงามในประเทศไทย

กฎที่สำคัญที่สุดและห้ามฝ่าฝืนเด็ดขาด: ให้ตัดสินและอ้างอิงโดยใช้เฉพาะ "เอกสารกฎหมาย/ระเบียบจากคลังความรู้" ที่แนบมาด้านล่าง
ข้อความนี้เท่านั้น (มาจากรายการที่ผู้ดูแลระบบ AD Plus พิมพ์หรืออัพโหลดไว้ในหน้า Admin) ห้ามใช้ความรู้กฎหมายไทยอื่นที่คุณมีอยู่
เดิมมาประกอบการตัดสินหรืออ้างอิงเพิ่มเติมโดยเด็ดขาด แม้จะรู้สึกว่าเกี่ยวข้อง คุ้นเคย หรือน่าจะถูกต้องก็ตาม เหตุผลคือทีมงาน
สามารถตรวจสอบและควบคุมความถูกต้อง/ความเป็นปัจจุบันของเนื้อหาในคลังความรู้ได้ แต่ไม่สามารถตรวจสอบความรู้ภายในตัวคุณได้
ถ้าเอกสารที่แนบมาไม่ได้ครอบคลุมประเด็นใดในภาพอย่างชัดเจน ห้ามคาดเดาหรือยกเลขมาตรา/แหล่งอ้างอิงขึ้นเองโดยเด็ดขาด — ให้ใส่
legal_ref เป็น "ไม่พบในคลังความรู้ที่ให้มา" แทน และพิจารณาว่าประเด็นนั้นควรมี severity เป็น "ควรระวัง" (ให้มนุษย์ตรวจสอบเพิ่ม)
ไม่ใช่ "ห้ามเด็ดขาด" เว้นแต่จะมีข้อความในเอกสารที่แนบมารองรับชัดเจน

ตรวจภาพโฆษณาที่แนบมา (และคำบรรยายประกอบถ้ามี) โดยเทียบกับเอกสารที่แนบมาเท่านั้น แล้วรายงานผลผ่าน submit_review เท่านั้น
ให้ยกข้อความที่มีปัญหามาแบบคำต่อคำ (quoted_text)

สำหรับแต่ละจุดที่พบปัญหา ต้องอธิบายเป็น 3 ส่วนแยกกันชัดเจน แต่ทุกส่วนต้อง "สั้น กระชับ ตรงประเด็น" เท่านั้น
(ห้ามอธิบายยืดยาว) เพราะคำตอบทั้งหมดมีขีดจำกัดความยาวรวมที่จำกัดมาก:
1. topic — หัวข้อหลักสั้นๆ (ไม่เกิน 6-8 คำ) สรุปว่าปัญหาคืออะไร เช่น "คำโฆษณาเกินจริงเรื่องผลลัพธ์การรักษา"
2. detailed_explanation — คำอธิบายว่า "เข้าข่ายผิดจุดไหน ด้วยเหตุผลอะไร" ความยาวไม่เกิน 2 บรรทัด (ห้ามยาวเกินนี้)
   ต้องอ้างอิงชื่อหัวข้อ/หมวดหมู่ของเอกสารในคลังความรู้ที่ใช้ประกอบเหตุผลแบบเจาะจงอย่างน้อย 1 แหล่ง (เช่น ชื่อหัวข้อที่
   ปรากฏใน "=== เอกสารกฎหมาย/ระเบียบจากคลังความรู้ ===" ด้านล่าง) เอาเฉพาะประเด็นหลัก ไม่ใช่แค่บอกว่า "ผิดกฎ" เฉยๆ —
   ห้ามระบุ "ฉบับปรับปรุง", เลขฉบับ, หรือวันที่ปรับปรุงของคู่มือ/ประกาศใดๆ โดยเด็ดขาด เพราะเป็นข้อมูลที่ระบบไม่สามารถ
   ตรวจสอบความถูกต้องได้ ให้เอ่ยถึงคู่มือ/ประกาศด้วยชื่อทั่วไปเท่านั้น
3. suggested_correction — คำแนะนำวิธีแก้ไขที่นำไปใช้ได้จริงทันที ความยาวไม่เกิน 1-2 บรรทัด ต้องระบุเจาะจงแต่สั้น เช่น
   ข้อความที่ควรใช้แทน (ยกตัวอย่างสั้นๆ ไม่ใช่บอกแค่ "แก้คำโฆษณาให้เหมาะสม"), หรือถ้าเป็นปัญหาเรื่อง
   ภาพก่อน-หลัง/การยินยอม ให้ระบุสั้นๆ ว่าต้องแนบหลักฐานอะไร (เช่น "แนบหนังสือยินยอมเป็นลายลักษณ์อักษรจากเจ้าของภาพ")

ควบคุมความยาวรวมของคำตอบอย่างเคร่งครัด: ถ้าพบประเด็นความเสี่ยงมากกว่า 5 จุดในภาพเดียว ให้เลือกมาเฉพาะ 5 ประเด็นที่
ร้ายแรง/ชัดเจนที่สุดเท่านั้น (เรียงตามความรุนแรงและความชัดเจนของหลักฐาน) ห้ามพยายามระบุทุกประเด็นที่พบจนคำตอบยาวเกินไป
— เลือกน้อยจุดแต่สั้นกระชับและครบองค์ประกอบ ดีกว่าพยายามใส่ทุกจุดจนคำตอบถูกตัดกลางคันและใช้งานไม่ได้เลย

ถ้าไม่พบปัญหาใดๆ ให้ status = "passed" และ flags เป็นอาร์เรย์ว่าง

กฎสำคัญที่ห้ามฝ่าฝืนเด็ดขาด: ถ้า status เป็น "caution" หรือ "violation" (คือไม่ใช่ "passed")
flags ต้องมีอย่างน้อย 1 รายการเสมอ ห้ามส่ง status เป็น caution/violation พร้อม flags ว่างเปล่า
ถ้าคุณรู้สึกว่าภาพนี้มีความเสี่ยงแต่ยังไม่แน่ใจว่าจุดไหน ให้เลือกข้อความ/ส่วนของภาพที่ใกล้เคียงที่สุดมาระบุเป็น
quoted_text แทน อย่าปล่อยให้ flags ว่างเปล่าเมื่อ status ไม่ใช่ "passed" โดยเด็ดขาด
`.trim();

function buildLegalContextBlock(rules: ComplianceRuleMatch[]): string {
  return rules
    .map((r, i) => {
      const header = `[อ้างอิง ${i + 1}] ${r.title}${r.category ? ` (หมวดหมู่: ${r.category})` : ""}`;
      return `${header}\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

const REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_review",
  description: "ส่งผลการตรวจสอบความสอดคล้องของโฆษณากับกฎหมาย/ระเบียบที่เกี่ยวข้อง",
  input_schema: {
    type: "object",
    properties: {
      flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quoted_text: { type: "string" },
            category: { type: "string" },
            legal_ref: { type: "string", description: "ชื่อหัวข้ออ้างอิงจากคลังความรู้ที่แนบมา หรือ \"ไม่พบในคลังความรู้ที่ให้มา\"" },
            severity: { type: "string", enum: ["ห้ามเด็ดขาด", "ควรระวัง"] },
            confidence_level: { type: "string", enum: ["สูง", "ปานกลาง", "ต่ำ"] },
            topic: { type: "string", description: "หัวข้อหลักสั้นๆ ไม่เกิน 6-8 คำ" },
            detailed_explanation: {
              type: "string",
              description:
                "คำอธิบายสั้น ไม่เกิน 2 บรรทัด ต้องอ้างอิงเฉพาะเอกสารจากคลังความรู้ที่แนบมาแบบเจาะจง เอาเฉพาะประเด็นหลัก",
            },
            suggested_correction: {
              type: "string",
              description:
                "คำแนะนำวิธีแก้ไขที่ใช้ได้จริง ไม่เกิน 1-2 บรรทัด ระบุเจาะจง (ข้อความที่ควรใช้แทน หรือหลักฐานที่ต้องแนบ)",
            },
          },
          required: [
            "quoted_text",
            "category",
            "legal_ref",
            "severity",
            "confidence_level",
            "topic",
            "detailed_explanation",
            "suggested_correction",
          ],
        },
      },
      confidence: { type: "number", description: "ความมั่นใจโดยรวม 0-100" },
      status: { type: "string", enum: ["passed", "caution", "violation"] },
    },
    required: ["flags", "confidence", "status"],
  },
};

export async function reviewImage(params: {
  base64Image?: string;
  mediaType?: string;
  caption?: string;
  filename: string;
}): Promise<ReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local (see README) to enable real AI review."
    );
  }

  const contextText = [params.caption, params.filename].filter(Boolean).join(" ");
  const matchedRules = await searchComplianceRules(contextText);

  if (matchedRules.length === 0) {
    return {
      status: "caution",
      confidence: 0,
      flags: [
        {
          quoted_text: params.caption || params.filename,
          category: "ไม่พบข้อมูลในคลังความรู้",
          legal_ref: "-",
          severity: "ควรระวัง",
          confidence_level: "ต่ำ",
          topic: "ไม่พบกฎหมาย/ระเบียบที่เกี่ยวข้องในคลังความรู้",
          detailed_explanation:
            "ระบบค้นหาคลังความรู้กฎหมาย (Admin > คลังความรู้) แล้วไม่พบรายการที่เกี่ยวข้องกับภาพ/คำบรรยายนี้เพียงพอ " +
            "เพื่อความแม่นยำ ระบบจึงไม่ให้ AI ใช้ความรู้กฎหมายอื่นนอกเหนือจากคลังความรู้ที่ผู้ดูแลระบบกำหนดไว้ จึงยังไม่ได้ " +
            "ตรวจสอบเนื้อหาจริงของภาพนี้ ผลที่แสดงนี้ไม่ใช่ผลตรวจสอบที่สมบูรณ์",
          suggested_correction:
            "กรุณาให้เจ้าหน้าที่ตรวจสอบภาพนี้ด้วยตนเอง และพิจารณาเพิ่มข้อมูลกฎหมาย/ระเบียบที่เกี่ยวข้องในหน้า Admin > " +
            "คลังความรู้ เพื่อให้ระบบตรวจภาพลักษณะนี้ได้อัตโนมัติในครั้งถัดไป",
        },
      ],
    };
  }

  const systemPrompt = `${REVIEW_INSTRUCTIONS}

=== เอกสารกฎหมาย/ระเบียบจากคลังความรู้ (ใช้อ้างอิงได้เฉพาะเนื้อหาด้านล่างนี้เท่านั้น ห้ามใช้ความรู้อื่นนอกเหนือจากนี้) ===

${buildLegalContextBlock(matchedRules)}`;

  const content: Anthropic.MessageParam["content"] = [];
  if (params.base64Image && params.mediaType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: params.mediaType as any, data: params.base64Image },
    });
  }
  content.push({
    type: "text",
    text: `ไฟล์: ${params.filename}\nคำบรรยายที่จะใช้ในโฆษณา: "${params.caption || "(ไม่มี)"}"\n\nกรุณาตรวจสอบและเรียก submit_review`,
  });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    // Capped at 3000 by design, for cost control — deliberately NOT raised
    // further. Images with several flags were still hitting the old 4096
    // ceiling and truncating mid-JSON in production (26/8/2026: a 4-flag
    // image truncated with stop_reason "max_tokens", and the app's safety
    // net fell back to a generic placeholder instead of the real analysis).
    // Instead of raising the ceiling (which raises worst-case cost/image),
    // the fix is on the prompt side: REVIEW_INSTRUCTIONS above now caps each
    // flag's detailed_explanation/suggested_correction at 1-2 lines and caps
    // the model at its 5 most important flags per image, so a full response
    // — even for a "busy" image — fits comfortably under 3000 tokens without
    // truncating. If truncation is ever seen again at this budget, tighten
    // the prompt further rather than raising max_tokens.
    max_tokens: 3000,
    system: systemPrompt,
    tools: [REVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_review" },
    messages: [{ role: "user", content }],
  });

  if (message.stop_reason === "max_tokens") {
    console.error(
      `reviewImage: response for ${params.filename} was truncated at max_tokens — output may be incomplete`
    );
  }

  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a structured review");

  return toolUse.input as ReviewResult;
}
