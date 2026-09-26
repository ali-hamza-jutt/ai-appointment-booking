import { KNOWLEDGE_CONSTANTS } from "../../constants/app.constants.js";

export interface KnowledgeTextChunk {
  position: number;
  content: string;
  tokenCount: number;
}

const TARGET_CHARS = KNOWLEDGE_CONSTANTS.CHUNK_TARGET_TOKENS * KNOWLEDGE_CONSTANTS.CHARS_PER_TOKEN;
const OVERLAP_CHARS = KNOWLEDGE_CONSTANTS.CHUNK_OVERLAP_TOKENS * KNOWLEDGE_CONSTANTS.CHARS_PER_TOKEN;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / KNOWLEDGE_CONSTANTS.CHARS_PER_TOKEN));
}

/** Splits an over-long paragraph at sentence ends, then at spaces if a sentence is huge. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= TARGET_CHARS) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > TARGET_CHARS) {
      if (current) pieces.push(current.trim());
      current = "";

      for (let start = 0; start < sentence.length; start += TARGET_CHARS) {
        pieces.push(sentence.slice(start, start + TARGET_CHARS).trim());
      }
      continue;
    }

    if (current.length + sentence.length > TARGET_CHARS && current) {
      pieces.push(current.trim());
      current = "";
    }

    current += sentence;
  }

  if (current.trim()) pieces.push(current.trim());

  return pieces;
}

/** The end of a chunk, cut at a word boundary, carried into the next for context. */
function overlapTail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return "";

  const tail = text.slice(-OVERLAP_CHARS);
  const firstSpace = tail.indexOf(" ");

  return firstSpace >= 0 ? tail.slice(firstSpace + 1) : tail;
}

/**
 * Splits text into passages of about CHUNK_TARGET_TOKENS, keeping paragraphs
 * (and headings with what follows them) together where possible.
 */
export function chunkText(text: string): KnowledgeTextChunk[] {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap(splitLong);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > TARGET_CHARS) {
      chunks.push(current);
      current = overlapTail(current);
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current.trim()) chunks.push(current);

  return chunks.map((content, position) => ({ position, content, tokenCount: estimateTokens(content) }));
}
