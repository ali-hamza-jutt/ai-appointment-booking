import type { Metadata } from "next";

import { ConversationsList } from "@/features/conversations/components/conversations-list";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  return <ConversationsList />;
}
