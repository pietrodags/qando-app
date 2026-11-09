# qando — Diagrams

Four diagrams, each answering one question. They are written in Mermaid, so GitHub renders them and they change with the code.

1. [Architecture](#1-architecture): which parts run where, and how they talk.
2. [Entity-relationship](#2-entity-relationship): what is stored, with keys, relations and constraints.
3. [Main flow](#3-main-flow): create → share → vote → results → confirm, with the relevant errors.
4. [Email flow](#4-email-flow): how an email goes from a trigger to the inbox, and what happens when it fails.

## 1. Architecture

```mermaid
flowchart LR
  subgraph Browser
    spa["Angular SPA<br/>(Transloco es.json)"]
  end
  cdn["CDN<br/>(static files)"]
  subgraph EU["EU managed hosting"]
    api["API — Node.js + Express + TypeScript<br/>routes · Zod validation · permissions<br/>domain (options, votes, results)<br/>Better Auth (email code, sessions)"]
    worker["Email worker<br/>(same codebase, own process)"]
    db[("PostgreSQL<br/>Drizzle ORM + migrations")]
  end
  smtp["Transactional email provider<br/>(SMTP, EU)"]
  ai["Date interpreter<br/>(Jev; LLM fallback)"]
  chat["Chat apps<br/>(WhatsApp, Telegram…)"]

  spa -->|"loads app"| cdn
  spa -->|"JSON over HTTPS<br/>session cookie · capability token header"| api
  api -->|SQL| db
  worker -->|"reads pending rows<br/>FOR UPDATE SKIP LOCKED"| db
  worker -->|"Nodemailer SMTP"| smtp
  api -->|"sign-in code, sent at once"| smtp
  api -->|"text + time zone + today"| ai
  chat -->|"link preview (og: tags)"| api
```

| Part | Responsibility | Notes |
|---|---|---|
| Angular SPA | Views, routing, guards, forms; typed API client generated from the contract | Served as static files by the CDN. Never holds secrets. |
| API | Every validation and permission check; domain logic; sessions; capability tokens | One Express app. Zod schemas in a shared `contracts` package are the single source for validation, types and the OpenAPI document (Swagger UI). |
| Email worker | Sends the queued emails (summary, voting closed), retries with growing waits | Separate process so a slow SMTP server never delays an API request. Restarts resume the queue. |
| PostgreSQL | Users, sessions, events, options, votes, confirmations, the email queue | Every compound operation runs in one transaction. |
| Email provider | Delivers email over SMTP | Scaleway Transactional Email (EU), STARTTLS on port 587; a test SMTP server in the tests. |
| Date interpreter | Turns plain-language text into date candidates | Called only by the API, behind a `DateInterpreter` interface; answers are validated with the same rules as manual dates. |

The hosting provider is chosen by comparing costs; the decisions and the deployment configuration are in the technical decisions document.

## 2. Entity-relationship

```mermaid
erDiagram
  USER ||--o{ SESSION : "has"
  USER ||--o{ EVENT : "owns"
  EVENT ||--|{ OPTION : "offers (1..60)"
  EVENT ||--o{ PARTICIPATION : "receives"
  PARTICIPATION ||--|{ VOTE : "answers"
  OPTION ||--o{ VOTE : "is answered by"
  EVENT ||--o| CONFIRMATION : "may have"
  OPTION ||--o| CONFIRMATION : "is confirmed as"
  EVENT ||--o{ NOTIFICATION : "queues (≤ 1 per type)"

  USER {
    text id PK
    text name
    text email UK "lowercase"
    bool email_verified "true: set by the code"
    timestamptz created_at
  }
  SESSION {
    text id PK
    text user_id FK
    text token UK "signed in the cookie"
    timestamptz expires_at
  }
  VERIFICATION {
    text id PK
    text identifier "sign-in-otp-email"
    text value "code hash and attempts"
    timestamptz expires_at
  }
  EVENT {
    uuid id PK
    text public_id UK "participation link"
    text results_id UK "results link"
    text management_token_hash UK
    text owner_id FK
    text organizer_name
    text organizer_email
    text title "1..50 chars"
    text note "nullable, ≤ 150"
    text time_zone "IANA"
    date deadline
    timestamptz closes_at "deadline 23:59 in time_zone"
    bool anonymous
    enum state "open | closed | confirmed"
    timestamptz created_at
  }
  OPTION {
    uuid id PK
    uuid event_id FK
    int position "chronological"
    date start_date
    date end_date "nullable: single date"
    time start_time "nullable: whole day"
    time end_time "nullable: single time"
  }
  PARTICIPATION {
    uuid id PK
    uuid event_id FK
    text name "nullable: anonymous"
    text edit_token_hash UK
    timestamptz created_at
    timestamptz updated_at
  }
  VOTE {
    uuid participation_id PK, FK
    uuid option_id PK, FK
    uuid event_id FK "same event on both sides"
    enum state "available | preferred | unavailable"
  }
  CONFIRMATION {
    uuid event_id PK, FK
    uuid option_id FK
    timestamptz confirmed_at
  }
  NOTIFICATION {
    uuid id PK
    uuid event_id FK
    enum type "summary | voting_closed"
    text recipient
    timestamptz scheduled_at
    enum status "pending | sent | failed"
    int attempts
    text last_error "no credentials or personal data"
    timestamptz sent_at
  }
  CANCELLED_EVENT {
    text public_id PK
    text results_id UK
    text title
    timestamptz cancelled_at
  }
```

`VERIFICATION` (sign-in codes) and `CANCELLED_EVENT` (tombstones) have no relations: a code belongs to an email that may have no account yet, and a tombstone outlives the event it replaces.

**Constraints**

| Table | Constraint | Why |
|---|---|---|
| EVENT | `public_id`, `results_id`: ≥ 128 random bits, unique | Capability links that cannot be guessed. They are kept in clear because the management page shows them again; the management token is only stored as a hash. |
| EVENT | `owner_id` NOT NULL | Every event belongs to a verified account. Added with sign-up (HU01), in the same migration as the `USER` table: the events stored before it (by the seed script) got the verified account of their organizer email, and the seed script creates that account from then on. |
| USER | `email` unique | One account per email; Better Auth stores it lowercase. |
| SESSION | `token` unique, `ON DELETE CASCADE` from `USER` | The cookie carries the token signed with the server's secret, so the stored token alone does not open a session. |
| OPTION | `end_date > start_date` when set; `end_time > start_time` when set; times only when `end_date` is null; unique (`event_id`, `start_date`, `end_date`, `start_time`, `end_time`) with nulls not distinct; unique (`event_id`, `position`) | No degenerate ranges, times only on single dates, no exact duplicates (a whole day twice counts as a duplicate), one option per position. |
| OPTION | At most 60 per event, dates at most 12 months ahead | Checked by the API in the same transaction (a row count is not a column constraint). |
| VOTE | Composite FKs (`participation_id`, `event_id`) and (`option_id`, `event_id`) | A vote can never point at an option of another event. |
| VOTE | Partial unique index: one `preferred` per participation | At most one preferred option. |
| — | Text lengths (title, note, names) | Not a column check: lengths count characters as people see them (graphemes), which only the domain does; the API validates them before writing. |
| CONFIRMATION | Primary key `event_id` | A confirmation is final: a second one is impossible. |
| NOTIFICATION | Unique (`event_id`, `type`) | One summary and one "voting closed" email per event: retries and restarts never create duplicates. |

**Deletion policy (cancelling an event).** One transaction inserts the `CANCELLED_EVENT` row and deletes the `EVENT`. Options, participations, votes, the confirmation and its notifications go with it (`ON DELETE CASCADE`). Deleting a user is not offered in v1 (`EVENT.owner_id` is `ON DELETE RESTRICT`).

**Correspondence with the storage.** Each entity is one PostgreSQL table, defined in Drizzle and created by versioned migrations. `USER`, `SESSION` and `VERIFICATION` are Better Auth's tables through its Drizzle adapter: their exact columns follow the library, and only the fields that matter here are shown. Better Auth also needs an `accounts` table (other ways to prove identity, such as passwords or social sign-in), which qando leaves empty.

## 3. Main flow

```mermaid
flowchart TD
  A([Organizer opens qando]) --> B[Wizard: title, name, dates, times, deadline, email]
  B --> C{Signed in?}
  C -->|no| D[Code sent to the email]
  D --> E{Code right?}
  E -->|wrong / expired| D
  E -->|yes| F[Account + event + session in one transaction]
  C -->|yes| F
  F --> G[¡Hecho! participation link + summary email queued]
  G --> H[Organizer shares the participation link]
  H --> I[Participant opens the link]
  I --> J{Event state?}
  J -->|not found / cancelled| X1[Error page with the reason]
  J -->|closed| X2[Votación cerrada]
  J -->|confirmed| X3[Fecha confirmada, no counts]
  J -->|open| K[Name if named · marks options · one preferred]
  K --> L{Still open when sent?}
  L -->|no| X2
  L -->|yes| M[Vote saved · thank-you + edit link]
  M --> N[Organizer opens the results]
  N --> O[Winners, alternatives, ties · provisional or final]
  O --> P[Organizer confirms an option]
  P --> Q{Recommended, voted and closed?}
  Q -->|not all| R[Explicit confirmation dialog]
  R --> S
  Q -->|yes| S[Confirmed: voting closed, participants see the date]
```

## 4. Email flow

```mermaid
sequenceDiagram
  autonumber
  participant O as Organizer
  participant API
  participant DB as PostgreSQL
  participant W as Email worker
  participant SMTP as Email provider

  O->>API: Create event / close voting / extend deadline
  API->>DB: One transaction: change + notification row (pending, scheduled_at)
  API-->>O: Success (does not wait for the email)
  loop Every few seconds
    W->>DB: Take due pending rows (FOR UPDATE SKIP LOCKED)
    W->>SMTP: Send
    alt accepted
      W->>DB: status = sent, sent_at
    else error or timeout
      W->>DB: attempts + 1, last_error, scheduled_at = later (growing wait)
      Note over W,DB: after the last automatic attempt, status = failed
    end
  end
  O->>API: Management page
  API-->>O: Email states (pending, sent, failed + "Reintentar")
  O->>API: Retry a failed email (management link or session)
  API->>DB: status = pending, scheduled_at = now
```

| Email | Trigger | Recipient | Rescheduled or removed when |
|---|---|---|---|
| Summary | Event created | Organizer email | Removed if the event is cancelled before it is sent |
| Voting closed | `closes_at` reached, or the organizer closes voting early (scheduled for now) | Organizer email | Rescheduled when the deadline is extended; removed when a date is confirmed before it is sent, or the event is cancelled |

The sign-in code email is the only one outside the queue: the organizer is waiting for it on screen, so the API sends it at once and shows a failure there with "Reenviar código". A row marked `sent` is never sent again, and the unique (`event_id`, `type`) index stops a second row. Delivery is *at least once*: if the worker dies in the instant between the provider accepting an email and the row being marked `sent`, that one email can go out twice after the restart. This window is accepted; it cannot be closed with SMTP. SMTP acceptance does not prove the email reached the inbox; the management page says "enviado", not "recibido".
