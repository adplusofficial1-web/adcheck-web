import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { RouteChangeTracker } from "@/components/GA/RouteChangeTracker";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

const SITE_URL = "https://adcheck.pro";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: { google: "4w5M9850QWhXdFGPMZPYfKAHbp84U5EEUUujIKnXL-k" },
  title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
  description: "อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
  // Site-wide fallback so any page that doesn't set its own openGraph/
  // twitter block still gets a real title/description/image when shared —
  // e.g. into the Facebook clinic-owner groups the marketing plan targets
  // — instead of the blank/generic preview it gets today.
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "AdCheck",
    title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
    description: "อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
    description: "อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
  },
};

// SoftwareApplication schema, not "รับรองโดยภาครัฐ" — AdCheck is a
// screening tool, not a legal approval, per the disclaimer already shown
// on every page footer. Only verifiable facts go in here.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AdCheck",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "เครื่องมือ AI ช่วยตรวจสอบโฆษณาคลินิก/สถานพยาบาลก่อนเผยแพร่ ให้สอดคล้องกับมาตรา 38 พ.ร.บ.สถานพยาบาล และแนวทางของ สบส.",
  offers: {
    "@type": "Offer",
    price: "199",
    priceCurrency: "THB",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={prompt.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="font-sans min-h-screen">
        <Suspense fallback={null}>
                    <RouteChangeTracker />
        </Suspense>
        {children}
        {/* GA4 (Measurement ID G-0PXYV4TRYW, added in commit 279a7c9) now
                    loads from inside CookieConsent, gated on explicit consent -
                                see that file's header comment for why. */}
                <CookieConsent />
      </body>
    </html>
  );
}
