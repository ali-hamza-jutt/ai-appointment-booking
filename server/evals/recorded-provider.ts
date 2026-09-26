import { readFileSync, writeFileSync } from "node:fs";

import type {
  AiAgentMessage,
  AiProvider,
  AiProviderName,
  AiToolCompletionRequest,
  AiToolCompletionResponse,
} from "../src/integrations/ai/dto/ai.dto.js";
import { readSlotToken } from "../src/utils/slot-token.js";

/**
 * One model reply, stored with placeholders instead of ids and tokens so a
 * recording replays against a freshly seeded database:
 *   {{service:Haircut}}  {{staff:Omar}}  {{booking:<ISO start>}}  {{slot:<ISO start>}}
 */
export type RecordedStep =
  | { toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> }
  | { content: string };

export type Recordings = Record<string, RecordedStep[]>;

/** Maps between real ids and the names used in recordings. */
export interface SymbolTable {
  businessId: string;
  now: Date;
  services: Map<string, string>;
  staff: Map<string, string>;
  /** The customer's bookings by ISO start. */
  bookings: Map<string, string>;
}

const PLACEHOLDER = /^\{\{(service|staff|booking|slot):(.+)\}\}$/;

export function loadRecordings(path: string): Recordings {
  return JSON.parse(readFileSync(path, "utf8")) as Recordings;
}

export function saveRecordings(path: string, recordings: Recordings): void {
  writeFileSync(path, `${JSON.stringify(recordings, null, 2)}\n`);
}

/** Every slot token visible to the model: tool results and offers in earlier replies. */
function visibleTokens(messages: AiAgentMessage[]): string[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") return [...message.content.matchAll(/"slotToken":"([^"]+)"/g)].map((m) => m[1] as string);
    if (message.role === "assistant") return [...message.content.matchAll(/token=([^;\]\s]+)/g)].map((m) => m[1] as string);

    return [];
  });
}

function mapStrings(value: unknown, transform: (text: string) => string): unknown {
  if (typeof value === "string") return transform(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, transform));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]));
  }

  return value;
}

/** Fills placeholders with this run's ids and with tokens the model was actually shown. */
export function resolvePlaceholders(value: unknown, symbols: SymbolTable, messages: AiAgentMessage[]): unknown {
  return mapStrings(value, (text) => {
    const match = PLACEHOLDER.exec(text);

    if (!match) return text;

    const [, kind, key] = match as unknown as [string, string, string];

    if (kind === "service") return symbols.services.get(key) ?? text;
    if (kind === "staff") return symbols.staff.get(key) ?? text;
    if (kind === "booking") return symbols.bookings.get(key) ?? text;

    const target = new Date(key).getTime();
    const token = visibleTokens(messages)
      .reverse()
      .find((candidate) => readSlotToken(candidate, symbols.businessId, symbols.now)?.startsAt.getTime() === target);

    // An unresolvable slot stays a placeholder, which booking core rejects like any made-up token.
    return token ?? text;
  });
}

/** Replaces ids and tokens with placeholders, for saving a live reply. */
export function toPlaceholders(value: unknown, symbols: SymbolTable): unknown {
  const byId = new Map<string, string>([
    ...[...symbols.services].map(([name, id]) => [id, `{{service:${name}}}`] as const),
    ...[...symbols.staff].map(([name, id]) => [id, `{{staff:${name}}}`] as const),
    ...[...symbols.bookings].map(([start, id]) => [id, `{{booking:${start}}}`] as const),
  ]);

  return mapStrings(value, (text) => {
    const known = byId.get(text);

    if (known) return known;

    const slot = readSlotToken(text, symbols.businessId, symbols.now);

    return slot ? `{{slot:${slot.startsAt.toISOString()}}}` : text;
  });
}

/**
 * Replays a case's recorded replies in order, or (live) calls the real
 * provider and keeps each reply in placeholder form for re-recording.
 */
export class RecordedProvider implements AiProvider {
  public readonly name: AiProviderName = "mistral";
  public readonly model: string;
  public readonly captured: RecordedStep[] = [];
  private cursor = 0;

  public constructor(
    private readonly caseId: string,
    private readonly recorded: RecordedStep[] | undefined,
    private readonly symbols: SymbolTable,
    private readonly live: AiProvider | null,
  ) {
    this.model = live?.model ?? "recorded";
  }

  public async completeWithTools(request: AiToolCompletionRequest): Promise<AiToolCompletionResponse> {
    if (this.live) {
      const response = await this.live.completeWithTools(request);

      this.captured.push(
        response.toolCalls.length > 0
          ? {
              toolCalls: response.toolCalls.map((call) => ({
                name: call.name,
                arguments: toPlaceholders(safeJson(call.arguments), this.symbols) as Record<string, unknown>,
              })),
            }
          : { content: response.content },
      );

      return response;
    }

    const step = this.recorded?.[this.cursor];

    this.cursor += 1;

    if (!step) {
      throw new Error(`No recorded reply ${this.cursor} for eval case "${this.caseId}"; run npm run eval:record`);
    }

    if ("content" in step) {
      return { content: step.content, toolCalls: [], provider: this.name, model: this.model };
    }

    return {
      content: "",
      toolCalls: step.toolCalls.map((call, index) => ({
        id: `r${String(this.cursor).padStart(4, "0")}${index}`.slice(0, 9).padEnd(9, "0"),
        name: call.name,
        arguments: JSON.stringify(resolvePlaceholders(call.arguments, this.symbols, request.messages)),
      })),
      provider: this.name,
      model: this.model,
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}
