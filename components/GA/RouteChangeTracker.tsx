"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/gtag";

// Next.js App Router changes routes client-side without a full page load,
// so gtag's own automatic page_view (fired once, on the initial script
// load -- see app/layout.tsx) never fires again on client-side navigation.
// Without this, GA4 would only ever see a single page_view per visit no
// matter how many pages someone clicks through. Mounted once, globally, in
// app/layout.tsx.
export function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

useEffect(() => {
  // Skip the very first render -- gtag's inline config call in
          // app/layout.tsx already sent a page_view for the initial load; firing
          // another one here would double-count it.
          if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
          }
  const query = searchParams.toString();
  const url = query ? pathname + "?" + query : pathname;
  trackEvent("page_view", {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  });
}, [pathname, searchParams]);

return null;
}
