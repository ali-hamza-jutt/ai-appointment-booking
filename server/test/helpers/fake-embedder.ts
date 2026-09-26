import { createHash } from "node:crypto";

import { KNOWLEDGE_CONSTANTS } from "../../src/constants/app.constants.js";
import type { EmbeddingProvider } from "../../src/integrations/ai/providers/mistral-embedding.provider.js";

/** Words the fake treats as meaning the same thing, so "meaning" search can beat keywords. */
const CONCEPTS: Record<string, string> = {
  car: "parking",
  cars: "parking",
  park: "parking",
  vehicle: "parking",
  refund: "cancel",
  cancellation: "cancel",
  cancelling: "cancel",
};

function bucket(word: string): number {
  return createHash("sha256").update(word).digest().readUInt32BE(0) % KNOWLEDGE_CONSTANTS.EMBEDDING_DIMENSIONS;
}

/** A deterministic bag-of-words embedder with a tiny synonym table. */
export class FakeEmbedder implements EmbeddingProvider {
  public readonly model = "fake-embed";
  public readonly calls: string[][] = [];
  public failWith: Error | null = null;

  public embed(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);

    if (this.failWith) return Promise.reject(this.failWith);

    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  private vector(text: string): number[] {
    const vector = new Array<number>(KNOWLEDGE_CONSTANTS.EMBEDDING_DIMENSIONS).fill(0);

    for (const raw of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
      vector[bucket(CONCEPTS[raw] ?? raw)]! += 1;
    }

    const length = Math.hypot(...vector) || 1;

    return vector.map((value) => value / length);
  }
}
