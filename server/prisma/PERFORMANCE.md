# Database design and performance notes

## Domain model

- `users` stores authentication and profile data.
- `businesses`, `memberships`, `locations` and `customers` model tenants; every tenant-owned query is scoped by `business_id` (enforced by a Prisma extension).
- `services`, `staff`, `resources`, `working_hours`, `time_off` and `business_closures` describe bookable inventory.
- `bookings` stores provider-side bookings with their lifecycle status; `booking_events` is its audit trail and `outbox_events` holds side effects for the worker.
- `chat_sessions` stores conversation metadata and an evolving JSONB booking context.
- `chat_messages` stores normalized conversation history in chronological order.

Core fields that are filtered or sorted remain normal relational columns. JSONB is limited to AI-derived context and structured message metadata whose shape can evolve without frequent schema migrations.

## Constraints and indexes

| Database object | Purpose |
| --- | --- |
| `users_email_key` | Enforces normalized email uniqueness and supports sign-in lookup. |
| `bookings_no_provider_overlap` | Exclusion constraint (`btree_gist`): no two active bookings for one provider may overlap, including buffers, unless they are seats in the same class session. |
| `bookings_staff_id_status_occupied_from_idx` | Loads a provider's busy intervals for slot generation. |
| `bookings_status_hold_expires_at_idx` | Finds lapsed holds to expire. |
| `appointments_chat_session_id_key` | Makes chat confirmation idempotent by allowing at most one booking per chat session. |
| `appointments_business_id_scheduled_at_idx` | Supports a business's bookings by date. |
| `appointments_user_id_created_at_id_idx` | Supports stable newest-first pagination of a customer's bookings. |
| `appointments_user_id_status_created_at_id_idx` | Supports the same pagination within a status filter. |
| `services_name_trgm_idx` | `pg_trgm` GIN index for fuzzy service search. |
| `chat_sessions_user_id_updated_at_id_idx` | Supports stable cursor pagination of a user's recently active sessions. |
| `chat_messages_session_id_client_message_id_key` | Makes retried client message submissions idempotent within a session. Multiple server-generated messages can keep this value null. |
| `chat_messages_session_id_reply_to_message_id_key` | Allows at most one assistant reply for each user message, including concurrent retries. |
| `chat_messages_session_id_created_at_id_idx` | Supports stable cursor pagination of messages in conversation order. |

Foreign keys protect ownership relationships; session deletion cascades to its messages. Check constraints bound durations (5–720 minutes), buffers, prices, class capacity and booking time ranges.

## Query rules

- Always scope tenant-owned queries by `business_id` (or the owner key, such as `user_id` for a customer's own bookings) so authorization and retrieval happen in one query.
- Use explicit Prisma `select` projections and never return password hashes from API queries.
- Use keyset/cursor pagination for session and message history rather than large offsets.
- Serialize booking writes per provider and resource, and recompute the slot inside the same transaction.
- Fetch only the recent message window required by the AI provider rather than loading full conversation history.
- Never keep a database transaction open while waiting for an external AI response.
- Write side effects (notifications, payments, calendar pushes) to `outbox_events` in the booking transaction; never call external services inside it.

## Scheduling consistency

Placing, confirming and moving a booking lock the provider's `staff` row (and required `resources` rows, in id order), expire that provider's lapsed holds, and recompute the requested slot from working hours, time off, closures and existing bookings inside one transaction. The exclusion constraint is the final guard if application checks are ever bypassed. Adjacent bookings are allowed; cancelled, expired and completed bookings release their time immediately.
