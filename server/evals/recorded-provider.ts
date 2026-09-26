import { readFileSync, writeFileSync } from "node:fs";

import type {
  AiProvider,
  AiProviderCompletionRequest,
  AiProviderCompletionResponse,
  AiProviderName,
} from "../src/integrations/ai/dto/ai.dto.js";

export type Recordings = Record<string, string[]>;

export function loadRecordings(path: string): Recordings {
  return JSON.parse(readFileSync(path, "utf8")) as Recordings;
}

export function saveRecordings(path: string, recordings: Recordings): void {
  writeFileSync(path, `${JSON.stringify(recordings, null, 2)}\n`);
}

/**
 * Replays recorded model replies for one eval case, in call order, so the
 * whole pipeline (prompt, parsing, catalog, availability, hold) runs
 * without a network call. With `live`, calls go to the real provider and
 * the replies are captured for re-recording.
 */
export class RecordedProvider implements AiProvider {
  public readonly name: AiProviderName = "mistral";
  public readonly model: string;
  public readonly captured: string[] = [];
  private cursor = 0;

  public constructor(
    private readonly caseId: string,
    private readonly recorded: string[] | undefined,
    private readonly live: AiProvider | null,
  ) {
    this.model = live?.model ?? "recorded";
  }

  public async completeJson(request: AiProviderCompletionRequest): Promise<AiProviderCompletionResponse> {
    if (this.live) {
      const response = await this.live.completeJson(request);

      this.captured.push(response.content);

      return response;
    }

    const content = this.recorded?.[this.cursor];

    this.cursor += 1;

    if (content === undefined) {
      throw new Error(`No recorded reply ${this.cursor} for eval case "${this.caseId}"; run npm run eval:record`);
    }

    return { content, provider: this.name, model: this.model };
  }
}
