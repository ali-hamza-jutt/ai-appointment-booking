import Link from "next/link";

import { ArrowLeftIcon, CheckCircleIcon, SparklesIcon, UserIcon } from "@/components/ui/icons";
import type { ConversationViewModel } from "@/features/conversations/types/conversation-ui";

export function ConversationDetail({ conversation }: { conversation: ConversationViewModel }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink" href="/conversations">
        <ArrowLeftIcon className="size-4" />
        Back to conversations
      </Link>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-start gap-3 border-b border-border p-5 sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{conversation.title}</h2>
            <p className="mt-1 text-xs text-muted">{conversation.dateLabel}</p>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          {conversation.messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div className={isUser ? "flex justify-end gap-2" : "flex justify-start gap-2"} key={message.id}>
                {!isUser ? (
                  <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <SparklesIcon className="size-3.5" />
                  </span>
                ) : null}
                <div className={isUser ? "max-w-[82%] text-right" : "max-w-[82%]"}>
                  <div
                    className={
                      isUser
                        ? "rounded-2xl rounded-br-[5px] bg-brand px-4 py-3 text-left text-sm leading-6 text-surface"
                        : "rounded-2xl rounded-bl-[5px] bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-soft"
                    }
                  >
                    {message.text}
                  </div>
                  <p className="mt-1 text-[10px] text-subtle">{message.time}</p>
                </div>
                {isUser ? (
                  <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
                    <UserIcon className="size-3.5" />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-success-soft px-5 py-3 text-xs font-semibold text-success-strong sm:px-6">
          <CheckCircleIcon className="size-4" />
          {conversation.statusLabel}
        </footer>
      </section>
    </div>
  );
}
