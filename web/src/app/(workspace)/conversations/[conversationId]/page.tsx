import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConversationDetail } from "@/features/conversations/components/conversation-detail";
import { findConversationPreview } from "@/features/conversations/data/conversation-preview-data";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const conversation = findConversationPreview(conversationId);

  if (!conversation) notFound();

  return <ConversationDetail conversation={conversation} />;
}
