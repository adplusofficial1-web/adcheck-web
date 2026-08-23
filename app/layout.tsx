import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdCheck — ตรวจสอบโฆษณาคลินิกให้ถูกกฎหมายด้วย AI",
  description: "อัปโหลดภาพโฆษณา ให้ AI ตรวจตามแนวทาง สบส. ก่อนเผยแพร่จริง",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
