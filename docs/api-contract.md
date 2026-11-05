# qando — API contract (outline)

The full contract is **generated**: Zod schemas in the shared `contracts` package are the single source for request validation, TypeScript types and the OpenAPI document served with Swagger UI at `/api/docs`. This outline lists the main endpoints, what they take and return, and who may call them; field-level details live in the schemas.

## Conventions

- REST over HTTPS, JSON bodies, base path `/api`.
- **Credentials**:
  - *Session*: HttpOnly, Secure, SameSite cookie set by Better Auth. Mutations with a session also require a matching `Origin` header (CSRF).
  - *Management token*: header `X-Management-Token`.
  - *Vote-edit token*: header `X-Vote-Token`.
  - The participation and results IDs travel in the path.
- Dates are `YYYY-MM-DD` and times `HH:MM`, as calendar values in the event's time zone (IANA, e.g. `Europe/Madrid`); instants are ISO 8601 UTC.
- An option is `{ id, dates, time }`: `dates` is `{ kind: "single", date }` or `{ kind: "range", start, end }`; `time` is `null`, `{ kind: "single", at }` or `{ kind: "range", start, end }`.
- Every error has the same body:

```json
{ "error": { "code": "VOTING_CLOSED", "message": "Voting closed on 2026-07-01", "details": [] } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The body or parameters break a schema or a domain rule; `details` lists each field |
| 401 | `UNAUTHENTICATED` | A private endpoint without a valid session |
| 403 | `FORBIDDEN` | A credential that does not grant this operation on this event |
| 404 | `NOT_FOUND` | Unknown event, results ID or option |
| 409 | `VOTES_EXIST`, `ALREADY_CONFIRMED`, `VOTING_CLOSED`, `EMAIL_NOT_FAILED` | The operation conflicts with the event's current state |
| 410 | `EVENT_CANCELLED` | The event was cancelled; the body carries its title in `error.title` |
| 429 | `RATE_LIMITED` | Too many requests; `Retry-After` header |
| 500 | `INTERNAL_ERROR` | An unexpected failure (e.g. the database is down); it says nothing about what failed, and the log line never carries the URL, the message or request data |
| 502 / 504 | `INTERPRETER_FAILED` / `INTERPRETER_TIMEOUT` | The date interpreter failed or did not answer in time |

## Sign-in and profile

| Method and path | Body → response | Who | Notes |
|---|---|---|---|
| `POST /api/auth/email-otp/send-verification-otp` | `{ email }` → `200` | Anyone | Better Auth plugin. Rate limited per email and IP; resend allowed after ≈ 30 s. |
| `POST /api/auth/sign-in/email-otp` | `{ email, otp }` → `200` + session cookie | Anyone | Creates the account if new. `400` wrong code (attempts left in `details`), expired, or too many attempts. |
| `POST /api/auth/sign-out` | → `200` | Session | Deletes the session on the server. |
| `GET /api/auth/get-session` | → `{ user: { id, name, email } }` or `null` | Anyone | |
| `GET /api/me` | → `{ name, email }` | Session | |
| `PATCH /api/me` | `{ name }` → `{ name, email }` | Session | `name`: 2–30 characters after trimming. |
| `GET /api/me/events` | → `[{ id, title, state, deadline, createdAt }]` | Session | Own events only, newest first. |

The exact sign-in paths follow Better Auth's email-code plugin; they are confirmed in the week-B trial.

## Events (organizer)

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `POST /api/events` | `{ title, organizerName, timeZone, deadline, note?, anonymous, options[], verification? }` → `201 { id, resultsId, managementToken, participationUrl, managementUrl, resultsUrl }` | Session, or `verification: { email, code }` on the first event of a browser | One transaction: account (if new) + event + options + session + summary email row. Options without IDs; the API validates, sorts and assigns IDs. `400`: title 1–50, name 2–30, note ≤ 150, 1–60 options, dates ≤ 12 months ahead, no duplicates or degenerate ranges, times only on single dates, deadline not in the past. |
| `GET /api/events/:id` | → event with options, state, links, vote count, confirmation, email states | Owner session or management token | `403` otherwise; `410` if cancelled. |
| `PUT /api/events/:id/options` | `{ options[] }` → event | Owner session or management token | Replaces the whole list with new IDs. `409 VOTES_EXIST` if any vote exists, checked in the same transaction. |
| `PATCH /api/events/:id/deadline` | `{ deadline }` → event | Owner session or management token | Not in the past; reopens a closed event; reschedules the "voting closed" email. `409` if confirmed. |
| `POST /api/events/:id/close` | → event | Owner session or management token | Closes voting now and schedules the "voting closed" email for now. |
| `POST /api/events/:id/confirmation` | `{ optionId }` → event | Owner session or management token | `400` option not of this event; `409 ALREADY_CONFIRMED`. Closes voting and removes the pending "voting closed" email. |
| `DELETE /api/events/:id` | → `200 { title, cancelledMessage }` | Owner session or management token | Deletes the event and everything under it, keeps the tombstone. Repeating it answers `410`. |
| `POST /api/events/:id/emails/:type/retry` | → email state | Owner session or management token | `type`: `summary` or `voting-closed`. `409 EMAIL_NOT_FAILED` unless its state is failed. |

## Voting (participant)

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `GET /api/public/events/:id` | → `{ title, organizerName, note, deadline, timeZone, anonymous, state, options[], confirmedOption }` | Anyone with the participation link | `state` is `closed` from `closes_at` on, even if nothing changed the stored state; `confirmedOption` is `null` until a date is confirmed. Never returns the organizer email, tokens, counts or other votes. `404` unknown (the results ID does not work here), `410` cancelled (`error.title`). Never cached. |
| `POST /api/public/events/:id/participations` | `{ name?, votes: { [optionId]: "available" \| "preferred" \| "unavailable" } }` + header `Idempotency-Key` → `201 { participationId, editToken, editUrl }` | Anyone with the participation link | One transaction. `400`: name 2–30 characters after trimming on named events and absent on anonymous ones; `votes` must answer every option of the event exactly once (a missing option, or one that is not of this event, is refused, never given a default state); more than one preferred. `409 VOTING_CLOSED` when closed, confirmed or past `closes_at`. The same `Idempotency-Key` returns the first answer instead of a second vote. |
| `GET /api/public/events/:id/participations/mine` | → `{ name, votes }` | `X-Vote-Token` | `403` if the token is not of this event. |
| `PUT /api/public/events/:id/participations/mine` | `{ name?, votes }` → `200` | `X-Vote-Token` | Same rules as creating it. |

## Results

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `GET /api/results/:resultsId` | → `{ title, final, totalVoters, winners[], alternatives[], tie, confirmedOption? }`; each option with `attending`, `notAttending`, `preferred` and, on named events, `names[]` | Anyone with the results link | Names only on named events, Spanish collation. The participation ID does not work here. `404` / `410`. |

## Date interpretation

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `POST /api/date-interpretations` | `{ text, timeZone }` → `{ options[], notUnderstood: string[] }` | Anyone (wizard) | `text` 1–120 characters. The answer is validated with the same option rules; anything invalid is dropped and reported in `notUnderstood`. Rate limited per IP (e.g. ≈ 20 requests per hour; the event does not exist yet). `502` / `504` on interpreter failures; the wizard keeps working by hand. |

## Link previews

| Method and path | Response | Notes |
|---|---|---|
| `GET /vote/:id` (HTML) | The SPA's `index.html` with `og:title` and `og:description` of the event | The CDN forwards this one route to the API so chat apps see the title without running JavaScript. Cancelled or unknown events get a generic preview. |
