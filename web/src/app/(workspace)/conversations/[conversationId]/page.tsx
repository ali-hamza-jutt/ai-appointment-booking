import type { Metadata } from "next";

import { ConversationDetail } from "@/features/conversations/components/conversation-detail";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return <ConversationDetail sessionId={conversationId} />;
}
