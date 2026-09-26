import type { Metadata } from "next";

import { KnowledgeView } from "@/features/knowledge/components/knowledge-view";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  return <KnowledgeView />;
}
