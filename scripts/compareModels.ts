// One-off comparison tool: runs the SAME real ad images through two Claude
// models (claude-sonnet-5 — the current production default — and
// claude-haiku-4-5, a cheaper candidate) and prints both results side by
// side, so a human can judge whether Haiku's review quality is good enough
// to consider switching lib/reviewImage.ts's default model.
//
// Deliberately calls lib/reviewImage.ts's reviewImage() directly rather than
// lib/automationCheckAd.ts's checkAdImageUrls() — that means this script:
//   - does NOT reserve/spend any AdCheck "credits" (lib/credits.ts) against
//     the AdCheck Automation (Internal) business
//   - does NOT write anything to the submissions/submission_images/
//     review_flags tables, and does NOT create a shareable /share/ link
//   - the ONLY real-world cost this incurs is the actual Anthropic API
//     token spend for the calls it makes (a handful of images x 2 models —
//     a few cents), same as any other reviewImage() call
// Safe to re-run as many times as useful; it never touches production data.
//
// Images come from real, already-processed Hunter leads (status = 'done')
// so the comparison uses genuine ad creatives instead of synthetic test
// images. Run with: npx tsx scripts/compareModels.ts
import { sql } from "../lib/db";
import { reviewImage, type ReviewResult } from "../lib/reviewImage";

const MODELS = ["claude-sonnet-5", "claude-haiku-4-5"] as const;

// Small sample — this is a manual-read quality comparison, not a
// statistical benchmark, and each image costs real (if tiny) API spend.
const SAMPLE_LEAD_COUNT = 3;

const IMAGE_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type SampleImage = { clinicName: string; imageUrl: string; base64Image: string; mediaType: string };

async function fetchImageBytes(imageUrl: string): Promise<{ base64Image: string; mediaType: string } | null> {
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": IMAGE_FETCH_UA, Accept: "image/*,*/*;q=0.8" } });
    if (!res.ok) {
      console.error(`  [skip] fetch failed (${res.status}) for ${imageUrl}`);
      return null;
    }
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64Image: buffer.toString("base64"), mediaType: contentType };
  } catch (e) {
    console.error(`  [skip] fetch threw for ${imageUrl}:`, e);
    return null;
  }
}

function summarize(label: string, model: string, ms: number, result: ReviewResult) {
  console.log(`\n--- ${label} | ${model} (${(ms / 1000).toFixed(1)}s) ---`);
  console.log(`status: ${result.status} | confidence: ${result.confidence} | flags: ${result.flags.length}`);
  for (const f of result.flags) {
    console.log(`  [${f.severity}/${f.confidence_level}] ${f.topic}`);
    console.log(`    quoted: "${f.quoted_text}"`);
    console.log(`    why: ${f.detailed_explanation}`);
  }
}

async function main() {
  const leads = (await sql`
    SELECT clinic_name, image_urls
    FROM hunter_leads
    WHERE status = 'done' AND array_length(image_urls, 1) > 0
    ORDER BY updated_at DESC
    LIMIT ${SAMPLE_LEAD_COUNT}
  `) as { clinic_name: string; image_urls: string[] }[];

  if (leads.length === 0) {
    console.log("No done leads with images found to sample from — nothing to compare.");
    return;
  }

  console.log(`Sampling ${leads.length} lead(s) for comparison:`);
  for (const l of leads) console.log(`  - ${l.clinic_name} (${l.image_urls.length} image(s))`);

  // Pre-fetch every image ONCE (same bytes reused for both models below —
  // fair comparison, and avoids hitting the source CDN twice per image).
  const samples: SampleImage[] = [];
  for (const lead of leads) {
    for (const imageUrl of lead.image_urls) {
      const fetched = await fetchImageBytes(imageUrl);
      if (!fetched) continue;
      samples.push({ clinicName: lead.clinic_name, imageUrl, ...fetched });
    }
  }
  console.log(`\nFetched ${samples.length} image(s) total. Running each through both models...\n`);

  // Grouped by MODEL (not interleaved) so each model's prompt cache
  // (lib/reviewImage.ts's ephemeral 1h cache_control on the ~140k-char
  // system prompt) gets reused across this run's later calls instead of
  // missing on every single call — cheaper and faster, same as how real
  // production traffic benefits from caching.
  const allResults: { clinicName: string; imageUrl: string; model: string; result: ReviewResult; ms: number }[] = [];
  for (const model of MODELS) {
    for (const s of samples) {
      const label = `${s.clinicName} (${s.imageUrl.slice(-40)})`;
      const started = Date.now();
      try {
        const result = await reviewImage({
          base64Image: s.base64Image,
          mediaType: s.mediaType,
          caption: s.clinicName,
          filename: s.imageUrl.split("/").pop()?.split("?")[0] || "compare-image",
          model,
        });
        const ms = Date.now() - started;
        summarize(label, model, ms, result);
        allResults.push({ clinicName: s.clinicName, imageUrl: s.imageUrl, model, result, ms });
      } catch (e) {
        console.error(`\n--- ${label} | ${model} FAILED ---`, e);
      }
    }
  }

  // Final side-by-side summary table — the quick-glance version of
  // everything printed in detail above.
  console.log("\n\n=== SUMMARY (status / flag count per image per model) ===");
  for (const s of samples) {
    const row = MODELS.map((m) => {
      const r = allResults.find((x) => x.imageUrl === s.imageUrl && x.model === m);
      return r ? `${m}: ${r.result.status}/${r.result.flags.length} flags (${(r.ms / 1000).toFixed(1)}s)` : `${m}: FAILED`;
    });
    console.log(`${s.clinicName} — ${s.imageUrl.slice(-40)}`);
    for (const line of row) console.log(`   ${line}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("compareModels: fatal error:", err);
    process.exit(1);
  });
