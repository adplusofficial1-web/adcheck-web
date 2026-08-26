export const dynamic = "force-dynamic";
import { Nav } from "@/components/Nav";
import { AboutContent } from "@/components/AboutContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

export const metadata = {
  title: "เกี่ยวกับ AdCheck",
  description:
    "เครื่องมือช่วยคัดกรองโฆษณาคลินิกด้วย AI เพื่อให้ทีมการตลาดตรวจสอบเนื้อหาให้สอดคล้องกับมาตรา 38 และแนวทาง สบส. ได้ง่ายและมั่นใจขึ้นก่อนเผยแพร่จริงทุกครั้ง",
};

export default async function AboutPage() {
  // /about stays public like /pricing (see middleware.ts) — someone can
  // read the About page before signing in, so this doesn't redirect on a
  // null business, it just renders the Nav without a credits count.
  const business = await getCurrentBusiness();

  return (
    <>
      <Nav credits={business?.credits_remaining} />
      <AboutContent uploadHref="/upload" />
    </>
  );
}
