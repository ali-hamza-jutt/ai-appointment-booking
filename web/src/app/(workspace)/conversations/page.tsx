import type { Metadata } from "next";
import { Suspense } from "react";

import { ConversationsList } from "@/features/conversations/components/conversations-list";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <ConversationsList />
    </Suspense>
  );
}
