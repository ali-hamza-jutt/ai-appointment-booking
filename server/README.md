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
- PostgreSQL 16 with the pgvector extension
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
| `SMTP_URL`, `MAIL_FROM` | Optional SMTP connection and sender for verification, reset and booking emails. Any SMTP service works, including Amazon SES and Resend. |
| `TOKEN_ENCRYPTION_KEY` | Optional; 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts calendar OAuth tokens; calendar sync is off without it. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Optional; a Microsoft Entra app for Microsoft 365 calendar sync (tenant defaults to `common`). Google calendar sync reuses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLATFORM_FEE_PERCENT` | Optional; online deposits and prepayment through Stripe Connect. `STRIPE_WEBHOOK_SECRET` lists the signing secrets of the account and Connect webhook endpoints, comma-separated. The fee (default 0%) is BookWise's cut of each payment. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Optional; send booking texts and phone codes through Twilio. `TWILIO_FROM` is an E.164 number or a messaging service SID. Without them, texts are logged outside production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional; enable "Continue with Google". |
| `MISTRAL_API_KEY` | Mistral API key; chat processing returns 503 when omitted. |
| `MISTRAL_MODEL` | Mistral chat-completion model. |
| `MISTRAL_API_URL` | Mistral API base URL. |
| `MISTRAL_EMBED_MODEL` | Mistral embeddings model for the knowledge base (default `mistral-embed`). Without an API key, knowledge search uses keywords only. |
| `AI_REQUEST_TIMEOUT_MS` | Maximum duration of one Mistral request. |
| `AI_MAX_HISTORY_MESSAGES` | Recent conversation window sent to Mistral. |
| `REDIS_URL` | Redis connection. Required by the worker; enables shared rate limits and the availability cache in the API. |
| `OUTBOX_RELAY_INTERVAL_MS` | How often the worker polls the outbox (default 1000). |
| `METRICS_PORT`, `WORKER_METRICS_PORT` | Optional ports serving Prometheus metrics for the API and the worker. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP/HTTP collector URL; traces are exported when set. |
| `OTEL_TRACES_SAMPLE_RATIO` | Share of new traces kept (default 1). |
| `SENTRY_DSN`, `APP_RELEASE` | Optional error reporting and the release name attached to errors and traces. |
| `AVAILABILITY_CACHE_TTL_SECONDS` | Lifetime of cached public availability; `0` turns the cache off (default 60). |

## Main APIs

- `/api/auth`: signup, sign-in, token refresh and sign-out, email verification, password reset, `/providers` (which optional methods are on), Google sign-in (`/google/start`) and phone codes (`/phone/link/*`, `/phone/sign-in*`).
- `/api/appointments`: the signed-in customer's bookings at every business: `POST /holds` reserves an open slot for a few minutes, `POST /{id}/confirm` books it, and cancel/reschedule follow the business's policies (`canCancel` and `canReschedule` say what is still allowed).
- `/api/businesses/{businessId}/bookings`: the business view: bookings by date, manual bookings for walk-in or phone customers, approve/decline, check-in, complete, no-show, cancel, reschedule (including to another staff member) and each booking's audit trail. `/api/businesses/{businessId}/availability` shows staff the open times without online-only limits.
- `/api/chat/sessions`: active-session retrieval or replacement, history, AI-assisted turns, and booking confirmation.
- `/api/businesses`: create a business (caller becomes owner), list your businesses, profile and booking-policy settings, and locations.
- `/api/businesses/{businessId}/members`: team roles and email invitations (accepted automatically on signup).
- `/api/businesses/{businessId}/customers`: customer records with search and cursor pagination.
- `/api/businesses/{businessId}/calendar-connections` and `/staff/{staffId}/calendar-connection`: connect (returns the provider's consent URL), sync or disconnect a staff member's Google or Microsoft 365 calendar. `/api/calendar/providers` says which providers are configured.
- `/api/businesses/{businessId}/payments/account`: the business's Stripe account (onboarding link, status refresh, dashboard link); `/bookings/{bookingId}/payments` and `/refunds` show and refund a booking's payment. Customers reopen Checkout with `POST /api/appointments/{id}/payment`.
- `/api/me/waitlist`: a customer's waits (join, list, leave); `/api/businesses/{businessId}/waitlist` shows staff who is waiting.
- `/api/appointments/{appointmentId}/review`: the customer's rating of a finished visit; `/api/businesses/{businessId}/reviews` lets staff publish, hide and answer reviews; `/api/public/{slug}/reviews` lists the published ones.
- `/api/businesses/{businessId}/chat-handoffs/{sessionId}` (and `/messages`): a handed-off chat in full, and staff replies as the business; `PUT /api/businesses/{businessId}/customers/{customerId}/notes` keeps private team notes.
- `/api/public/{slug}/guest/code` and `/guest/verify`: guest booking by emailed code; `/api/public/{slug}/embed` and `/api/businesses/{businessId}/allowed-origins`: where the booking widget may be embedded.
- `/api/businesses/{businessId}/notification-templates`: the wording of every booking email and text, editable per business; `/api/businesses/{businessId}/bookings/{bookingId}/notifications` lists what was sent for a booking. `/api/me/notification-settings` lets customers turn each business's emails or texts off.
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
| `npm run eval` | Run the agent evals on recorded model replies (`eval:live` against Mistral, `eval:record` to refresh the recordings). |
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

## Booking agent

The chat assistant is a tool-calling agent (`modules/chat/agent`) running on Mistral function calling. Each turn, `integrations/ai/agent/agent-runner.ts` lets the model call tools for up to five rounds and then makes it answer in text. Every tool argument is validated with Zod; invalid arguments, unknown tools and business errors (a taken slot, a booking that isn't the customer's) go back to the model as tool results instead of failing the turn.

| Tool | Does | Writes |
| --- | --- | --- |
| `search_services` | Fuzzy-matches the catalog, up to 5 services with price and duration | No |
| `list_staff` | Providers for a service with their next free date | No |
| `get_availability` | Open times for a service, day range, provider, part of day or exact time | No |
| `propose_booking` | Holds an offered slot and shows a Confirm button | Hold only |
| `list_my_bookings` | The customer's upcoming bookings here | No |
| `propose_cancel` / `propose_reschedule` | Show a button for the change | No |
| `search_knowledge` | Up to 4 passages from the business's knowledge base | No |
| `remember_preference` / `forget_preference` | Saves or removes a preference the customer stated (provider, service or part of day) | Preference only |
| `handoff_to_human` | Flags the chat for staff (`/api/businesses/{businessId}/chat-handoffs`) | Flag only |

- **The model proposes, booking core decides.** Tools run with the session's business and customer; ids the model passes are checked for ownership. Nothing is booked, cancelled or moved until the customer presses a button.
- **Slot tokens.** `get_availability` returns each slot as an HMAC-signed token (business, service, provider, start, 30-minute expiry). `propose_booking` and `propose_reschedule` accept only a token, so the model cannot invent a time that was never offered.
- **UI parts.** Assistant messages carry `structuredData.parts`: `service_cards`, `slot_picker`, `booking_summary`, `booking_list` and `confirm`. A tap posts a typed `action` (`select_service`, `select_slot`, `cancel_booking`, `reschedule_booking`) that booking core handles without another model call; a slot taken in the meantime returns fresh times.
- **Typed draft.** The chat's draft is `draft_service_id`, `draft_staff_id` and `draft_hold_id` foreign keys (plus time zone and notes), so it always points at real rows. `POST /chat/sessions/{id}/confirm` turns the held slot into a booking.
- **Fallbacks.** Bare greetings and "what can you do" are answered locally with service cards. If Mistral is unavailable, the reply offers service cards to book by tapping, and the structured form still works.
- **Evals.** `evals/` holds 73 scripted conversations (direct requests, preferred providers, open-ended times, clarification, multi-turn changes, unavailable times, managing bookings, refusals, handoffs and knowledge questions) on a seeded business with a frozen clock. They report booking success, wrong-slot rate, turns to book and outcome accuracy per category. Recordings use placeholders (`{{service:Haircut}}`, `{{slot:<start>}}`) so real model replies captured by `npm run eval:record` replay against a fresh database; the checked-in seed recordings are hand-written.

## Customer profile and memory

The agent starts each turn knowing who it is talking to (`modules/customers/customer-profile.service.ts`).

- **Preferences.** `customer_preferences` holds at most one value per customer per key: `PREFERRED_STAFF`, `USUAL_SERVICE` and `PREFERRED_PART_OF_DAY`. Only two things write them: the `remember_preference` tool when the customer states a lasting preference (source `CUSTOMER`, checked against an active provider, a bookable service or morning/afternoon/evening), and the worker on `booking.completed`, which re-derives them from the last 5 completed visits once a value repeats (source `BOOKING_HISTORY`). A derived value never replaces one the customer set, and model output is never saved directly.
- **Agent context.** The system prompt lists the customer's preferences (with the ids the tools accept), completed-visit count and last 3 bookings, labelled as data. Preferences are defaults: the agent checks the usual provider and time first but follows what the customer asks. A preference whose provider or service is no longer bookable is left out.
- **Book again.** A returning customer's greeting offers a one-tap "Book <service> again" button (a `select_service` action with an optional `staffId`) that opens their usual provider's times, or everyone's if that provider has nothing open.
- **Rolling summary.** Once a chat passes 20 messages, older messages are folded into a short model-written summary stored on the session (`summary`, `summarized_count`), and the agent gets the summary plus every message after it. The summary is refreshed after 8 more messages, costs one extra model call when it runs, and the turn carries on without it if that call fails.
- **Per-business chats.** A customer has at most one active chat per business (partial unique index on `user_id, business_id`), so opening another business's booking link no longer abandons the first chat. `GET /api/chat/sessions?businessSlug=` filters by business.
- **APIs.** `GET /api/me/preferences` and `DELETE /api/me/preferences/{preferenceId}` let customers see and remove what each business remembers. `GET /api/businesses/{businessId}/customers/{customerId}/profile` (scope `business:read`) shows staff a customer's preferences, visit counts and recent bookings.

## Notifications and reminders

Customers hear about their bookings by email and, when a mobile number is known, by text (`modules/notifications`). Everything is sent by the worker, never inside a booking transaction.

- **What is sent.** An outbox consumer turns `booking.confirmed`, `booking.pending_approval`, `booking.rescheduled` and `booking.cancelled` into a message. Confirmation, move and cancellation emails carry an iCalendar invite (`utils/ics.ts`) with a stable UID and a rising `SEQUENCE`, so calendar apps update or remove the same event. A cancelled hold that was never confirmed sends nothing, and an event overtaken by a later change (a confirmation for a booking already moved) is skipped.
- **Reminders.** A confirmed or moved booking schedules one delayed job per `reminderOffsetsMinutes` (24 and 2 hours by default) on the `notifications` queue. A reminder due inside the business's quiet hours (`quietHoursStart` to `quietHoursEnd`, 21:00 to 08:00 by default, in the customer's time zone) goes out when quiet hours begin instead. Job ids include the booking's start, and each job re-reads the booking before sending, so a moved, cancelled or finished booking gets no stale reminder. Reminders already due when the booking is made are skipped.
- **Exactly once per message.** Each message is written to `notifications` before it is sent, keyed by event (or reminder) and channel. A repeated event or job sends only what never went out. A temporary failure (SMTP down, Twilio 5xx) fails the job so the queue retries it, while a number Twilio refuses is marked `FAILED` without retrying.
- **Templates.** Businesses can replace the built-in wording of any message with plain text and `{{placeholders}}` (`customerName`, `serviceName`, `staffName`, `date`, `time`, `timeZone`, `location`, `link` and `businessName`); unknown placeholders are rejected when saved.
- **Opt-outs and phone numbers.** A customer can turn a business's emails or texts off; a skipped message is logged as `SKIPPED`. Texts go to the account's verified phone or the customer record's number when it is in international (E.164) form.
- **Delivery reports.** Twilio posts status callbacks to `/api/webhooks/twilio/sms-status`. Requests are checked against Twilio's signature over `{API_PUBLIC_URL}/api/webhooks/twilio/sms-status`; a message moves to `DELIVERED` or `FAILED` and never back.

## Payments and deposits

Services can ask for a deposit or the full price online (`paymentMode` `DEPOSIT` or `FULL`; `modules/payments`, Stripe client in `integrations/stripe`). Nothing is charged until the business owner connects a Stripe account and Stripe enables charges on it; until then bookings confirm as before.

- **Money goes to the business.** Owners connect a Stripe Express account from the Payments page. Payments are destination charges: created on the platform with the business as merchant of record (`on_behalf_of`) and paid out to its account, minus `STRIPE_PLATFORM_FEE_PERCENT`.
- **Paying to confirm.** When a customer confirms a hold (in the app or in chat) and the service asks for payment, the booking moves to `PENDING_PAYMENT` and the response carries a Stripe Checkout link. The time stays held while the customer pays: 35 minutes, since Checkout stays open at least 30. Card details only ever go to Stripe; the chat shows a link.
- **Confirmation comes from Stripe.** `POST /api/webhooks/stripe` checks Stripe's signature over the raw body and records each event once (`stripe_webhook_events`); a failed event is released so Stripe's retry runs it again. `checkout.session.completed` confirms the booking (or sends it for approval). A payment that arrives after the booking lost its time is refunded automatically.
- **Unpaid bookings.** When the payment window closes, the booking expires like a hold, its time is freed, and its Checkout session is closed.
- **Refunds.** When a paid booking is cancelled, an outbox consumer refunds it: in full when the business cancels or the customer cancels before the cancellation window, and less the service's deposit inside it. No-shows keep the payment. Staff with manage rights can refund all or part of a payment from the booking. Refunds made in Stripe are picked up from `charge.refunded`, and every refund uses an idempotency key so retries never refund twice.

## Waitlist

Customers who find nothing suitable can wait for a service between two dates, optionally for one provider or part of the day (`modules/waitlist`). They join from the booking chat (a "Join the waitlist" button when nothing is open, or the agent's `join_waitlist` tool once they agree) or through `POST /api/me/waitlist`. Joining the same wait twice returns the first entry, and a customer can have at most 5 waits at a business.

- **A freed time is offered in turn.** When a booking is cancelled or a hold expires, an outbox consumer walks the waiting customers for that service in the order they joined and picks the first whose dates and part of day (in their own time zone) and provider suit the time. It holds the time for them as a `WAITLIST` booking for 15 minutes and emails or texts them a link to confirm it (`WAITLIST_OFFER`, rewordable like other messages). A deposit, if the service asks for one, is taken when they confirm.
- **If they don't take it, it moves on.** A lapsed or released hold marks the offer `LAPSED` or `DECLINED`, puts the customer back in line and offers the time to the next person; nobody is offered the same time twice. Confirming marks the entry `BOOKED`.
- **When the time can't be held,** because it was taken again, is now too soon, or is outside the booking window, the search stops, since no one else could book it either.

## Public booking and the widget

- **Guests.** On a business's public page or widget, someone without an account enters their name, email and (optionally) phone, and gets a 6-digit code by email (10 minutes, 5 guesses, one per minute). Confirming it signs them in with a browser-session login, creating an account the first time; an existing account is signed in as it is, since the code proves the email. The phone number is saved on their customer record at that business. From there they use the same holds, confirmation and chat as any signed-in customer. A business with `allowGuestBooking` off refuses guest codes (403).
- **Limits.** Everything under `/api/public` has its own per-IP limit (120 a minute); asking for a code uses the stricter limit of other code-sending endpoints.
- **Widget.** `widget.js` (served by the web app) adds a button that opens `/embed/<slug>` in an iframe. The web app's proxy sets `Content-Security-Policy: frame-ancestors 'self' <allowed origins>` on that page from `GET /api/public/{slug}/embed`; every other page may only be framed by BookWise itself. The frame sends the host page nothing but a close request.

## Business dashboard

The dashboard's calendar, bookings list and inbox stay current over `GET /api/businesses/{businessId}/events` (server-sent events; `/chat-events` is the older name). It carries the chat change notices, plus a `booking` notice that an outbox consumer publishes for every committed booking event. Clients refetch on a notice, never treat it as the record.

- **Calendar.** The web calendar lists a date range through the bookings endpoint (following its cursor) and moves bookings with the staff reschedule endpoint, so a drag goes through the same state machine, checks and customer email as any other reschedule.
- **Inbox.** Staff read a handed-off chat in full and reply while the handoff is open. A reply is an `ASSISTANT` message with `structuredData.sentBy.name` (the staff member's first name), so the customer sees it in the same chat under that name. The agent's history shows it as `[Staff member Name]: …`, and prompt rule 15 tells the agent to stand by it.
- **Customer notes.** `customers.notes` is private to the team: it is only returned by the staff profile endpoint, and never given to the customer or the agent.

## Reviews

Customers rate finished visits from 1 to 5 stars, with an optional comment (`modules/reviews`).

- **Asking.** When a visit is completed, the notifications consumer schedules a delayed `send-review-request` job for two hours after completion (one job per booking). It emails or texts a `REVIEW_REQUEST` message, rewordable like the others, linking to the appointment page, unless the customer has already reviewed the visit.
- **Rating.** A customer can review a `COMPLETED` visit once, within 30 days (`POST /api/appointments/{id}/review`). Reviews start `PENDING`.
- **Publishing.** Owners and managers publish or hide reviews and write a public reply (`PATCH /api/businesses/{businessId}/reviews/{reviewId}`). Only published reviews appear in `GET /api/public/{slug}/reviews` with their average, and the booking assistant's `get_reviews` tool reads the same list.
- **Low ratings.** Saving a review writes a `review.submitted` outbox event; for 2 stars or fewer, a consumer emails every owner and manager once (claimed through `reviews.alerted_at`, released for a retry if sending fails).

## Calendar sync

Staff can connect a Google or Microsoft 365 calendar (`modules/calendar`, provider clients in `integrations/calendar`). Owners and managers can connect anyone's; staff only their own.

- **Connecting.** The dashboard asks the API for the provider's consent URL and sends the browser there. The OAuth state carries the business, staff member, user, expiry and PKCE verifier, sealed with AES-256-GCM, so the callback (`/api/calendar/oauth/callback`) needs no cookie and can't be forged or replayed after 10 minutes. Refresh and access tokens are stored encrypted with `TOKEN_ENCRYPTION_KEY`; access tokens are refreshed a minute before they expire. A grant the provider refuses marks the connection `NEEDS_RECONNECT`.
- **Busy times in.** A sync reads the calendar's events for the next 90 days and stores the busy ones as `external_busy` rows. Free, cancelled and declined events are skipped, as are events BookWise wrote itself. The availability engine treats these rows like time off, both when listing open times and when a booking is placed, so a busy time can't be booked. Rows are only rewritten, and the availability cache only cleared, when the busy times actually change.
- **Bookings out.** An outbox consumer keeps each confirmed booking as an event on its staff member's calendar: created when confirmed, moved when rescheduled (to another calendar if the booking changes hands), and deleted when cancelled. The booking stores `calendarEventId` and `calendarConnectionId`. Google events use an id derived from the booking and Microsoft events a `transactionId`, so a retried create never adds a second event. Bookings made before the calendar was connected are written on its first sync.
- **Staying in step.** With an HTTPS `API_PUBLIC_URL`, each connection opens a Google push channel or a Microsoft Graph subscription, renewed a day before it expires. Notifications (`/api/webhooks/calendar/google` and `/microsoft`) are matched by channel and a hashed per-channel secret, then queue a sync. Every 15 minutes the worker also syncs every active calendar, which is all that runs when push is unavailable.

## Realtime streaming

- **Streamed replies.** `POST /api/chat/sessions/{id}/messages` with `Accept: text/event-stream` runs the same turn as the JSON endpoint but streams `status` ("Checking Thursday 5 Nov…"; any text streamed before it is superseded), `token`, `part` (a card as soon as a tool produces it) and finally `done` with the persisted turn, or `error`. The reply is saved once, and the `clientMessageId` keeps retries idempotent, so a client whose stream drops can re-send the same message to the JSON endpoint and get the saved reply. Mistral replies stream through the provider's `stream` method; the runner doesn't retry a call that already sent text.
- **Plain Express routes.** tsoa can't stream, so `modules/chat/controllers/chat-stream.routes.ts` is registered before the generated routes; it authenticates with the same bearer check and validates the body with Zod. Requests without the event-stream `Accept` header fall through to tsoa.
- **Change notices.** Saved messages, handoffs and completed bookings publish a small event to Redis pub/sub (`infrastructure/realtime`; an in-process bus without Redis). `GET /api/chat/sessions/{id}/events` streams a customer's chat, and `GET /api/businesses/{businessId}/chat-events` (scope `business:operate`) streams every chat at the business for the dashboard. Clients refetch on a notice and fall back to polling while disconnected. Streams send a heartbeat every 15 seconds and are closed on shutdown.

## Knowledge base

Owners and managers add FAQs, policies and preparation notes (pasted or loaded from a `.txt`/`.md` file) at `/api/businesses/{businessId}/knowledge-sources`. The agent answers questions about the business only from these.

- **Chunks.** Text is split into passages of about 500 tokens with a little overlap, keeping headed sections together, and stored in `knowledge_chunks` with a `vector(1024)` embedding column (pgvector, HNSW cosine index) and a full-text index.
- **Background embedding.** Saving new content replaces the passages and writes a `knowledge.source_changed` outbox event in the same transaction; the worker embeds them with `MISTRAL_EMBED_MODEL` in batches and marks the source `READY`. A newer edit makes older events no-ops (they carry the content hash), and a failed embed marks the source `FAILED` and is retried by the outbox.
- **Hybrid search.** `search_knowledge` and `POST /api/businesses/{businessId}/knowledge-search` embed the question, take the nearest passages and the keyword matches, and merge them by reciprocal rank fusion into the top 4. Keyword search works before embedding finishes, without an API key, and when the embeddings call fails.
- **Grounding.** The tool tells the model to answer only from the passages and name the source, or to say it doesn't know and offer a handoff when nothing matches. Passages are treated as data; instructions inside them are ignored.

PostgreSQL needs the `vector` extension; CI uses the `pgvector/pgvector:pg16` image.

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
- **Idempotent consumers.** `modules/outbox/outbox-consumers.ts` lists the consumers. Each claims an event in Redis before handling it and records it as done afterwards, so a redelivered event is skipped and a failed consumer is retried without re-running the ones that succeeded. Consumers drop cached availability and count metrics on `booking.*` events, embed knowledge sources on `knowledge.source_changed`, re-derive customer preferences on `booking.completed`, and send booking notifications.
- **Scheduled maintenance** on the `booking-maintenance` queue: expire lapsed holds (every minute), mark no-shows for businesses with `autoMarkNoShows` once `noShowGraceMinutes` has passed (every 5 minutes), and complete checked-in visits an hour after they end (every 5 minutes). Each booking changes in its own transaction through the state machine as the `SYSTEM` actor, so a booking that staff changed in the meantime is skipped.

Hold expiry does not depend on the worker: placing a booking also expires the provider's lapsed holds inside its transaction.

Public availability is cached per business in Redis for `AVAILABILITY_CACHE_TTL_SECONDS`. Each business has a version key; bumping it orphans all of that business's entries. Staff-side writes under `/api/businesses/{businessId}` bump it as soon as they succeed, and booking events bump it through the worker. Holding a slot always rechecks the database, so a stale entry can only offer a time that then fails with a clear conflict. Any Redis error falls back to computing availability.

## Observability

`src/instrumentation.ts` is loaded with `--import` by every start script, so OpenTelemetry can patch modules before the app imports them. Nothing starts unless `OTEL_EXPORTER_OTLP_ENDPOINT` or a metrics port is set.

- **Traces** cover HTTP and Express routes, Prisma and PostgreSQL queries, Redis calls inside a request or job, booking placement (`booking.place`), each Mistral call and each background job. Every HTTP span carries `http.request_id`, which is also the `x-request-id` response header. Booking events store the request id and trace context in the outbox, so the worker's job continues the trace of the request that caused it.
- **Logs** (Pino) add `requestId`, `traceId` and `spanId` to every line, in the API and the worker.
- **Metrics** (Prometheus, from the API on `METRICS_PORT` and the worker on `WORKER_METRICS_PORT`):

  | Metric | Meaning |
  | --- | --- |
  | `bookwise_booking_attempts_total{source,mode,outcome}` | Holds and bookings by outcome (`held`, `confirmed`, `pending`, `conflict`, `rejected`, `error`); gives the booking success rate. |
  | `bookwise_booking_slot_conflicts_total{source}` | Attempts that lost the slot to someone else. |
  | `bookwise_booking_hold_to_confirm_seconds` | Time from holding a slot to confirming it. |
  | `bookwise_booking_events_total{type}` | Committed booking changes (worker; exact because consumers are idempotent). Held vs. expired gives the hold-to-confirm rate. |
  | `bookwise_llm_requests_total`, `bookwise_llm_request_duration_seconds`, `bookwise_llm_tokens_total{direction}`, `bookwise_llm_cost_usd_total` | Mistral calls, latency, tokens and estimated spend, by model and `business_id`. Prices live in `OBSERVABILITY_CONSTANTS.LLM_PRICING_USD_PER_MILLION`. |
  | `bookwise_job_runs_total`, `bookwise_job_duration_seconds` | Worker jobs by queue, job and outcome. |
  | `bookwise_outbox_published_total`, `bookwise_outbox_publish_failures_total`, `bookwise_outbox_oldest_unpublished_seconds` | Relay throughput and backlog age. |
  | `http_server_request_duration_*` | Standard HTTP server metrics by route and status. |

- **Errors**: with `SENTRY_DSN`, unexpected 5xx errors, crashes and jobs failing their last attempt go to Sentry, tagged with the request and trace ids. Sentry does not install its own tracer.
- **Alerts**: [`../ops/prometheus/alerts.yml`](../ops/prometheus/alerts.yml) holds Prometheus rules for downtime, 5xx rate, latency, booking success rate and errors, slot-conflict spikes, expiring holds, outbox backlog, failing jobs, and LLM errors, latency and daily spend per business. [`../ops/prometheus/prometheus.yml`](../ops/prometheus/prometheus.yml) is an example scrape config.

## Tests

Tests live in `test/` and run with Vitest:

- `test/unit` covers pure logic and needs no database.
- `test/integration` exercises DALs and database constraints on a real PostgreSQL.
- `test/contract` drives the tsoa app through Supertest (auth scopes, ownership isolation).

Integration and contract tests migrate and truncate the database in `TEST_DATABASE_URL` (default `postgresql://bookwise:bookwise@localhost:5432/bookwise_test`). Never point it at a database with data you need. Agent evals live in `evals/` (see Booking agent): `npm run eval` replays `evals/recordings.json` and runs as part of `npm test`; `npm run eval:live` calls Mistral and requires at least 80% booking success, at most 5% wrong slots and 80% correct outcomes; `npm run eval:record` re-records the replies. Results are written to `evals/results/`.

Tests that touch the queue, idempotency or cache use Redis database 15 at `TEST_REDIS_URL` (default `redis://localhost:6379/15`) and flush it. GitHub Actions runs lint, typecheck and all tests on every pull request against PostgreSQL 16 (pgvector) and Redis 7 service containers.

## Security and reliability decisions

- Argon2id password hashing and short-lived signed JWTs.
- Helmet, explicit CORS origin, request body limits, request IDs, and structured error responses.
- Ownership is included in appointment and chat database queries.
- AI output is runtime-validated before it becomes booking context.
- Message and confirmation retries are idempotent through client IDs, reply links, and database constraints.
- Booking writes serialize per provider and resource, and an exclusion constraint rejects any overlapping active booking for the same provider.
- A partial unique index and transactional replacement enforce one active chat per user per business, including under concurrent requests.
- Provider secrets and conversation content are excluded from AI operational logs.
- HTTP and worker shutdown close listeners, queue workers, Redis and PostgreSQL connections cleanly.

## Known prototype limitations

- Rate limits are shared through Redis when `REDIS_URL` is set and fall back to per-process memory otherwise; trusted proxies still need deliberate configuration behind a load balancer.
- Event streams are one per open chat tab; very large numbers of concurrent viewers would need a dedicated realtime service.
- Access tokens stay valid until they expire (15 minutes by default) even after sign-out; refresh tokens are revoked immediately.
- The health endpoint reports process availability and does not perform a database readiness query.
- Payments are taken through Stripe Checkout only (no saved cards or in-page payment form), and disputes are handled in the business's Stripe dashboard.
- Calendar sync re-reads the next 90 days of a calendar on each sync rather than using incremental sync tokens, and events BookWise writes stay in a staff member's calendar after they disconnect it.
- Email delivery is recorded as `SENT` when the SMTP server accepts it; bounces are not tracked. Web push notifications are not implemented yet.
- Each Mistral call is retried once on timeouts, network failures, invalid responses, HTTP 408 and 5xx responses. Client retries remain safe through message idempotency.

## Sample data

[`prisma/sample-inserts.sql`](prisma/sample-inserts.sql) contains development-only example inserts for users, chat sessions, appointments, and chat messages. It must not be run against a production database.
