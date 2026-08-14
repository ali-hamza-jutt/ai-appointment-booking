import Link from "next/link";

import { ArrowRightIcon, ChatIcon, ConversationsIcon } from "@/components/ui/icons";
import { conversationPreviews } from "@/features/conversations/data/conversation-preview-data";
import { cn } from "@/lib/utils/cn";

export function ConversationsList() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">Conversation history</h2>
        <p className="mt-1 text-sm text-muted">Return to earlier booking conversations and their outcomes.</p>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        {conversationPreviews.map((conversation, index) => (
          <Link
            className={cn(
              "group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-subtle sm:px-5",
              index < conversationPreviews.length - 1 && "border-b border-border",
            )}
            href={`/conversations/${conversation.id}`}
            key={conversation.id}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <ChatIcon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="truncate text-sm font-semibold text-ink group-hover:text-brand">
                  {conversation.title}
                </span>
                <span className="shrink-0 text-[11px] text-subtle">{conversation.dateLabel}</span>
              </span>
              <span className="mt-1 block truncate text-xs text-muted">{conversation.preview}</span>
              <span className="mt-1.5 block text-[11px] font-medium text-brand">{conversation.statusLabel}</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-subtle group-hover:text-brand" />
          </Link>
        ))}
      </section>

      {conversationPreviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <ConversationsIcon className="mx-auto size-8 text-subtle" />
          <h3 className="mt-4 text-sm font-semibold text-ink">No conversations yet</h3>
        </div>
      ) : null}
    </div>
  );
}
