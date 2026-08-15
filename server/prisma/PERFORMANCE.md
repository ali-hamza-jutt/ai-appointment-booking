# Database design and performance notes

## Domain model

- `users` stores authentication and profile data.
- `appointments` stores typed scheduling data and its lifecycle status.
- `chat_sessions` stores conversation metadata and an evolving JSONB booking context.
- `chat_messages` stores normalized conversation history in chronological order.

Core fields that are filtered or sorted remain normal relational columns. JSONB is limited to AI-derived context and structured message metadata whose shape can evolve without frequent schema migrations.

## Constraints and indexes

| Database object | Purpose |
| --- | --- |
| `users_email_key` | Enforces normalized email uniqueness and supports sign-in lookup. |
| `appointments_user_id_scheduled_at_active_key` | Prevents identical starts for non-cancelled appointments while allowing cancellation to release the previous slot. |
| `appointments_chat_session_id_key` | Makes chat confirmation idempotent by allowing at most one appointment per chat session. |
| `appointments_user_id_created_at_id_idx` | Supports stable newest-first appointment pagination across all statuses. |
| `appointments_user_id_status_created_at_id_idx` | Supports stable newest-first appointment pagination within a status filter. |
| `appointments_user_id_status_scheduled_at_idx` | Supports appointment lists filtered by user and status, ordered by scheduled time. |
| `chat_sessions_user_id_updated_at_id_idx` | Supports stable cursor pagination of a user's recently active sessions. |
| `chat_messages_session_id_client_message_id_key` | Makes retried client message submissions idempotent within a session. Multiple server-generated messages can keep this value null. |
| `chat_messages_session_id_reply_to_message_id_key` | Allows at most one assistant reply for each user message, including concurrent retries. |
| `chat_messages_session_id_created_at_id_idx` | Supports stable cursor pagination of messages in conversation order. |

Foreign keys protect ownership relationships. User deletion cascades to that user's appointments and chat sessions; session deletion cascades to its messages. Appointment duration is constrained to 5-480 minutes in SQL.

## Query rules

- Always include `user_id` in appointment and chat-session lookups so authorization and retrieval happen in one query.
- Use explicit Prisma `select` projections and never return password hashes from API queries.
- Use keyset/cursor pagination for session and message history rather than large offsets.
- Serialize appointment create, cancel, and reschedule writes per user and check duration-aware overlap inside the same transaction.
- Fetch only the recent message window required by the AI provider rather than loading full conversation history.
- Never keep a database transaction open while waiting for an external AI response.
- Close the chat session, create its appointment, and store the success message in one atomic nested write.

## Scheduling consistency

Form creation, chat confirmation, cancellation, and rescheduling lock the appointment owner's user row and write in one transaction. Create and reschedule operations check the complete proposed time range while excluding cancelled appointments and, during rescheduling, the appointment being moved. This prevents concurrent application requests from producing overlaps, permits directly adjacent appointments, and makes the old interval immediately reusable after cancellation or rescheduling. The rule currently applies per user because provider/resource scheduling is outside this prototype.
