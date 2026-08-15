# BookWise API server

Node.js, Express, TypeScript, tsoa, Prisma, PostgreSQL, and Mistral backend for authenticated conversational appointment booking.

## Architecture

HTTP requests enter through tsoa controllers. Controllers delegate to services for validation and business rules; DAL classes contain Prisma queries and explicit projections. `ChatOrchestrationService` coordinates the chat, AI, and appointment services without accessing Prisma directly.

```text
Controller -> Orchestration/service -> DAL -> PostgreSQL
                              `-----> Mistral provider
```

The chat flow stores each frontend-generated `clientMessageId` once, links at most one assistant reply to that user message, and keeps the evolving booking context on the chat session. Each user can have only one `ACTIVE` chat. Session creation returns that chat by default; an explicit replacement atomically marks it `ABANDONED` and creates a new active session. Abandoned sessions remain read-only. Confirmation atomically closes the active session, creates the appointment, and stores the success message.

## Requirements

- Node.js 22 or newer
- PostgreSQL
- A Mistral API key for AI chat processing

## Local setup

1. Copy `.env.example` to `.env` and replace the example secrets and database connection.
2. Install dependencies with `npm install`.
3. Apply migrations with `npm run db:migrate` against the intended development database.
4. Start the API with `npm run dev`.

The API defaults to `http://localhost:4000`, Swagger UI is available at `/docs`, and health status is available at `/api/health`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode: `development`, `test`, or `production`. |
| `PORT` | HTTP port. |
| `WEB_ORIGIN` | Allowed browser origin for CORS. |
| `LOG_LEVEL` | Pino logging level. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | JWT signing secret containing at least 32 characters. |
| `JWT_ISSUER` | Expected token issuer. |
| `JWT_AUDIENCE` | Expected token audience. |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | Access-token lifetime. |
| `MISTRAL_API_KEY` | Mistral API key; chat processing returns 503 when omitted. |
| `MISTRAL_MODEL` | Mistral chat-completion model. |
| `MISTRAL_API_URL` | Mistral API base URL. |
| `AI_REQUEST_TIMEOUT_MS` | Maximum duration of one Mistral request. |
| `AI_MAX_HISTORY_MESSAGES` | Recent conversation window sent to Mistral. |

## Main APIs

- `/api/auth`: signup, sign-in, and current-user retrieval.
- `/api/appointments`: authenticated creation, retrieval, cancellation, and conflict-safe rescheduling.
- `/api/chat/sessions`: active-session retrieval or replacement, history, AI-assisted turns, and booking confirmation.
- `/api/health`: process availability.

Authentication uses bearer JWTs. The authentication endpoints are rate-limited to 10 attempts per 15 minutes per client IP. AI-backed chat messages and confirmations are rate-limited to 20 requests per minute per client IP. Rate-limit responses use HTTP 429 and include the request ID.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Generate Prisma/tsoa output and run the development server. |
| `npm run build` | Generate artifacts and compile TypeScript. |
| `npm run typecheck` | Generate artifacts and check TypeScript without emitting output. |
| `npm run lint` | Run ESLint. |
| `npm run db:validate` | Validate Prisma configuration and schema. |
| `npm run db:migrate` | Create/apply a development migration. |
| `npm run db:deploy` | Apply existing migrations in a deployment environment. |

## Security and reliability decisions

- Argon2id password hashing and short-lived signed JWTs.
- Helmet, explicit CORS origin, request body limits, request IDs, and structured error responses.
- Ownership is included in appointment and chat database queries.
- AI output is runtime-validated before it becomes booking context.
- Message and confirmation retries are idempotent through client IDs, reply links, and database constraints.
- Appointment creation, cancellation, and rescheduling serialize schedule writes per user; cancelled appointments release their intervals.
- A partial unique index and transactional replacement enforce one active chat per user, including under concurrent requests.
- Provider secrets and conversation content are excluded from AI operational logs.
- HTTP shutdown closes the listener and PostgreSQL connection cleanly.

## Known prototype limitations

- Rate limiting uses the process-local memory store; a distributed deployment should use a shared store and configure trusted proxies deliberately.
- Chat updates use polling rather than WebSockets.
- Overlapping appointment time ranges are rejected during creation and rescheduling; directly adjacent appointments remain valid.
- JWT access tokens are not refreshed or revoked.
- The health endpoint reports process availability and does not perform a database readiness query.
- Mistral extraction is limited to two provider attempts and retries only timeouts, network failures, invalid responses, HTTP 408 responses, and HTTP 5xx responses. Client retries remain safe through message idempotency.

## Sample data

[`prisma/sample-inserts.sql`](prisma/sample-inserts.sql) contains development-only example inserts for users, chat sessions, appointments, and chat messages. It must not be run against a production database.
