import type { Metadata } from "next";

import { HandoffsView } from "@/features/chat-handoffs/components/handoffs-view";

export const metadata: Metadata = { title: "Chat handoffs" };

export default function HandoffsPage() {
  return <HandoffsView />;
}
