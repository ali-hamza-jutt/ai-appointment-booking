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
- Redis 7 (for the worker, shared rate limits and caching; optional for the API alone)
- A Mistral API key for AI chat processing

## Local setup

1. Copy `.env.example` to `.env` and replace the example secrets and database connection.
2. Install dependencies with `npm install`.
3. Apply migrations with `npm run db:migrate` against the intended development database.
4. Start the API with `npm run dev`.
5. With `REDIS_URL` set, start the background worker in a second terminal with `npm run dev:worker`.

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
| `API_PUBLIC_URL` | Public base URL of the API, used for the Google redirect URI. |
| `COOKIE_DOMAIN` | Optional refresh-cookie domain for sibling subdomains. |
| `SMTP_URL`, `MAIL_FROM` | Optional SMTP connection and sender for verification and reset emails. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional; enable "Continue with Google". |
| `MISTRAL_API_KEY` | Mistral API key; chat processing returns 503 when omitted. |
| `MISTRAL_MODEL` | Mistral chat-completion model. |
| `MISTRAL_API_URL` | Mistral API base URL. |
| `AI_REQUEST_TIMEOUT_MS` | Maximum duration of one Mistral request. |
| `AI_MAX_HISTORY_MESSAGES` | Recent conversation window sent to Mistral. |
| `REDIS_URL` | Redis connection. Required by the worker; enables shared rate limits and the availability cache in the API. |
| `OUTBOX_RELAY_INTERVAL_MS` | How often the worker polls the outbox (default 1000). |
| `AVAILABILITY_CACHE_TTL_SECONDS` | Lifetime of cached public availability; `0` turns the cache off (default 60). |

## Main APIs

- `/api/auth`: signup, sign-in, token refresh and sign-out, email verification, password reset, `/providers` (which optional methods are on), Google sign-in (`/google/start`) and phone codes (`/phone/link/*`, `/phone/sign-in*`).
- `/api/appointments`: the signed-in customer's bookings at every business: `POST /holds` reserves an open slot for a few minutes, `POST /{id}/confirm` books it, and cancel/reschedule follow the business's policies (`canCancel` and `canReschedule` say what is still allowed).
- `/api/businesses/{businessId}/bookings`: the business view: bookings by date, manual bookings for walk-in or phone customers, approve/decline, check-in, complete, no-show, cancel, reschedule (including to another staff member) and each booking's audit trail. `/api/businesses/{businessId}/availability` shows staff the open times without online-only limits.
- `/api/chat/sessions`: active-session retrieval or replacement, history, AI-assisted turns, and booking confirmation.
- `/api/businesses`: create a business (caller becomes owner), list your businesses, profile and booking-policy settings, and locations.
- `/api/businesses/{businessId}/members`: team roles and email invitations (accepted automatically on signup).
- `/api/businesses/{businessId}/customers`: customer records with search and cursor pagination.
- `/api/businesses/{businessId}/services` and `/service-categories`: the service catalog. Services are `APPOINTMENT` (one customer) or `CLASS` (up to `capacity` seats), priced in integer minor units of the business currency, with optional deposit, buffers and location.
- `/api/businesses/{businessId}/staff` and `/resources`: staff members (optionally linked to a team member's account) with the services they perform, per-person duration and price overrides, and the locations they work at; resources are rooms, chairs or equipment a service requires.
- `/api/businesses/{businessId}/staff/{staffId}/working-hours` and `/time-off`, and `/api/businesses/{businessId}/closures`: weekly shifts (several per day for breaks, overnight shifts allowed), time off and whole-day closures.
- `/api/public/{slug}/availability?serviceId&staffId&from&to&tz`: bookable start times grouped by local date, with the staff who can take each slot and seats left for classes.
- `/api/public/{slug}` and `/api/public/{slug}/services`: unauthenticated booking-link profile and online-bookable services; `?search=` fuzzy-matches names with `pg_trgm` (spacing and punctuation insensitive). `/api/public/{slug}/staff?serviceId=` lists who can be booked for a service.
- `/api/business-verticals`: supported business types (salon, clinic, consultant, spa and wellness, fitness studio, tutoring, pet grooming).
- `/api/health`: process availability.

### Tenancy and roles

A `Business` is the tenant. Users join through a `Membership` with an `OWNER`, `MANAGER` or `STAFF` role; platform admins are flagged on `User.platformRole`. Business routes declare scopes with `@Security("jwt", ["business:manage"])`, and `middleware/authorization.ts` resolves the caller's role for the route's `{businessId}`:

| Scope | Granted to |
| --- | --- |
| `business:read`, `business:operate` | Owner, manager, staff |
| `business:manage` | Owner, manager |
| `business:owner` | Owner |

Non-members receive 404 so business IDs cannot be probed. A Prisma client extension (`infrastructure/database/tenant-scope.extension.ts`) rejects any query on a tenant-owned model that is not scoped by `businessId` (or the model's owner key, such as `userId` for a customer's own appointments). Booking policies live in the `settings` JSONB and are validated with Zod, so new policies need no migration. Appointments created before tenancy belong to the seeded `bookwise-demo` business.

Authentication uses bearer JWTs. The authentication endpoints are rate-limited to 10 attempts per 15 minutes per client IP. AI-backed chat messages and confirmations are rate-limited to 20 requests per minute per client IP. Rate-limit responses use HTTP 429 and include the request ID.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Generate Prisma/tsoa output and run the development server. |
| `npm run dev:worker` | Run the background worker with reload. |
| `npm run start:worker` | Run the compiled worker. |
| `npm run build` | Generate artifacts and compile TypeScript. |
| `npm run typecheck` | Generate artifacts and check TypeScript without emitting output. |
| `npm run lint` | Run ESLint. |
| `npm test` | Generate artifacts and run unit, integration and API contract tests. |
| `npm run test:unit` | Run the database-free unit tests only. |
| `npm run test:integration` | Run integration and contract tests against `TEST_DATABASE_URL`. |
| `npm run db:validate` | Validate Prisma configuration and schema. |
| `npm run db:migrate` | Create/apply a development migration. |
| `npm run db:deploy` | Apply existing migrations in a deployment environment. |

## Availability engine

`modules/availability/slot-generator.ts` is a pure function with no Prisma import. It expands each staff member's weekly rules into dated windows in the rule's time zone (so DST days keep their wall-clock hours; a spring-forward gap moves forward and an autumn fold resolves to the first occurrence), removes closures, time off and busy intervals, then walks each free window in policy steps from the shift start while the service duration and its buffers still fit. Minimum notice and the booking window come from business settings. "Any provider" is the union of providers, remembering who owns each slot; class services report seats left, and every resource a service requires must have spare capacity. The service layer loads inputs through `dal/availability.dal.ts` and passes them in, and `test/unit/slot-generator.test.ts` covers DST start and end, overnight shifts, touching buffers, breaks, closures, classes and resources.

## Booking lifecycle

Appointments became provider-side bookings (`bookings` table). `modules/bookings/booking-state.ts` is the single table of allowed transitions:

| From | Event | To |
| --- | --- | --- |
| (new) | customer picks a slot | `HELD` (expires after `holdMinutes`) |
| `HELD` | deposit required | `PENDING_PAYMENT` |
| `HELD`, `PENDING_PAYMENT` | confirmed | `CONFIRMED`, or `PENDING` when the business approves manually |
| `PENDING` | approve / decline | `CONFIRMED` / `CANCELLED` |
| `HELD`, `PENDING_PAYMENT` | timer runs out | `EXPIRED` |
| `CONFIRMED` | customer arrives | `CHECKED_IN` |
| `CHECKED_IN` | visit ends | `COMPLETED` |
| `CONFIRMED` | grace period passes without check-in | `NO_SHOW` |
| `HELD`, `PENDING_PAYMENT`, `PENDING`, `CONFIRMED` | cancel | `CANCELLED` |

Every change goes through `BookingDal.transition`, a status-guarded update that also writes a `booking_events` audit row and an `outbox_events` row in the same transaction; side effects are delivered from the outbox, never inside the booking transaction.

Double booking is prevented in three layers. Placing or moving a booking locks the provider's `staff` row (and any required `resources` rows, in id order), expires that provider's lapsed holds, and recomputes the slot from the database inside the transaction. A PostgreSQL exclusion constraint (`btree_gist`) is the final guard: `EXCLUDE USING gist (staff_id WITH =, tstzrange(occupied_from, occupied_until) WITH &&, session_key WITH <>)` for active statuses. The occupied range includes the service buffers, and seats in one class share a `session_key` so a class can fill up to its capacity while any other overlap is rejected. Service name, price and duration are snapshotted onto the booking so catalog edits never rewrite history.

Policies (minimum notice, booking window, cancellation window, reschedule limit, hold length, no-show grace, auto-confirm) come from business settings, with optional per-service overrides for notice, window, cancellation and reschedule limit.

The chat assistant books with one business per session: when the customer's request is complete it fuzzy-matches the service against the catalog, checks real availability and holds the slot, or answers with the closest open times. Confirming the chat turns the hold into a booking.

## Authentication

Sign-in returns a 15-minute access token in the body and sets a refresh token in an `httpOnly`, `SameSite=Lax` cookie scoped to `/api/auth` (`Secure` in production; `COOKIE_DOMAIN` when the web app and API are on sibling subdomains). "Keep me signed in" makes the cookie last 30 days; otherwise it ends with the browser and the server stops honouring it after a day.

- **Rotation and reuse detection.** `POST /api/auth/refresh` swaps the cookie for a new token in the same family. Only hashes are stored (`refresh_tokens`). Presenting a token that was already rotated revokes the whole family, except within 10 seconds of the rotation, which covers two tabs refreshing at once. Rotation never extends a session past its original expiry. Cookie endpoints reject requests whose `Origin` is not `WEB_ORIGIN`.
- **Email verification and password reset.** Single-use links (`auth_tokens`, 48 hours and 1 hour). A newer link retires older ones. Resetting a password also confirms the email and signs out every session. Forgot-password answers the same whether or not the email exists.
- **Google sign-in.** Authorization code flow with PKCE and a nonce; the state lives in a signed `httpOnly` cookie and the ID token is verified against Google's keys. A Google identity signs in to the account already linked to it, links to an existing account with the same Google-verified email, or creates one. Linking to an account whose email was never verified drops that account's password and sessions, so someone who registered another person's address can't keep access. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and register `{API_PUBLIC_URL}/api/auth/google/callback` as the redirect URI.
- **Phone codes.** Signed-in users confirm a number with a 6-digit SMS code to link it (unique per account); linked numbers can then sign in with a code. Codes are stored as keyed hashes, expire after 10 minutes, allow 5 guesses and one resend per minute. Sign-in code requests answer the same whether or not the number is registered. No SMS provider is wired up yet, so codes are logged in development and the phone endpoints return 503 in production.
- **Email delivery.** Set `SMTP_URL` (and `MAIL_FROM`) to send email; without it, emails are written to the log outside production.
- **Rate limits** (per IP, in Redis when configured): sign-in, signup, phone sign-in, code checks and password reset 10 per 15 minutes; anything that sends email or SMS 5 per hour; refresh 30 per minute.

## Background jobs and outbox

`src/worker.ts` is a separate process from the API. It needs PostgreSQL and Redis and runs:

- **Outbox relay.** Every `OUTBOX_RELAY_INTERVAL_MS` it claims unpublished `outbox_events` rows with `FOR UPDATE SKIP LOCKED` (so several workers can run), adds each to the `outbox-events` BullMQ queue with the event id as job id, and marks them published in the same transaction. A failed publish increments `attempts`; an event is retried until `OUTBOX_MAX_ATTEMPTS`.
- **Idempotent consumers.** `modules/outbox/outbox-consumers.ts` lists the consumers. Each claims an event in Redis before handling it and records it as done afterwards, so a redelivered event is skipped and a failed consumer is retried without re-running the ones that succeeded. Today the only consumer drops cached availability on any `booking.*` event.
- **Scheduled maintenance** on the `booking-maintenance` queue: expire lapsed holds (every minute), mark no-shows for businesses with `autoMarkNoShows` once `noShowGraceMinutes` has passed (every 5 minutes), and complete checked-in visits an hour after they end (every 5 minutes). Each booking changes in its own transaction through the state machine as the `SYSTEM` actor, so a booking that staff changed in the meantime is skipped.

Hold expiry does not depend on the worker: placing a booking also expires the provider's lapsed holds inside its transaction.

Public availability is cached per business in Redis for `AVAILABILITY_CACHE_TTL_SECONDS`. Each business has a version key; bumping it orphans all of that business's entries. Staff-side writes under `/api/businesses/{businessId}` bump it as soon as they succeed, and booking events bump it through the worker. Holding a slot always rechecks the database, so a stale entry can only offer a time that then fails with a clear conflict. Any Redis error falls back to computing availability.

## Tests

Tests live in `test/` and run with Vitest:

- `test/unit` covers pure logic and needs no database.
- `test/integration` exercises DALs and database constraints on a real PostgreSQL.
- `test/contract` drives the tsoa app through Supertest (auth scopes, ownership isolation).

Integration and contract tests migrate and truncate the database in `TEST_DATABASE_URL` (default `postgresql://bookwise:bookwise@localhost:5432/bookwise_test`). Never point it at a database with data you need. Tests that touch the queue, idempotency or cache use Redis database 15 at `TEST_REDIS_URL` (default `redis://localhost:6379/15`) and flush it. GitHub Actions runs lint, typecheck and all tests on every pull request against PostgreSQL 16 and Redis 7 service containers.

## Security and reliability decisions

- Argon2id password hashing and short-lived signed JWTs.
- Helmet, explicit CORS origin, request body limits, request IDs, and structured error responses.
- Ownership is included in appointment and chat database queries.
- AI output is runtime-validated before it becomes booking context.
- Message and confirmation retries are idempotent through client IDs, reply links, and database constraints.
- Booking writes serialize per provider and resource, and an exclusion constraint rejects any overlapping active booking for the same provider.
- A partial unique index and transactional replacement enforce one active chat per user, including under concurrent requests.
- Provider secrets and conversation content are excluded from AI operational logs.
- HTTP and worker shutdown close listeners, queue workers, Redis and PostgreSQL connections cleanly.

## Known prototype limitations

- Rate limits are shared through Redis when `REDIS_URL` is set and fall back to per-process memory otherwise; trusted proxies still need deliberate configuration behind a load balancer.
- Chat updates use polling rather than WebSockets.
- Access tokens stay valid until they expire (15 minutes by default) even after sign-out; refresh tokens are revoked immediately.
- The health endpoint reports process availability and does not perform a database readiness query.
- Mistral extraction is limited to two provider attempts and retries only timeouts, network failures, invalid responses, HTTP 408 responses, and HTTP 5xx responses. Client retries remain safe through message idempotency.

## Sample data

[`prisma/sample-inserts.sql`](prisma/sample-inserts.sql) contains development-only example inserts for users, chat sessions, appointments, and chat messages. It must not be run against a production database.
