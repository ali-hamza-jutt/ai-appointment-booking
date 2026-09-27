import { describe, expect, it } from "vitest";

import { historySize, planSummary } from "../../src/modules/chat/agent/conversation-memory.js";
import { buildSummaryTranscript } from "../../src/modules/chat/agent/conversation-summary.prompt.js";
import type { ChatMessageResponse } from "../../src/modules/chat/dto/chat.dto.js";

// The default: 12 history messages plus the one being answered.
const WINDOW = 13;

describe("planSummary", () => {
  it("leaves chats of 20 messages or fewer alone", () => {
    expect(planSummary(20, 0, WINDOW)).toBeNull();
  });

  it("starts the summary once the chat passes 20 messages", () => {
    expect(planSummary(21, 0, WINDOW)).toEqual({ from: 0, to: 8 });
  });

  it("waits for a batch of messages to leave the window before summarizing again", () => {
    expect(planSummary(23, 8, WINDOW)).toBeNull();
    expect(planSummary(28, 8, WINDOW)).toBeNull();
    expect(planSummary(29, 8, WINDOW)).toEqual({ from: 8, to: 16 });
  });

  it("folds at most 40 messages into one summary", () => {
    expect(planSummary(200, 0, WINDOW)).toEqual({ from: 0, to: 40 });
  });
});

describe("historySize", () => {
  it("uses the plain window when there is no summary", () => {
    expect(historySize(15, 0, WINDOW)).toBe(WINDOW);
  });

  it("sends every message the summary does not cover", () => {
    expect(historySize(21, 8, WINDOW)).toBe(13);
    expect(historySize(27, 8, WINDOW)).toBe(19);
  });

  it("caps the history if summarizing has fallen behind", () => {
    expect(historySize(120, 8, WINDOW)).toBe(21);
  });

  it("never leaves a gap between the summary and the history", () => {
    for (let count = 21; count <= 80; count += 1) {
      let summarized = 0;

      for (let at = 21; at <= count; at += 1) {
        const plan = planSummary(at, summarized, WINDOW);

        if (plan) summarized = plan.to;
      }

      expect(summarized + historySize(count, summarized, WINDOW)).toBeGreaterThanOrEqual(count);
    }
  });
});

describe("buildSummaryTranscript", () => {
  function message(role: ChatMessageResponse["role"], content: string): ChatMessageResponse {
    return {
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      clientMessageId: null,
      replyToMessageId: null,
      role,
      content,
      structuredData: null,
      createdAt: new Date(),
    } as ChatMessageResponse;
  }

  it("labels speakers, skips system notes and carries the previous summary", () => {
    const transcript = buildSummaryTranscript("Wants a haircut.", [
      message("USER", "Friday   please"),
      message("SYSTEM", "internal"),
      message("ASSISTANT", "Friday is open at 10."),
    ]);

    expect(transcript).toBe(
      "Summary so far: Wants a haircut.\n\nNew messages:\nCustomer: Friday please\nAssistant: Friday is open at 10.",
    );
  });
});
