import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentBusiness } from "@/lib/currentBusiness";
import { getAccessibleBusinessIds } from "@/lib/agency";
import { isValidUuid } from "@/lib/validation";

// Bug Audit 4 (2569-09-02): GET /api/images/[id] — serves one
// submission_images row's picture as a real image response.
//
// Why: submission images are stored as base64 data URLs in
// submission_images.image_url (the "temporary" approach noted since audit
// 1), and every results/share/PDF page used to inline that base64 straight
// into the HTML — an 8-image result page was 4.2 MB of HTML on every open,
// including the public /share link a clinic forwards to สบส. Pages now
// render `<img src="/api/images/<id>">` instead, so the HTML is a few KB,
// each picture streams separately (lazily where the page allows it) and is
// cached by the browser — the bytes never change for a given row, hence
// the immutable cache header.
//
// Access: exactly what the page that embeds the image already enforces —
// either the signed-in account may act on the submission's business (self
// or a managed clinic, same getAccessibleBusinessIds scoping as
// components/results/ResultsPageContent.tsx), or the request carries the
// submission's share_token (`?share=<token>`, the capability the public
// /share/[token] page is built on — see that page's comment). Knowing an
// image id alone grants nothing.
export const dynamic = "force-dynamic";

const SHARE_TOKEN_RE = /^[0-9a-f]{16}$/i;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const shareToken = new URL(req.url).searchParams.get("share");

  try {
    const [row] = (await sql`
      SELECT si.image_url, s.business_id, s.share_token
      FROM submission_images si
      JOIN submissions s ON s.id = si.submission_id
      WHERE si.id = ${params.id}
    `) as { image_url: string | null; business_id: string; share_token: string | null }[];

    if (!row || !row.image_url || !row.image_url.startsWith("data:")) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let allowed = false;
    if (shareToken && SHARE_TOKEN_RE.test(shareToken) && row.share_token === shareToken) {
      allowed = true;
    } else {
      const business = await getCurrentBusiness();
      if (business) {
        const accessible = await getAccessibleBusinessIds(business.id);
        allowed = accessible.includes(row.business_id);
      }
    }
    // Same answer for "exists but not yours" and "doesn't exist", so an id
    // can't be probed.
    if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // data:<mime>;base64,<payload>
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(row.image_url);
    if (!match || !match[2]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const mime = match[1] && /^(image\/[a-z0-9.+-]+|application\/pdf)$/i.test(match[1]) ? match[1] : "application/octet-stream";
    const bytes = Buffer.from(match[3], "base64");

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        // The row's bytes never change; only the (private or tokenised) URL
        // grants access, so a long private cache is safe.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    console.error("GET /api/images/[id] failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
