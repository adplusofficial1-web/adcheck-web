import type { Browser } from "puppeteer";

// Automates the public Meta Ad Library (facebook.com/ads/library) to find
// up to 3 currently-active IMAGE ad creatives for one Hunter lead, so
// scripts/hunterAutoFillJob.ts can fill in hunter_leads.image_urls without
// a human manually copying links out of Facebook first (see that file for
// the full pipeline this feeds into).
//
// IMPORTANT — why this exists instead of Meta's own Ad Library API: the
// official API (facebook.com/ads/library/api) only returns (a) political/
// social-issue/election ads worldwide, or (b) ANY ad type but only if it
// reached the UK/EU (confirmed by reading Meta's own API docs page
// directly, 2026-08-31). A Thai clinic's ordinary commercial ad matches
// neither, so it's invisible to that API — which is why this automates the
// public Ad Library *website* instead, which searches every currently-
// running ad regardless of category/country.
//
// RISK: this drives Meta's public web UI, not a supported API — there is
// no contract that its DOM/class names stay stable, and Meta's terms of
// service generally restrict automated data collection outside approved
// API channels. Keep this to the low, once-daily volume the Hunter queue
// actually needs (see the cron schedule on the Render Cron Job / package.json
// "cron:hunter"), not a bulk scrape. If Meta starts blocking this outright,
// the fallback is the pre-existing MANUAL flow (Hunter pastes links into
// the admin UI, components/admin/HunterImport.tsx) that this file is
// layered on top of, not a replacement for — every function here is
// best-effort and simply returns fewer/no images on failure rather than
// throwing, so a bad day for the scraper degrades back to "a human handles
// this lead," never a crash.

export type HunterLeadForSearch = {
  clinic_name: string;
  province: string | null;
  source_link: string | null;
};

// Same reasoning as lib/automationCheckAd.ts's fetchImageBytes(): a normal
// browser-style User-Agent, not because it bypasses any access control (it
// doesn't — this only ever reads what facebook.com/ads/library already
// serves to a logged-out visitor), just so requests don't get treated as an
// obviously-automated client by default.
const AD_LIBRARY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// A creative image inside an ad result card renders far larger than the
// small circular page-avatar icon next to the page name on the same card —
// there's no stable class name to select "the creative" by (Meta's class
// names are generated and shift across deploys), so on-screen width is the
// most durable signal available from outside the page. Picked empirically
// against real result pages during manual testing; if Meta reflows the
// results grid layout, this is the first constant to re-check.
const MIN_CREATIVE_WIDTH_PX = 150;

// Only a couple of Facebook page URL shapes reliably carry a numeric page
// ID we can trust without resolving a vanity name first (which would need
// a login-walled Graph API call this script deliberately doesn't attempt —
// see the module comment on why this stays web-UI-only). Anything else (a
// plain facebook.com/<vanity-name> link) falls back to the keyword search
// below instead of guessing at an ID.
function extractNumericPageId(sourceLink: string | null): string | null {
  if (!sourceLink) return null;
  let url: URL;
  try {
    url = new URL(sourceLink);
  } catch {
    return null; // not a valid URL at all — caller falls back to name search
  }
  if (!/(^|\.)facebook\.com$/.test(url.hostname)) return null;

  const idParam = url.searchParams.get("id");
  if (idParam && /^\d+$/.test(idParam)) return idParam;

  const pathMatch = url.pathname.match(/^\/(\d{6,})\/?$/);
  if (pathMatch) return pathMatch[1];

  return null;
}

function buildSearchUrl(opts: { pageId: string | null; query: string }): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "TH",
    media_type: "image",
    search_type: "keyword_unordered",
  });
  if (opts.pageId) {
    // Scopes results to exactly this page's ads — no query needed, and
    // more precise than any text search (see findLeadImageUrls below for
    // why this is preferred whenever available).
    params.set("view_all_page_id", opts.pageId);
  } else {
    params.set("q", opts.query);
  }
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

// Pulls up to `limit` distinct, large-enough <img> src URLs straight off
// the search results grid, rather than opening each ad's detail modal one
// at a time — the results grid already renders full-size creative <img>
// tags with real fbcdn.net URLs once it finishes its (lazy) initial load,
// which manual testing found just as reliable and considerably faster than
// clicking into every card individually.
async function extractCreativeImageUrls(browser: Browser, url: string, limit: number): Promise<string[]> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(AD_LIBRARY_UA);
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    // The results grid populates asynchronously after the initial paint
    // (same lazy-render behavior observed during manual testing) — give it
    // a moment rather than racing the DOM query against it.
    await page.waitForSelector("img", { timeout: 15000 }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const urls: string[] = await page.evaluate((minWidth: number) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const el = img as HTMLImageElement;
        if (!el.src || !/fbcdn\.net/.test(el.src)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < minWidth) continue; // skips page-avatar icons
        if (seen.has(el.src)) continue;
        seen.add(el.src);
        out.push(el.src);
      }
      return out;
    }, MIN_CREATIVE_WIDTH_PX);

    return urls.slice(0, limit);
  } finally {
    await page.close();
  }
}

// Public entry point: find up to 3 direct image URLs for one Hunter lead.
// Prefers an exact page match (source_link with a resolvable numeric page
// ID) over a free-text name search — a text search over a common word like
// "คลินิก" can return hundreds of results and match the wrong clinic, while
// a page-ID-scoped search only ever returns that exact page's own ads.
// Falls back to searching by clinic_name whenever no usable page ID is
// available, per explicit product decision (2026-08-31).
//
// Never throws — a lead this can't find anything for should stay
// 'awaiting_images' for the next scheduled run or a human to pick up, not
// abort the whole batch job (see scripts/hunterAutoFillJob.ts).
export async function findLeadImageUrls(browser: Browser, lead: HunterLeadForSearch): Promise<string[]> {
  const pageId = extractNumericPageId(lead.source_link);
  const url = buildSearchUrl({ pageId, query: lead.clinic_name });
  try {
    return await extractCreativeImageUrls(browser, url, 3);
  } catch (e) {
    console.error(`findLeadImageUrls failed for "${lead.clinic_name}" (${url}):`, e);
    return [];
  }
}
