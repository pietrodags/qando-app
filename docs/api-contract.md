# qando — API contract (outline)

The full contract is **generated**: Zod schemas in the shared `contracts` package are the single source for request validation, TypeScript types and the OpenAPI document served with Swagger UI at `/api/docs`. This outline lists the main endpoints, what they take and return, and who may call them; field-level details live in the schemas.

## Conventions

- REST over HTTPS, JSON bodies, base path `/api`.
- **Credentials**:
  - *Session*: the cookie `__Secure-qando.session_token` set by Better Auth (`qando.session_token` over plain HTTP, locally): HttpOnly, Secure, SameSite=Lax, valid 90 days from its last use and renewed at most once a day (the renewed cookie is sent back on any request that reads it). A change (any method but `GET`, `HEAD`, `OPTIONS`) that carries the cookie with a missing `Origin` or one other than qando's (`BETTER_AUTH_URL`) is refused `403 FORBIDDEN` before the session is read (CSRF); Better Auth's own routes check the same.
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
| 400 | `VALIDATION_FAILED` | The body, headers or parameters break a schema or a domain rule, or the request cannot be read (broken path, JSON or charset, a body too large); `details` lists each problem |
| 401 | `UNAUTHENTICATED` | A private endpoint without any credential (no session, no management token); a session that expired or was signed out counts as none |
| 403 | `FORBIDDEN` | A credential that does not grant this operation on this event (another event's token, the session of another account); management endpoints answer it for an unknown event too (never `404`), so a wrong token learns nothing. Also a change sent with the session from a page of another site (CSRF) |
| 404 | `NOT_FOUND` | Unknown event, results ID or option |
| 409 | `VOTES_EXIST`, `ALREADY_CONFIRMED`, `VOTING_CLOSED`, `EMAIL_NOT_FAILED` | The operation conflicts with the event's current state |
| 410 | `EVENT_CANCELLED` | The event was cancelled; the body carries its title in `error.title` |
| 429 | `RATE_LIMITED` | Too many requests from one client address; `Retry-After` gives the seconds to wait. Every endpoint opened with a capability link or token (everything under `/api/public/events/{id}`, `/api/results/{resultsId}` and `/api/events/{id}`) shares one count: **60 requests a minute per address** (IPv6 per /56 network), refused before any database work. The address is read from `X-Forwarded-For` past the hosting's known proxies |
| 500 | `INTERNAL_ERROR` | An unexpected failure (e.g. the database is down); it says nothing about what failed, and the log line never carries the URL, the message or request data |

## Sign-in and profile

| Method and path | Body → response | Who | Notes |
|---|---|---|---|
| `POST /api/auth/sign-in-code` | `{ email }` → `200 { sent: true, resendAfterSeconds: 30 }` | Anyone, from qando's pages | Ours, not Better Auth's (Better Auth creates and stores the code; qando sends the email, so a failed delivery reaches the page). Emails are trimmed and compared in lower case. A new 6-digit code replaces the last one, valid for 10 minutes and 5 wrong tries. `400 VALIDATION_FAILED`; `403 FORBIDDEN` from a page of another site or without `Origin`, session or not; `429 RATE_LIMITED` with `Retry-After`: per email a new code after 30 s and at most 5 an hour (a code the email server refused does not count), and 20 an hour per address; `502 CODE_NOT_DELIVERED` when the email server did not take the email (asking again sends a new code; the last delivered code is still accepted, with its own tries and expiry). Never cached. |
| `POST /api/auth/sign-in` | `{ email, code }` (6 digits) → `200 { signedIn: true }` + session cookie | Anyone, from qando's pages | Ours, not Better Auth's. Creates the account if new, already verified; the code is used up. `400`: `VALIDATION_FAILED`, `WRONG_CODE` with `error.attemptsLeft` (1–4), `CODE_EXPIRED` (expired, used, or never sent), or `TOO_MANY_ATTEMPTS` (void after 5 wrong tries, even for the right code); `403` as above; `429` past 30 tries per 15 minutes per address; `500` an unexpected failure. Never cached. |
| `POST /api/auth/sign-out` | → `200 { signedOut: true }` | Session | Ours, not Better Auth's (its route answers success even when the session could not be deleted). Deletes the session on the server, then clears its cookies; without a session it only clears them. `403` with the session from another site or without `Origin`; `500` when the session could not be deleted: the cookie is kept, so the page can retry. None of Better Auth's own routes is served. Never cached. |
| `GET /api/auth/get-session` | → `{ user: { id, name, email } }` or `null` | Anyone | |
| `GET /api/me` | → `{ name, email }` | Session | |
| `PATCH /api/me` | `{ name }` → `{ name, email }` | Session | `name`: 2–30 characters after trimming. |
| `GET /api/me/events` | → `[{ id, title, state, deadline, createdAt }]` | Session | Own events only, newest first. |

The sign-in and sign-out routes are qando's own; none of Better Auth's routes is served.

## Events (organizer)

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `POST /api/events` | `{ title, organizerName, timeZone, deadline, note?, anonymous, options[], verification? }` → `201 { id, resultsId, managementToken, participationUrl, managementUrl, resultsUrl }` | Session, or `verification: { email, code }` on the first event of a browser | One transaction: account (if new) + event + options + session + summary email row. Options without IDs; the API validates, sorts and assigns IDs. `400`: title 1–50, name 2–30, note ≤ 150, 1–60 options, dates ≤ 12 months ahead, no duplicates or degenerate ranges, times only on single dates, deadline not in the past. |
| `GET /api/events/:id` | header `X-Management-Token` or the owner's session cookie → `{ title, timeZone, deadline, state, options[], confirmedOption, voters, recommendedOptionIds, participationId, resultsId }`; email states join with HU09 | Owner session or management token | `:id` is the participation ID of the link (every management path uses it). `state` is the current one (`closed` from `closes_at` on); `recommendedOptionIds` are the results' winners in chronological order, empty with no votes or when nobody can attend, so a page or an agent can warn before confirming another option. Who is acting is resolved once for every management endpoint, from the token and the session; either one that manages the event grants it: no credential `401 UNAUTHENTICATED` (no database work), a token whose hash is not the event's (another event's, a participation or results link, an unknown event) or the session of another account `403 FORBIDDEN`, a cancelled event `410` with `error.title`; a malformed token `400` naming the header. The token is matched by its hash and never logged. Rate-limited with the voting endpoints. Never cached. |
| `PUT /api/events/:id/options` | `{ options[] }` → event | Owner session or management token | Replaces the whole list with new IDs. `409 VOTES_EXIST` if any vote exists, checked in the same transaction. |
| `PATCH /api/events/:id/deadline` | `{ deadline }` → event | Owner session or management token | Not in the past; reopens a closed event; reschedules the "voting closed" email. `409` if confirmed. |
| `POST /api/events/:id/close` | → event | Owner session or management token | Closes voting now and schedules the "voting closed" email for now. |
| `POST /api/events/:id/confirmation` | `{ optionId }` → `200` the event as `GET /api/events/:id` answers it | Owner session or management token | Before or after the deadline. One transaction locking the event, so votes being stored finish first and two confirmations at once cannot both win. `409 ALREADY_CONFIRMED` when another option is confirmed (a confirmation is final); the confirmed option sent again (a retry after a lost answer) answers `200` and changes nothing. `400 VALIDATION_FAILED`: an option that is not of this event (`OPTION_UNKNOWN` with its ID) or a broken body (`INVALID_FIELD`). Refusals of who is acting as in `GET /api/events/:id` (`401`, `403`, `410`). Closes voting; removes the pending "voting closed" email once emails exist (HU09). Rate-limited with the voting endpoints. Never cached. |
| `DELETE /api/events/:id` | → `200 { title, cancelledMessage }` | Owner session or management token | Deletes the event and everything under it, keeps the tombstone. Repeating it answers `410`. |
| `POST /api/events/:id/emails/:type/retry` | → email state | Owner session or management token | `type`: `summary` or `voting-closed`. `409 EMAIL_NOT_FAILED` unless its state is failed. |

## Voting (participant)

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `GET /api/public/events/:id` | → `{ title, organizerName, note, deadline, timeZone, anonymous, state, options[], confirmedOption }` | Anyone with the participation link | `state` is `closed` from `closes_at` on, even if nothing changed the stored state; `confirmedOption` is `null` until a date is confirmed. Never returns the organizer email, tokens, counts or other votes. `400` malformed link (broken percent-encoding), `404` unknown (the results ID does not work here), `410` cancelled (`error.title`). Never cached. |
| `POST /api/public/events/:id/participations` | `{ name?, votes: { [optionId]: "available" \| "preferred" \| "unavailable" } }` + header `X-Vote-Token` → `201 { participationId }` | Anyone with the participation link | The voting page creates the vote-edit token (≥ 128 random bits, base64url, 22–64 characters) before the first send and builds the private link `/vote/:id/my-vote#t=<token>` itself; the API stores only its SHA-256 hash. One transaction. `400 VALIDATION_FAILED`, every problem in `details`: a field that breaks the schema (`INVALID_FIELD`, where and its path, never its value); name 2–30 characters after trimming on named events and absent on anonymous ones; `votes` must answer every option of the event exactly once (a missing option, or one that is not of this event, is refused, never given a default state); more than one preferred; a token that already holds a vote of another event. `409 VOTING_CLOSED` when closed, confirmed or past `closes_at`. **The token is the idempotency key:** a send repeated with it (double click, retry after a lost answer, even at the same time) stores no second vote and gets the first answer, whatever its body or the event's state now. |
| `GET /api/public/events/:id/participations/mine` | header `X-Vote-Token` → `200 { name?, votes }` | The voter (vote-edit token) | The stored vote in the shape the voting page sends it (`name` trimmed, absent on anonymous events), so the page can show it and send it back edited. Answered **whatever the event's state** (closed or confirmed too): reading changes nothing. `403 FORBIDDEN` when the token holds no vote of this event (none at all, or one of another event: both answer the same, so a token learns nothing about other events). `400` malformed token, `404` unknown link, `410` cancelled. Never cached. |
| `PUT /api/public/events/:id/participations/mine` | `{ name?, votes }` + header `X-Vote-Token` → `200 { name?, votes }` | The voter (vote-edit token) | Replaces the name and every state of the same participation (same voter, same `participationId`) in one transaction and answers what it stored. Same rules as creating it (`400 VALIDATION_FAILED` with every problem, `409 VOTING_CLOSED`), checked after the token: `403 FORBIDDEN` as in `GET`. Edits of the same vote sent at once are applied one after the other; the last one wins. Never cached. |

## Results

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `GET /api/results/:resultsId` | → `{ title, timeZone, final, outcome, voters, attending, notAttending, winnersListed, winners[], alternatives[], confirmedOption }`; each shown option is `{ option, preferred, available, unavailable, names? }`, `names` being `{ preferred[], available[], unavailable[] }` | Anyone with the results link; the management page and "Mis eventos" link to it | `final` is `false` while voting is open (provisional), `true` once closed, confirmed or past `closes_at`. `outcome` picks the sentence: `no-votes`, `nobody-can-attend`, `one`, `two`, `three`, `several` (4+), `all`; `winnersListed` when 1–3 winners. Winners in chronological order; alternatives are as well attended but less preferred, most preferred first; less attended options are never sent. `names` only on named events, Spanish collation; voters with the same name are told apart in the order they voted ("Ana", "Ana (2)"), with the same label on every option. `400` malformed link, `403 FORBIDDEN` with the participation link (also of a cancelled event), `404` unknown, `410` cancelled (`error.title`). Rate-limited with the voting endpoints. Never cached. |

## Date interpretation

| Method and path | Body → response | Who | Rules and errors |
|---|---|---|---|
| `POST /api/date-interpretations` | `{ text, timeZone, region }` → `{ options[], questions[], notices[] }` | Anyone (wizard) | `text` 1–120 characters; `timeZone` an IANA zone (today is taken in it); `region` the browser's region (`"ES"`, `"US"`…, optional), which orders dates in figures. The text editor (Vertex AI, EU region) copy-edits the phrase with a 3 s limit and a check of its answer; on a timeout, an error or a failed check the phrase is read as written, so the editor never causes an error response. The rules reader produces the options, validated with the same option rules as manual ones. **`options`**: `{ dates, time }` as in step 2's data model; `time` is `null`, `{ kind: 'single', at }`, `{ kind: 'range', start, end, nextDay? }` or `{ kind: 'question', question }` (the index of its question). **`questions`**: `{ fragment, dates[], morning, afternoon }`, one per distinct bare hour, in the phrase's order; `morning`/`afternoon` are the two times (single or range). **`notices`**: `{ kind, date?, fragment? }`, every one that applies, `kind` one of `timeUnclear`, `tooLate`, `dayNotWritten`, `unclear`, `mismatch`, `past`, `horizon`, `tooMany`; the copy is the web's. With `tooMany`, or when nothing is understood, `options` is empty. Rate limited per IP: about 20 requests per hour (the event does not exist yet). The phrase is never stored. |

## Link previews

| Method and path | Response | Notes |
|---|---|---|
| `GET /vote/:id` (HTML) | The SPA's `index.html` with `og:title` and `og:description` of the event | The CDN forwards this one route to the API so chat apps see the title without running JavaScript. Cancelled or unknown events get a generic preview. |
