import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { RouteChangeTracker } from "@/components/GA/RouteChangeTracker";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
  description: "อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={prompt.variable}>
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-0PXYV4TRYW" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-0PXYV4TRYW');`}
        </Script>
      </head>
      <body className="font-sans min-h-screen">
        <Suspense fallback={null}>
          <RouteChangeTracker />
        </Suspense>
        {children}</body>
    </html>
    );
}
