import { z } from "zod";

import { CHAT_CONSTANTS, VALIDATION_PATTERNS } from "../../constants/app.constants.js";
import { chatActionSchema } from "./chat-parts.schema.js";
import type { ProcessChatMessageRequest } from "./dto/chat.dto.js";

/**
 * The chat message body, for routes that tsoa doesn't validate (the
 * streaming variant). Mirrors the ProcessChatMessageRequest annotations.
 */
export const processChatMessageRequestSchema: z.ZodType<ProcessChatMessageRequest> = z
  .object({
    clientMessageId: z.string().regex(VALIDATION_PATTERNS.UUID),
    content: z.string().min(CHAT_CONSTANTS.MIN_MESSAGE_LENGTH).max(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH),
    timeZone: z.string().max(100),
    bookingDetails: z
      .object({
        serviceId: z.string(),
        staffId: z.string().optional(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        notes: z.string().max(2_000).optional(),
      })
      .strict()
      .optional(),
    action: chatActionSchema.optional(),
  })
  .strict() as z.ZodType<ProcessChatMessageRequest>;
