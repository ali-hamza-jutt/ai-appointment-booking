import type { AiProviderErrorCode } from "../dto/ai.dto.js";

export class AiProviderError extends Error {
  public readonly statusCode: number | undefined;

  public constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
    this.statusCode = statusCode;
  }
}
