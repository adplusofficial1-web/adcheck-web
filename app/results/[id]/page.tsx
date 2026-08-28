export const dynamic = "force-dynamic";
import { ResultsPageContent } from "@/components/results/ResultsPageContent";

// Clinic-mode entry point for the shared results UI — see
// components/results/ResultsPageContent.tsx for the actual page content
// and why `basePath` exists (Agency-mode uses
// app/agency/results/[id]/page.tsx instead, passing basePath="/agency").
export default async function ResultsPage({ params }: { params: { id: string } }) {
  return <ResultsPageContent id={params.id} basePath="" />;
}
