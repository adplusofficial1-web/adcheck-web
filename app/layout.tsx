import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
  description: "อัพโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={prompt.variable}>
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
