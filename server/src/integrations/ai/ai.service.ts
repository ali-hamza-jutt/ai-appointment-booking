import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  AI_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { normalizeIanaTimeZone } from "../../utils/time-zone.js";
import type {
  AiAppointmentContext,
  AiBookingField,
  AiConversationMessage,
  AiProvider,
  AppointmentExtractionResult,
  ExtractAppointmentRequest,
} from "./dto/ai.dto.js";
import {
  aiAppointmentContextSchema,
  aiConversationMessageSchema,
  appointmentExtractionOutputSchema,
} from "./dto/ai.dto.js";
import { AiProviderError } from "./errors/ai-provider.error.js";
import {
  buildAppointmentExtractionPrompt,
  buildFallbackClarificationQuestion,
} from "./prompts/appointment-extraction.prompt.js";
import { MistralProvider } from "./providers/mistral.provider.js";

export class AiService {
  public constructor(
    private readonly provider: AiProvider | null,
    private readonly maxHistoryMessages: number,
  ) {}

  public async extractAppointmentDetails(
    request: ExtractAppointmentRequest,
  ): Promise<AppointmentExtractionResult> {
    if (!this.provider) {
      throw new AppError(
        503,
        ERROR_CODES.AI_NOT_CONFIGURED,
        ERROR_MESSAGES.AI_NOT_CONFIGURED,
      );
    }

    const userMessage = this.validateUserMessage(request.userMessage);
    const conversationHistory = this.validateConversationHistory(
      request.conversationHistory ?? [],
    );
    const appointmentContext = this.validateAppointmentContext(
      request.appointmentContext,
    );
    const timeZone = this.validateTimeZone(request.timeZone);
    const currentDateTime = this.validateCurrentDateTime(
      request.currentDateTime ?? new Date(),
    );
    const startedAt = Date.now();

    try {
      const completion = await this.provider.completeJson({
        systemPrompt: buildAppointmentExtractionPrompt(
          currentDateTime,
          timeZone,
          appointmentContext,
        ),
        messages: [
          ...conversationHistory,
          { role: "user", content: userMessage },
        ],
        maxOutputTokens: AI_CONSTANTS.MAX_OUTPUT_TOKENS,
        temperature: AI_CONSTANTS.TEMPERATURE,
      });
      const result = this.parseExtraction(completion.content, currentDateTime);

      logger.info(
        {
          provider: completion.provider,
          model: completion.model,
          latencyMs: Date.now() - startedAt,
          ...(completion.usage ? { usage: completion.usage } : {}),
          ...(completion.finishReason !== undefined
            ? { finishReason: completion.finishReason }
            : {}),
        },
        "AI appointment extraction completed",
      );

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;

      if (error instanceof AiProviderError) {
        logger.warn(
          {
            provider: this.provider.name,
            model: this.provider.model,
            latencyMs,
            errorCode: error.code,
            ...(error.statusCode !== undefined
              ? { providerStatusCode: error.statusCode }
              : {}),
          },
          "AI appointment extraction failed",
        );

        throw this.toAppError(error);
      }

      if (error instanceof AppError) {
        logger.warn(
          {
            provider: this.provider.name,
            model: this.provider.model,
            latencyMs,
            errorCode: error.code,
          },
          "AI appointment extraction failed",
        );
        throw error;
      }

      logger.error(
        {
          provider: this.provider.name,
          model: this.provider.model,
          latencyMs,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "Unexpected AI appointment extraction failure",
      );

      throw new AppError(
        503,
        ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
        ERROR_MESSAGES.AI_PROVIDER_UNAVAILABLE,
      );
    }
  }

  private validateUserMessage(userMessage: string): string {
    const result = aiConversationMessageSchema.safeParse({
      role: "user",
      content: userMessage,
    });

    if (!result.success) {
      throwRequestValidationError(
        "userMessage",
        VALIDATION_MESSAGES.AI_USER_MESSAGE,
      );
    }

    return result.data.content;
  }

  private validateConversationHistory(
    conversationHistory: AiConversationMessage[],
  ): AiConversationMessage[] {
    const recentHistory = conversationHistory.slice(-this.maxHistoryMessages);
    const result = aiConversationMessageSchema.array().safeParse(recentHistory);

    if (!result.success) {
      throwRequestValidationError(
        "conversationHistory",
        VALIDATION_MESSAGES.AI_CONVERSATION_HISTORY,
      );
    }

    return result.data;
  }

  private validateAppointmentContext(
    appointmentContext?: AiAppointmentContext,
  ): AiAppointmentContext | undefined {
    if (!appointmentContext) {
      return undefined;
    }

    const result = aiAppointmentContextSchema.safeParse(appointmentContext);

    if (!result.success) {
      throwRequestValidationError(
        "appointmentContext",
        VALIDATION_MESSAGES.AI_APPOINTMENT_CONTEXT,
      );
    }

    return {
      ...(result.data.serviceName
        ? { serviceName: result.data.serviceName }
        : {}),
      ...(result.data.scheduledAt
        ? { scheduledAt: result.data.scheduledAt }
        : {}),
      ...(result.data.durationMinutes !== undefined
        ? { durationMinutes: result.data.durationMinutes }
        : {}),
      ...(result.data.notes ? { notes: result.data.notes } : {}),
    };
  }

  private validateTimeZone(timeZone: string): string {
    const normalizedTimeZone = normalizeIanaTimeZone(timeZone);

    if (!normalizedTimeZone) {
      throwRequestValidationError(
        "timeZone",
        VALIDATION_MESSAGES.AI_TIME_ZONE,
      );
    }

    return normalizedTimeZone;
  }

  private validateCurrentDateTime(currentDateTime: Date): Date {
    if (
      !(currentDateTime instanceof Date) ||
      Number.isNaN(currentDateTime.getTime())
    ) {
      throwRequestValidationError(
        "currentDateTime",
        VALIDATION_MESSAGES.AI_CURRENT_DATE_TIME,
      );
    }

    return currentDateTime;
  }

  private parseExtraction(
    content: string,
    currentDateTime: Date,
  ): AppointmentExtractionResult {
    let json: unknown;

    try {
      json = JSON.parse(content);
    } catch (_error) {
      throw new AppError(
        502,
        ERROR_CODES.AI_INVALID_RESPONSE,
        ERROR_MESSAGES.AI_INVALID_RESPONSE,
      );
    }

    const parsedOutput = appointmentExtractionOutputSchema.safeParse(json);

    if (!parsedOutput.success) {
      throw new AppError(
        502,
        ERROR_CODES.AI_INVALID_RESPONSE,
        ERROR_MESSAGES.AI_INVALID_RESPONSE,
      );
    }

    const output = parsedOutput.data;
    const appointmentContext: AiAppointmentContext = {};

    if (output.serviceName) {
      appointmentContext.serviceName = output.serviceName;
    }

    if (output.scheduledAt) {
      const scheduledAt = new Date(output.scheduledAt);

      if (
        !Number.isNaN(scheduledAt.getTime()) &&
        scheduledAt.getTime() > currentDateTime.getTime()
      ) {
        appointmentContext.scheduledAt = scheduledAt;
      }
    }

    if (output.durationMinutes !== null) {
      appointmentContext.durationMinutes = output.durationMinutes;
    }

    if (output.notes) {
      appointmentContext.notes = output.notes;
    }

    const missingFields: AiBookingField[] = [];

    if (output.intent === "BOOK_APPOINTMENT") {
      for (const field of AI_CONSTANTS.REQUIRED_BOOKING_FIELDS) {
        if (!appointmentContext[field]) {
          missingFields.push(field);
        }
      }
    }

    const confirmationRequired =
      output.intent === "BOOK_APPOINTMENT" && missingFields.length === 0;
    const clarificationQuestion =
      output.intent === "BOOK_APPOINTMENT" && missingFields.length > 0
        ? (output.clarificationQuestion ??
          buildFallbackClarificationQuestion(missingFields))
        : undefined;

    return {
      intent: output.intent,
      appointmentContext,
      missingFields,
      confirmationRequired,
      ...(clarificationQuestion ? { clarificationQuestion } : {}),
      confidence: output.confidence,
    };
  }

  private toAppError(error: AiProviderError): AppError {
    if (error.code === "TIMEOUT") {
      return new AppError(
        504,
        ERROR_CODES.AI_REQUEST_TIMEOUT,
        ERROR_MESSAGES.AI_REQUEST_TIMEOUT,
      );
    }

    if (error.code === "INVALID_RESPONSE") {
      return new AppError(
        502,
        ERROR_CODES.AI_INVALID_RESPONSE,
        ERROR_MESSAGES.AI_INVALID_RESPONSE,
      );
    }

    return new AppError(
      503,
      ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      ERROR_MESSAGES.AI_PROVIDER_UNAVAILABLE,
    );
  }
}

const mistralProvider = env.MISTRAL_API_KEY
  ? new MistralProvider({
      apiKey: env.MISTRAL_API_KEY,
      model: env.MISTRAL_MODEL,
      apiUrl: env.MISTRAL_API_URL,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    })
  : null;

export const aiService = new AiService(
  mistralProvider,
  env.AI_MAX_HISTORY_MESSAGES,
);
