import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  AUTHORIZATION_SCOPES,
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  REALTIME_CONSTANTS,
  VALIDATION_MESSAGES,
} from "../../../constants/app.constants.js";
import { logger } from "../../../config/logger.js";
import { EventStream } from "../../../infrastructure/realtime/event-stream.js";
import { realtimeBus } from "../../../infrastructure/realtime/realtime-bus.js";
import { AppError } from "../../../middleware/app-error.js";
import { expressAuthentication } from "../../../middleware/authentication.js";
import { chatChannels } from "../chat-events.js";
import {
  chatOrchestrationService,
  type ChatOrchestrationService,
} from "../chat-orchestration.service.js";
import { processChatMessageRequestSchema } from "../chat-request.schema.js";
import { chatService } from "../chat.service.js";
import type { ChatStreamEvent } from "../dto/chat-stream.dto.js";

/**
 * Streaming chat endpoints. tsoa can't stream responses, so these are plain
 * Express routes registered ahead of the generated ones; the JSON variant
 * of POST .../messages still goes to the tsoa controller.
 */
export function createChatStreamRouter(
  orchestration: ChatOrchestrationService = chatOrchestrationService,
): Router {
  const router = Router();

  router.post(
    "/api/chat/sessions/:sessionId/messages",
    (request, response, next) =>
      streamTurn(orchestration, request, response, next),
  );
  router.get("/api/chat/sessions/:sessionId/events", sessionEvents);
  router.get("/api/businesses/:businessId/events", businessEvents);
  // The older name, kept for clients that still use it.
  router.get("/api/businesses/:businessId/chat-events", businessEvents);

  return router;
}

function wantsEventStream(request: Request): boolean {
  return (request.get("accept") ?? "").includes(
    REALTIME_CONSTANTS.EVENT_STREAM_TYPE,
  );
}

function send<E extends ChatStreamEvent>(
  stream: EventStream,
  event: E["event"],
  data: E["data"],
): void {
  stream.send(event, data);
}

function toErrorPayload(
  error: unknown,
): Extract<ChatStreamEvent, { event: "error" }>["data"] {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }

  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  };
}

function sessionIdParam(request: Request): string {
  return String(request.params.sessionId ?? "");
}

/** Runs a turn and streams its progress; the reply is persisted once and sent as `done`. */
async function streamTurn(
  orchestration: ChatOrchestrationService,
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  if (!wantsEventStream(request)) {
    next();
    return;
  }

  let stream: EventStream;
  let userId: string;
  let body: ReturnType<typeof processChatMessageRequestSchema.parse>;

  try {
    userId = (
      await expressAuthentication(request, AUTH_CONSTANTS.SECURITY_NAME)
    ).id;

    const parsed = processChatMessageRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(
        422,
        ERROR_CODES.REQUEST_VALIDATION_FAILED,
        ERROR_MESSAGES.REQUEST_VALIDATION_FAILED,
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join(".") || "body",
            [VALIDATION_MESSAGES.REQUEST_FIELD],
          ]),
        ),
      );
    }

    body = parsed.data;
    stream = new EventStream(response);
  } catch (error) {
    next(error);
    return;
  }

  try {
    const turn = await orchestration.processMessage(
      userId,
      sessionIdParam(request),
      body,
      {
        status: (text) => send(stream, "status", { text }),
        token: (text) => send(stream, "token", { text }),
        part: (part) => send(stream, "part", { part }),
      },
    );

    send(stream, "done", turn);
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode >= 500) {
      logger.error({ err: error }, "Streamed chat turn failed");
    }

    send(stream, "error", toErrorPayload(error));
  } finally {
    stream.end();
  }
}

/** Streams change notices through the realtime bus until the client disconnects. */
async function relay(response: Response, channel: string): Promise<void> {
  const stream = new EventStream(response);
  let unsubscribe: () => Promise<void>;

  try {
    unsubscribe = await realtimeBus.subscribe(channel, (event) =>
      stream.send("change", event),
    );
  } catch (error) {
    logger.warn({ err: error }, "Realtime subscription failed");
    stream.send("error", toErrorPayload(error));
    stream.end();
    return;
  }

  stream.onClose(() => {
    void unsubscribe();
  });
  stream.send("ready", {});
}

/** Changes to one of the customer's chats: new messages, handoffs, completion. */
async function sessionEvents(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = await expressAuthentication(
      request,
      AUTH_CONSTANTS.SECURITY_NAME,
    );
    const session = await chatService.getSession(
      userId,
      sessionIdParam(request),
    );

    await relay(response, chatChannels.session(session.id));
  } catch (error) {
    next(error);
  }
}

/** Changes to any chat or booking at a business, for the staff dashboard. */
async function businessEvents(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await expressAuthentication(request, AUTH_CONSTANTS.SECURITY_NAME, [
      AUTHORIZATION_SCOPES.BUSINESS_OPERATE,
    ]);
    await relay(
      response,
      chatChannels.business(String(request.params.businessId)),
    );
  } catch (error) {
    next(error);
  }
}
