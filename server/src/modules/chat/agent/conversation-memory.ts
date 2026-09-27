import { logger } from "../../../config/logger.js";
import { AI_CONSTANTS, CHAT_MEMORY_CONSTANTS } from "../../../constants/app.constants.js";
import type { AiProvider } from "../../../integrations/ai/dto/ai.dto.js";
import { chatService } from "../chat.service.js";
import type { ChatMessageResponse } from "../dto/chat.dto.js";
import {
  buildConversationSummaryPrompt,
  buildSummaryTranscript,
} from "./conversation-summary.prompt.js";

/** Messages to fold into the summary, by position: [from, to). */
export interface SummaryPlan {
  from: number;
  to: number;
}

/**
 * Whether this turn should grow the summary, and over which messages.
 * `window` is how many recent messages the agent sees word for word.
 * The first summary starts once the chat passes the threshold; later ones
 * wait until a batch of messages has left the window, so the model is
 * called every few turns rather than every turn.
 */
export function planSummary(messageCount: number, summarizedCount: number, window: number): SummaryPlan | null {
  if (messageCount <= CHAT_MEMORY_CONSTANTS.SUMMARY_THRESHOLD_MESSAGES) return null;

  const unsummarized = messageCount - summarizedCount;
  const due =
    summarizedCount === 0
      ? unsummarized > window
      : unsummarized >= window + CHAT_MEMORY_CONSTANTS.SUMMARY_BATCH_MESSAGES;

  if (!due) return null;

  const to = Math.min(messageCount - window, summarizedCount + CHAT_MEMORY_CONSTANTS.MAX_MESSAGES_PER_SUMMARY);

  return to > summarizedCount ? { from: summarizedCount, to } : null;
}

/**
 * How many recent messages the agent gets word for word. With a summary,
 * that is everything after it (so nothing falls between the two), capped
 * in case summarizing has fallen behind.
 */
export function historySize(messageCount: number, summarizedCount: number, window: number): number {
  if (summarizedCount === 0) return window;

  return Math.max(
    window,
    Math.min(messageCount - summarizedCount, window + CHAT_MEMORY_CONSTANTS.SUMMARY_BATCH_MESSAGES),
  );
}

export interface ConversationMemoryRequest {
  userId: string;
  sessionId: string;
  businessId: string;
  businessName: string;
  /** Called before the model is asked for a new summary. */
  onSummarizing?: () => void;
}

export interface ConversationMemoryResult {
  /** The rolling summary of messages older than the history, if the chat is long. */
  summary: string | null;
  /** Recent messages, oldest first, including the current one. */
  history: ChatMessageResponse[];
}

/**
 * Gives the agent a long chat's memory: recent messages word for word, and
 * a model-written summary of the rest. The summary is context only; it is
 * never turned into preferences or bookings.
 */
export class ConversationMemory {
  public constructor(
    private readonly provider: AiProvider | null,
    private readonly window: number,
  ) {}

  public async load(request: ConversationMemoryRequest): Promise<ConversationMemoryResult> {
    const state = await chatService.getMemoryState(request.userId, request.sessionId);
    let summary = state.summary;
    let summarizedCount = state.summarizedCount;
    const plan = this.provider ? planSummary(state.messageCount, summarizedCount, this.window) : null;

    if (plan) {
      request.onSummarizing?.();

      const next = await this.summarize(request, summary, plan);
      const saved =
        next !== null &&
        (await chatService.saveSummary({
          userId: request.userId,
          sessionId: request.sessionId,
          summary: next,
          summarizedCount: plan.to,
          previousCount: plan.from,
        }));

      if (saved) {
        summary = next;
        summarizedCount = plan.to;
      }
    }

    const history = await chatService.listRecentMessages(
      request.userId,
      request.sessionId,
      historySize(state.messageCount, summarizedCount, this.window),
    );

    return { summary, history };
  }

  /** A new summary, or null to carry on with the old one if the model fails. */
  private async summarize(
    request: ConversationMemoryRequest,
    previousSummary: string | null,
    plan: SummaryPlan,
  ): Promise<string | null> {
    if (!this.provider) return null;

    const messages = await chatService.listMessageRange(
      request.userId,
      request.sessionId,
      plan.from,
      plan.to - plan.from,
    );

    try {
      const response = await this.provider.completeWithTools({
        systemPrompt: buildConversationSummaryPrompt(request.businessName),
        messages: [{ role: "user", content: buildSummaryTranscript(previousSummary, messages) }],
        tools: [],
        toolChoice: "none",
        maxOutputTokens: CHAT_MEMORY_CONSTANTS.MAX_SUMMARY_OUTPUT_TOKENS,
        temperature: AI_CONSTANTS.TEMPERATURE,
        businessId: request.businessId,
      });
      const text = response.content.trim();

      return text ? text.slice(0, CHAT_MEMORY_CONSTANTS.MAX_SUMMARY_CHARS) : null;
    } catch (error) {
      logger.warn(
        { err: error, sessionId: request.sessionId },
        "Chat summary failed; continuing with the previous one",
      );

      return null;
    }
  }
}
