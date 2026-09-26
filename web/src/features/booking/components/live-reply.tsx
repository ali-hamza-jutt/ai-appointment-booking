import { ChatMessageParts } from "@/features/booking/components/chat-message-parts";
import type { LiveReplyViewModel } from "@/features/booking/types/booking-ui";

function TypingDots() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      <span className="size-1.5 animate-bw-pulse rounded-full bg-current" />
      <span className="size-1.5 animate-bw-pulse rounded-full bg-current [animation-delay:120ms]" />
      <span className="size-1.5 animate-bw-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}

/**
 * The assistant's reply while it is being written: a status line while
 * tools run, then the text as it streams. Cards show but can't be tapped
 * until the reply is saved.
 */
export function LiveReply({ reply }: { reply: LiveReplyViewModel | null }) {
  const hasText = Boolean(reply?.text.trim());

  return (
    <div aria-live="polite" className="flex justify-start" role="status">
      <div className="max-w-[82%]">
        <div className="rounded-2xl rounded-bl-[5px] border border-border bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-soft">
          {hasText ? (
            <span className="whitespace-pre-line">
              {reply?.text}
              <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-bw-pulse bg-current" />
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted">
              <TypingDots />
              <span className="text-xs">{reply?.status ?? "Assistant is preparing a response"}</span>
            </span>
          )}
        </div>
        {reply?.parts.length ? <ChatMessageParts disabled onAction={() => undefined} parts={reply.parts} /> : null}
      </div>
    </div>
  );
}
