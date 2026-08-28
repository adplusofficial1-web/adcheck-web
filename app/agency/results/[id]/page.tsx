export const dynamic = "force-dynamic";
import { ResultsPageContent } from "@/components/results/ResultsPageContent";

// Agency-mode twin of app/results/[id]/page.tsx — lives under /agency/...
// so components/Nav.tsx's path-prefix check keeps Agency-mode chrome
// instead of dropping back to Clinic-mode chrome. Part of the bug audit #5
// fix: the whole upload → processing → results pipeline previously had no
// /agency/* twin at all, so every Agency-mode upload ended by silently
// flipping the UI back to Clinic-mode right as the results screen loaded.
export default async function AgencyResultsPage({ params }: { params: { id: string } }) {
  return <ResultsPageContent id={params.id} basePath="/agency" />;
}
