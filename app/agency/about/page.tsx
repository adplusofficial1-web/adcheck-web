export const dynamic = "force-dynamic";
import { Nav } from "@/components/Nav";
import { AboutContent } from "@/components/AboutContent";
import { getCurrentBusiness } from "@/lib/currentBusiness";

// Agency-mode twin of app/about/page.tsx — lives under /agency/... so
// components/Nav.tsx's path-prefix check keeps Agency-mode chrome instead
// of dropping back to Clinic-mode chrome (same reason app/agency/articles
// and app/agency/pricing exist). Renders the exact same AboutContent
// component, so there are two routes but one shared implementation.
//
// SEO: canonical back to /about — identical content, don't split ranking
// signal across two URLs.
export const metadata = {
  title: "เกี่ยวกับ AdCheck",
  description:
    "เครื่องมือช่วยคัดกรองโฆษณาคลินิกด้วย AI เพื่อให้ทีมการตลาดตรวจสอบเนื้อหาให้สอดคล้องกับมาตรา 38 และแนวทาง สบส. ได้ง่ายและมั่นใจขึ้นก่อนเผยแพร่จริงทุกครั้ง",
  alternates: {
    canonical: "/about",
  },
};

export default async function AgencyAboutPage() {
  const business = await getCurrentBusiness();

  return (
    <>
      <Nav credits={business?.credits_remaining} />
      <AboutContent uploadHref="/agency/dashboard" />
    </>
  );
}
