import { describe, expect, it } from "vitest";

import { KNOWLEDGE_CONSTANTS } from "../../src/constants/app.constants.js";
import { chunkText, estimateTokens } from "../../src/modules/knowledge/chunker.js";

const TARGET_CHARS = KNOWLEDGE_CONSTANTS.CHUNK_TARGET_TOKENS * KNOWLEDGE_CONSTANTS.CHARS_PER_TOKEN;

function sentence(index: number): string {
  return `Sentence number ${index} explains one small part of the cancellation policy.`;
}

describe("chunkText", () => {
  it("keeps short text in one chunk", () => {
    const chunks = chunkText("## Parking\n\nFree parking behind the salon.");

    expect(chunks).toEqual([
      { position: 0, content: "## Parking\n\nFree parking behind the salon.", tokenCount: estimateTokens("## Parking\n\nFree parking behind the salon.") },
    ]);
  });

  it("splits long text into ordered chunks near the target size", () => {
    const paragraphs = Array.from({ length: 40 }, (_, index) =>
      Array.from({ length: 4 }, (__, offset) => sentence(index * 4 + offset)).join(" "),
    );
    const chunks = chunkText(paragraphs.join("\n\n"));

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(TARGET_CHARS + 400);
      expect(chunk.tokenCount).toBe(estimateTokens(chunk.content));
    }
  });

  it("carries a little of each chunk into the next for context", () => {
    const paragraphs = Array.from({ length: 30 }, (_, index) => sentence(index));
    const chunks = chunkText(paragraphs.join("\n\n"));
    const secondStart = chunks[1]?.content.split("\n\n")[0] ?? "";

    expect(chunks[0]?.content).toContain(secondStart);
  });

  it("splits a single huge paragraph at sentence ends", () => {
    const paragraph = Array.from({ length: 80 }, (_, index) => sentence(index)).join(" ");
    const chunks = chunkText(paragraph);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content.endsWith(".")).toBe(true);
  });

  it("ignores blank input", () => {
    expect(chunkText("  \n\n \r\n ")).toEqual([]);
  });
});
