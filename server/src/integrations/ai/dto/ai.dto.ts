import { z } from "zod";

import {
  AI_CONSTANTS,
  APPOINTMENT_CONSTANTS,
  CHAT_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../../constants/app.constants.js";

export type AiAppointmentIntent = (typeof AI_CONSTANTS.INTENTS)[number];

export type AiConversationRole =
  (typeof AI_CONSTANTS.CONVERSATION_ROLES)[number];

export type AiBookingField = (typeof AI_CONSTANTS.BOOKING_FIELDS)[number];

export type AiBookingIssue = "PAST_TIME" | "INVALID_TIME";

export type AiProviderName = typeof AI_CONSTANTS.PROVIDER;

export type AiProviderErrorCode =
  (typeof AI_CONSTANTS.PROVIDER_ERROR_CODES)[number];

export interface AiConversationMessage {
  role: AiConversationRole;
  content: string;
}

export interface AiAppointmentContext {
  serviceName?: string;
  scheduledAt?: Date;
  durationMinutes?: number;
  notes?: string;
}

export interface ExtractAppointmentRequest {
  userMessage: string;

  /** Prior conversation turns; the service keeps only the configured recent window. */
  conversationHistory?: AiConversationMessage[];

  appointmentContext?: AiAppointmentContext;

  /** IANA time zone used to resolve relative dates, for example Asia/Karachi. */
  timeZone: string;

  /** Injectable reference time for deterministic internal callers; defaults to now. */
  currentDateTime?: Date;
}

export interface AppointmentExtractionResult {
  intent: AiAppointmentIntent;
  appointmentContext: AiAppointmentContext;
  missingFields: AiBookingField[];
  confirmationRequired: boolean;
  clarificationQuestion?: string;
  assistantReply?: string;
  bookingIssue?: AiBookingIssue;
  confidence: number;
}

export interface AiProviderMessage {
  role: AiConversationRole;
  content: string;
}

export interface AiProviderCompletionRequest {
  systemPrompt: string;
  messages: AiProviderMessage[];
  maxOutputTokens: number;
  temperature: number;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiProviderCompletionResponse {
  content: string;
  provider: AiProviderName;
  model: string;
  usage?: AiTokenUsage;
  finishReason?: string | null;
}

export interface AiProvider {
  readonly name: AiProviderName;
  readonly model: string;

  completeJson(
    request: AiProviderCompletionRequest,
  ): Promise<AiProviderCompletionResponse>;
}

export interface MistralProviderConfig {
  apiKey: string;
  model: string;
  apiUrl: string;
  timeoutMs: number;
}

export interface MistralContentChunk {
  text?: string | undefined;
}

export type MistralAssistantContent = string | MistralContentChunk[];

export interface MistralChatCompletionResponse {
  model: string;
  choices: Array<{
    message: {
      content: MistralAssistantContent;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const mistralChatCompletionResponseSchema = z.object({
  model: z.string().min(1),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(
              z
                .object({
                  text: z.string().optional(),
                })
                .passthrough(),
            ),
          ]),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export const appointmentExtractionOutputSchema = z
  .object({
    intent: z.enum(AI_CONSTANTS.INTENTS),
    serviceName: z
      .string()
      .trim()
      .min(APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH)
      .max(APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH)
      .nullable(),
    scheduledDate: z
      .string()
      .trim()
      .regex(VALIDATION_PATTERNS.LOCAL_DATE)
      .nullable(),
    scheduledTime: z
      .string()
      .trim()
      .regex(VALIDATION_PATTERNS.LOCAL_TIME)
      .nullable(),
    durationMinutes: z
      .number()
      .int()
      .min(APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES)
      .max(APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES)
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(APPOINTMENT_CONSTANTS.MAX_NOTES_LENGTH)
      .nullable(),
    clarificationQuestion: z
      .string()
      .trim()
      .min(1)
      .max(AI_CONSTANTS.MAX_CLARIFICATION_QUESTION_LENGTH)
      .nullable(),
    assistantReply: z
      .string()
      .trim()
      .min(1)
      .max(AI_CONSTANTS.MAX_ASSISTANT_REPLY_LENGTH)
      .nullable()
      .optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const aiConversationMessageSchema = z.object({
  role: z.enum(AI_CONSTANTS.CONVERSATION_ROLES),
  content: z
    .string()
    .trim()
    .min(CHAT_CONSTANTS.MIN_MESSAGE_LENGTH)
    .max(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH),
});

export const aiAppointmentContextSchema = z
  .object({
    serviceName: z
      .string()
      .trim()
      .min(APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH)
      .max(APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH)
      .optional(),
    scheduledAt: z
      .date()
      .refine((value) => !Number.isNaN(value.getTime()))
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .min(APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES)
      .max(APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES)
      .optional(),
    notes: z
      .string()
      .trim()
      .max(APPOINTMENT_CONSTANTS.MAX_NOTES_LENGTH)
      .optional(),
  })
  .strict();
