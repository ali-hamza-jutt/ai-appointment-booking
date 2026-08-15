import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  AI_CONSTANTS,
  APPOINTMENT_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { normalizeWhitespace } from "../../utils/text.js";
import {
  getLocalDateTimeValues,
  localDateTimeToUtc,
  normalizeIanaTimeZone,
} from "../../utils/time-zone.js";
import type {
  AiAppointmentContext,
  AiAppointmentIntent,
  AiBookingField,
  AiBookingIssue,
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
    const explicitServiceName = this.extractExplicitServiceNameChange(
      userMessage,
      appointmentContext,
    );
    const localIntent = this.classifyLocalIntent(userMessage);

    if (localIntent) {
      return {
        intent: localIntent,
        appointmentContext: appointmentContext ?? {},
        missingFields: [],
        confirmationRequired: false,
        confidence: 1,
      };
    }

    if (!this.provider) {
      throw new AppError(
        503,
        ERROR_CODES.AI_NOT_CONFIGURED,
        ERROR_MESSAGES.AI_NOT_CONFIGURED,
      );
    }

    const startedAt = Date.now();

    for (
      let attempt = 1;
      attempt <= AI_CONSTANTS.MAX_COMPLETION_ATTEMPTS;
      attempt += 1
    ) {
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
        const result = this.parseExtraction(
          completion.content,
          currentDateTime,
          timeZone,
          appointmentContext,
          explicitServiceName,
          userMessage,
        );

        logger.info(
          {
            provider: completion.provider,
            model: completion.model,
            attempt,
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
        const shouldRetry =
          attempt < AI_CONSTANTS.MAX_COMPLETION_ATTEMPTS &&
          this.isRetryableCompletionError(error);

        if (shouldRetry) {
          logger.warn(
            {
              provider: this.provider.name,
              model: this.provider.model,
              attempt,
              errorCode: this.getCompletionErrorCode(error),
            },
            "Retrying AI appointment extraction",
          );
          continue;
        }

        this.throwCompletionError(error, startedAt, attempt);
      }
    }

    throw new AppError(
      503,
      ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      ERROR_MESSAGES.AI_PROVIDER_UNAVAILABLE,
    );
  }

  private classifyLocalIntent(
    userMessage: string,
  ): Exclude<AiAppointmentIntent, "BOOK_APPOINTMENT" | "OUT_OF_SCOPE"> | undefined {
    if (AI_CONSTANTS.PURE_GREETING_PATTERN.test(userMessage)) {
      return "GREETING";
    }

    if (AI_CONSTANTS.BOOKING_HELP_PATTERN.test(userMessage)) {
      return "BOOKING_HELP";
    }

    if (AI_CONSTANTS.MANAGE_APPOINTMENT_PATTERN.test(userMessage)) {
      return "MANAGE_APPOINTMENT";
    }

    return undefined;
  }

  private isRetryableCompletionError(error: unknown): boolean {
    if (error instanceof AiProviderError) {
      if (
        error.code === "TIMEOUT" ||
        error.code === "NETWORK_ERROR" ||
        error.code === "INVALID_RESPONSE"
      ) {
        return true;
      }

      return (
        error.code === "HTTP_ERROR" &&
        (error.statusCode === 408 ||
          (error.statusCode !== undefined && error.statusCode >= 500))
      );
    }

    return (
      error instanceof AppError &&
      error.code === ERROR_CODES.AI_INVALID_RESPONSE
    );
  }

  private getCompletionErrorCode(error: unknown): string {
    if (error instanceof AiProviderError || error instanceof AppError) {
      return error.code;
    }

    return "UNEXPECTED_ERROR";
  }

  private throwCompletionError(
    error: unknown,
    startedAt: number,
    attempt: number,
  ): never {
    const provider = this.provider?.name ?? AI_CONSTANTS.PROVIDER;
    const model = this.provider?.model ?? env.MISTRAL_MODEL;
    const latencyMs = Date.now() - startedAt;

    if (error instanceof AiProviderError) {
      logger.warn(
        {
          provider,
          model,
          attempt,
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
          provider,
          model,
          attempt,
          latencyMs,
          errorCode: error.code,
        },
        "AI appointment extraction failed",
      );
      throw error;
    }

    logger.error(
      {
        provider,
        model,
        attempt,
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

  private extractExplicitServiceNameChange(
    userMessage: string,
    previousContext?: AiAppointmentContext,
  ): string | undefined {
    if (!previousContext?.serviceName) {
      return undefined;
    }

    const match = AI_CONSTANTS.EXPLICIT_SERVICE_CHANGE_PATTERN.exec(userMessage);
    const serviceName = normalizeWhitespace(
      (match?.[1] ?? "").replace(
        AI_CONSTANTS.SERVICE_CHANGE_TRAILING_DETAILS_PATTERN,
        "",
      ),
    );

    if (
      serviceName.length < APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH ||
      serviceName.length > APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH
    ) {
      return undefined;
    }

    return serviceName;
  }

  private parseExtraction(
    content: string,
    currentDateTime: Date,
    timeZone: string,
    previousContext?: AiAppointmentContext,
    explicitServiceName?: string,
    userMessage = "",
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
    const shouldClearServiceName =
      AI_CONSTANTS.CLEAR_SERVICE_PATTERN.test(userMessage);
    const shouldClearSchedule =
      AI_CONSTANTS.CLEAR_SCHEDULE_PATTERN.test(userMessage);
    const shouldClearNotes = AI_CONSTANTS.CLEAR_NOTES_PATTERN.test(userMessage);
    const shouldUseDefaultDuration =
      AI_CONSTANTS.DEFAULT_DURATION_PATTERN.test(userMessage);
    const hasExplicitContextChange =
      Boolean(explicitServiceName) ||
      shouldClearServiceName ||
      shouldClearSchedule ||
      shouldClearNotes ||
      shouldUseDefaultDuration;
    const intent = hasExplicitContextChange
      ? "BOOK_APPOINTMENT"
      : output.intent;
    const appointmentContext: AiAppointmentContext = {};
    const serviceName = shouldClearServiceName
      ? undefined
      : (explicitServiceName ??
        output.serviceName ??
        previousContext?.serviceName);

    if (serviceName) {
      appointmentContext.serviceName = serviceName;
    }

    let bookingIssue: AiBookingIssue | undefined;

    if (!shouldClearSchedule) {
      const previousLocalDateTime = previousContext?.scheduledAt
        ? getLocalDateTimeValues(previousContext.scheduledAt, timeZone)
        : null;
      const scheduledDate =
        output.scheduledDate ?? previousLocalDateTime?.date;
      const scheduledTime =
        output.scheduledTime ?? previousLocalDateTime?.time;

      if (scheduledDate && scheduledTime) {
        const scheduledAt = localDateTimeToUtc(
          scheduledDate,
          scheduledTime,
          timeZone,
        );

        if (!scheduledAt) {
          bookingIssue = "INVALID_TIME";
        } else if (scheduledAt.getTime() <= currentDateTime.getTime()) {
          bookingIssue = "PAST_TIME";
        } else {
          appointmentContext.scheduledAt = scheduledAt;
        }
      }
    }

    if (!shouldUseDefaultDuration) {
      const durationMinutes =
        output.durationMinutes ?? previousContext?.durationMinutes;

      if (durationMinutes !== undefined) {
        appointmentContext.durationMinutes = durationMinutes;
      }
    }

    if (!shouldClearNotes) {
      const notes = output.notes?.trim() || previousContext?.notes;

      if (notes) {
        appointmentContext.notes = notes;
      }
    }

    const missingFields: AiBookingField[] = [];

    if (intent === "BOOK_APPOINTMENT") {
      for (const field of AI_CONSTANTS.REQUIRED_BOOKING_FIELDS) {
        if (!appointmentContext[field]) {
          missingFields.push(field);
        }
      }
    }

    const confirmationRequired =
      intent === "BOOK_APPOINTMENT" && missingFields.length === 0;
    const clarificationQuestion =
      intent === "BOOK_APPOINTMENT" && missingFields.length > 0
        ? (bookingIssue === "PAST_TIME"
            ? CHAT_CONSTANTS.ASSISTANT_MESSAGES.PAST_TIME
            : bookingIssue === "INVALID_TIME"
              ? CHAT_CONSTANTS.ASSISTANT_MESSAGES.INVALID_TIME
              : output.clarificationQuestion) ??
          buildFallbackClarificationQuestion(missingFields)
        : undefined;
    const assistantReply =
      intent !== "BOOK_APPOINTMENT"
        ? (output.assistantReply ?? undefined)
        : undefined;

    return {
      intent,
      appointmentContext,
      missingFields,
      confirmationRequired,
      ...(clarificationQuestion ? { clarificationQuestion } : {}),
      ...(assistantReply ? { assistantReply } : {}),
      ...(bookingIssue ? { bookingIssue } : {}),
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
