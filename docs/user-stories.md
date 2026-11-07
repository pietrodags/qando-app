# qando — User stories

**Scope:** v1, delivered on 2026-11-23. Priorities follow the MoSCoW document: HU01 and HU03–HU10 are **Must**, HU02 is **Should**.
**Order:** the stories follow the product's real path: sign in → create → share → vote → results → confirm → manage → emails → AI.

In the UI a *proposal* is called an **event**. Every story has an executable Gherkin feature (`playwright-bdd`) in [`e2e/features/`](../e2e/features/), named after the story. The feature holds the main path, the errors and the permission checks. UI copy is shown in Spanish, the language of v1.

## 1. Shared rules

### Roles

| Role | Who | How they are identified |
|---|---|---|
| **Organizer** | Creates an event and manages it | Account session (verified email) **or** the event's management link |
| **Participant** | Votes on an event | The event's participation link; no account |
| **Results viewer** | Whoever the organizer shares the results link with | The event's results link |
| **Anonymous visitor** | Anyone else | Nothing |

### What each link allows

Each event has three links with separate unguessable tokens (≥ 128 bits, stored hashed). The browser reads the token from the link, keeps it for that event, removes it from the address bar and sends it in a request header. The **API checks every permission**; hiding a button is never the only protection.

| Credential | Read event | Vote / edit own vote | See results | Manage (edit options, deadline, confirm, cancel, retry email) |
|---|---|---|---|---|
| Participation link | Public data only (title, organizer name, note, deadline, options) | ✅ while the event is open | ❌ | ❌ |
| Vote-edit token (kept by the voter's browser, plus a private edit link) | — | ✅ that one vote, while open | ❌ | ❌ |
| Results link | Title and results | ❌ | ✅ | ❌ |
| Management link | ✅ | ❌ | ✅ | ✅ |
| Owner's session | ✅ (own events) | ❌ | ✅ (own events) | ✅ (own events) |

The participation link never reveals the organizer's email, the other links or authentication data. The results link cannot be derived from the participation link.

### Event states

| State | Entered when | Votes | Participants see |
|---|---|---|---|
| **Open** | Created; or reopened by extending the deadline | Accepted | The voting page |
| **Closed** | The deadline passes (23:59 of the deadline day in the event's time zone) or the organizer closes voting early | Rejected | "Votación cerrada" |
| **Confirmed** | The organizer confirms one option (from open or closed) | Rejected | "Fecha confirmada: …" without counts |
| **Cancelled** | The organizer deletes the event (from any state) | Rejected | "Este evento ha sido cancelado" with the title |

**Automatic closing:** the API compares the current time with the event's closing instant on every vote, so voting closes on time even if a background job is late. The "voting closed" email is a scheduled job (HU09).

### Options

An option is one date or a range of dates, with an optional single time or time range (times only on single dates). Every date, range or time the organizer creates is exactly one option. Options may overlap and are never merged. Each event has at most **60 options**, dated at most **12 months** ahead. The voting page, results and emails show the same list, in chronological order, in the event's time zone (never converted).

### Definition of done (every story)

A story is done when:
1. Its Gherkin feature passes against the deployed app, together with every earlier feature.
2. Unit tests were written before the code (TDD), and the mutation score reaches the threshold: domain ≥ 85 %, rest ≥ 70 % (StrykerJS, blocking in pull requests).
3. Permissions and validations are enforced by the API and covered by integration tests against PostgreSQL.
4. Each view has its loading, empty, error and success states. It works at 375, 768 and 1280 px and can be used with the keyboard alone (WCAG 2.2 AA: focus, contrast, labels).
5. The API contract (OpenAPI generated from the Zod schemas) and the docs are updated, and the issue is closed with `closes #N`.

---

## HU01 — Sign in with an email code · Must

**As an** organizer, **I want** my account to be created when I verify my email with a code, without a password, and to sign in and out from any device, **so that** I manage all my events in one place without a sign-up form.

**Rules and permissions**
- No passwords and no sign-up form: verifying the email *is* the registration. Participants never need an account.
- The first time a browser creates an event, "Crear" sends a 6-digit code to the email given in the last step. Verifying it creates the account (if new), saves the event owned by it and opens the session, **in one transaction**.
- "Entrar" in the header: email → code → back to the page where it was pressed ("Mis eventos" from the home page). It also creates the account if none exists.
- Session in an HttpOnly, Secure, SameSite cookie, validated by the API on every private request, with CSRF protection.
- Codes are stored hashed, expire after about 10 minutes and allow 5 attempts. Sending is limited per email and per IP. A new code cancels the previous one.

**Acceptance criteria**
1. Creating the first event in a browser shows "Te hemos enviado un código a ana@…" with a 6-digit field. With the right code the event is created and step 5 ("¡Hecho!") appears with the user's initial in the header.
2. While signed in, creating an event asks for no code; the name is prefilled and editable; the email is the account's, read-only, with "¿No eres tú? Cerrar sesión" below it.
3. "Entrar" with email and code, on a device that never created an event, shows "Mis eventos" with all the account's events.
4. Opening a private route ("Mis eventos", "Perfil") without a session asks to sign in, then continues to that route.
5. "Cerrar sesión" deletes the session on the server, returns to the home page with "Has cerrado sesión" and removes from the browser the management links stored for the account's events. The voters' edit tokens are kept.

**Validations, errors and edge cases**
- Wrong code: "Código incorrecto. Te quedan N intentos."; after 5 attempts the code is void: "Demasiados intentos" + "Enviar código nuevo".
- Expired code: "El código ha caducado" + "Enviar código nuevo".
- "Reenviar código" is enabled after about 30 s, with a visible countdown; at most about 5 sends per hour per email.
- The code does not arrive: "Revisa la carpeta de spam" and "¿Email mal escrito? Cambiar email", which returns to the last step with everything kept.
- A mistyped email creates nothing. That address receives at most the code email, which says "Si no lo has pedido tú, ignora este mensaje".
- The wizard draft survives a reload: back to the code screen with everything intact.
- A code asked on the computer can be read and typed from the phone's mail.
- The code email is sent at once (not queued). If sending fails, the code screen says so and offers "Reenviar código".
- The API rejects private requests with no session, an expired session, or on another owner's events (`401` / `403`).

**Done when:** the shared definition of done is met, and the code paths are tested against a fake SMTP server.
**Feature:** [`e2e/features/hu01-sign-in-with-code.feature`](../e2e/features/hu01-sign-in-with-code.feature)

---

## HU02 — Profile · Should

**As a** signed-in organizer, **I want** to see my profile and edit my name, **so that** my events show the name I choose.

**Rules and permissions**
- Only the signed-in user's own profile; there is no profile ID in the URL.
- The email is shown read-only (it is the identity).

**Acceptance criteria**
1. "Perfil" in the header menu shows the name and email of the account.
2. Editing the name and saving shows "Guardado" and the new name after a reload.
3. The new name is prefilled in the next event's wizard. Events already created keep the name they were created with.

**Validations, errors and edge cases**
- Empty name, or longer than 30 characters: in-page message next to the field; nothing is saved.
- Without a session the route asks to sign in (HU01).

**Done when:** the shared definition of done is met.
**Feature:** [`e2e/features/hu02-profile.feature`](../e2e/features/hu02-profile.feature)

---

## HU03 — Create an event with date and time options · Must

**As an** organizer, **I want** to create an event with date and time options, without filling a sign-up form, **so that** my group can tell me when they can meet.

**Rules and permissions**
- The wizard steps: title and organizer name → dates (calendar, ranges, or plain language, HU10) → optional times on single dates → summary → deadline, optional note, anonymous voting (off by default) and email → "Crear".
- Requires a verified email: the code of HU01 or an open session.
- Every date, range or time created is exactly one option (see *Options*). At most 60 options; dates at most 12 months ahead; a date range spans at least 2 days; a time range ends after it starts; minutes in quarters.
- The event stores the organizer's IANA time zone. The deadline is a date: voting closes at 23:59 of that day in that zone.
- On creation the API generates the participation, management and results links and queues the summary email (HU09) **in the same transaction**.

**Acceptance criteria**
1. With title, name, at least one date and a valid email, "Crear" (after the code if needed) shows step 5 with the participation link and the share buttons.
2. Two single dates, one with two times, produce three options for the participants: one per time, plus the date without times as a whole day.
3. An overlapping range and single date are both kept as separate options.
4. The summary step lists every option exactly as it will be voted on.
5. The created event survives an API restart (PostgreSQL).

**Validations, errors and edge cases**
- "Siguiente" stays disabled until the step is valid. The message next to the control says why: no title, name shorter than required, no dates, invalid email.
- Turning "Horario" on with no single date selected shows an inline hint; the event can still be created without times.
- Approaching 60 options shows a notice; the API rejects more than 60, dates beyond 12 months, exact duplicates and degenerate ranges, even if the browser is bypassed.
- A deadline after the first proposed date shows a warning, not a block.
- If the server fails on "Crear", the wizard is kept and an error with "Reintentar" is shown.

**Done when:** the shared definition of done is met, and option validation has unit tests in the shared domain package.
**Feature:** [`e2e/features/hu03-create-event.feature`](../e2e/features/hu03-create-event.feature)

---

## HU04 — Manage, edit and cancel my events · Must

**As an** organizer, **I want** to see, edit and cancel my events, **so that** I can fix mistakes and keep my group informed.

**Rules and permissions**
- The management page opens with the management link or from "Mis eventos" (session, own events only). The management link keeps working when the organizer is signed in.
- "Mis eventos" lists the account's events with title, state and deadline, newest first.
- **Edit options only while nobody has voted:** "Editar opciones" reopens the wizard on the date and time steps with the current options; saving replaces the whole list. The participation link does not change. Title and note are never editable.
- **Deadline:** extending it reopens a closed event and reschedules the "voting closed" email; "Cerrar votación" closes it now and sends that email at once.
- **Cancel** at any time, after an explicit confirmation.

**What cancelling deletes and keeps**

| Deleted | Kept (tombstone) |
|---|---|
| Options, participations, votes, pending emails, the confirmation | Event ID, results ID, title, cancellation instant |

**Acceptance criteria**
1. "Mis eventos" shows only the signed-in user's events; each opens its management page.
2. With no votes, "Editar opciones" opens the wizard with the current options; after saving, the participation link shows the new options.
3. With at least one vote, "Editar opciones" is disabled with "Ya hay votos: las opciones no se pueden cambiar".
4. Extending the deadline of a closed event reopens voting.
5. After cancelling, the organizer gets a ready-to-send "Evento cancelado" text with the title, with copy and share buttons. Opening the participation, management or results link shows "Este evento ha sido cancelado" with the title.

**Validations, errors and edge cases**
- A vote arrives while the organizer is editing: saving is rejected with a message, and nothing changes.
- Every write on a cancelled event is rejected; cancelling twice is harmless.
- A management link with a wrong or revoked token, or another owner's event from "Mis eventos": access refused (`403`), no event data shown.
- Extending to a date in the past is rejected.

**Done when:** the shared definition of done is met, and the edit-versus-vote race is covered by an integration test.
**Feature:** [`e2e/features/hu04-manage-event.feature`](../e2e/features/hu04-manage-event.feature)

---

## HU05 — Share the participation link · Must

**As an** organizer, **I want** to share a participation link, **so that** my group can vote without an account.

**Rules and permissions**
- The link is unguessable and valid in production; it grants reading the public event data and voting, nothing else.
- Sharing shows a preview with the event title (`og:` tags served by the API).

**Acceptance criteria**
1. Step 5 and the management page show the participation link with "Copiar" and share buttons (WhatsApp, email, native share where available).
2. Opening the link in a private window, without an account, shows the event's voting page.
3. Pasting the link in a chat shows a preview with the title.

**Validations, errors and edge cases**
- A link to an event that does not exist: the app's "Página no encontrada" page.
- A network or server error: "No se ha podido cargar" + "Reintentar", different from the above.
- A cancelled event: "Este evento ha sido cancelado" and its title.
- The participation API response never contains the organizer's email, the other links' tokens or any session data.

**Done when:** the shared definition of done is met.
**Feature:** [`e2e/features/hu05-share-link.feature`](../e2e/features/hu05-share-link.feature)

---

## HU06 — Vote and edit my vote · Must

**As a** participant, **I want** to say which options suit me and which one I prefer, and to correct my answer, **so that** the organizer can find the date that works best for the group.

**Rules and permissions**
- Each option is marked available, preferred or unavailable; **at most one preferred** per vote.
- Named events ask for the voter's name (at least 2 characters after trimming); anonymous events never ask for or store a name.
- The vote is saved in one transaction (all answers or none), and a repeated submission does not create a second vote.
- The voter's browser keeps an edit token. Reopening the participation link in the same browser opens the vote for editing. The thank-you screen offers a private "Editar mi voto" link for other devices.
- Votes and edits are rejected when the event is closed, confirmed or cancelled.
- Two voters with the same name stay distinct.

**Acceptance criteria**
1. A participant marks options, chooses one preferred, confirms and sees the thank-you screen. The vote appears in the organizer's results.
2. Reopening the link in the same browser shows the previous answers; changing one and confirming updates the results without a second voter.
3. The private edit link opens the same vote on another browser.
4. After the deadline the voting page shows "Votación cerrada" and no options to vote.
5. A confirmed event shows "Fecha confirmada: …" without counts.

**Validations, errors and edge cases**
- Marking a second preferred moves the preference (only one).
- Name shorter than 2 characters after trimming (e.g. "A" or "  A  "): the voting buttons stay disabled; "Li" enables them.
- Double-click or resubmission: one vote stored.
- A vote with an option from another event, or an unknown state: rejected by the API (`400`).
- A vote sent after the deadline from a page opened before it: rejected, and the page shows "Votación cerrada".
- The API never returns names on anonymous events, and never returns other voters' answers to participants.

**Done when:** the shared definition of done is met, and the vote validation has unit tests in the domain package.
**Feature:** [`e2e/features/hu06-vote.feature`](../e2e/features/hu06-vote.feature)

---

## HU07 — Compare the options · Must

**As an** organizer, **I want** to compare the options, **so that** I can see which date suits the group.

**Rules and permissions**
- Results open with the results link (shareable by the organizer), with the management link, or from "Mis eventos". Participants have no results link.
- Attendance of an option = available + preferred. The option with the highest attendance wins; ties are broken by the number of preferred; options still tied are all shown.
- Results count only the options the organizer created.
- Names are shown only on named events, sorted alphabetically (Spanish collation).

**Acceptance criteria**
1. The page shows the winning option(s), the alternatives, how many can and cannot attend, and who (on named events).
2. Before the deadline the results are marked "provisional"; after it, "final".
3. With no votes the page shows "Aún no ha votado nadie."
4. A tie between two or three options lists them; a tie between all options says so.
5. A confirmed event shows the confirmed option separately from the recommendation.

**Validations, errors and edge cases**
- All voters unavailable everywhere (attendance zero): no winner, a clear message.
- An unknown results link: the app's "Página no encontrada" page; a cancelled event: "Este evento ha sido cancelado".
- The participation token does not give access to results (`403`).

**Done when:** the shared definition of done is met, and the results engine passes its table of reference cases.
**Feature:** [`e2e/features/hu07-results.feature`](../e2e/features/hu07-results.feature)

---

## HU08 — Confirm the final date · Must

**As an** organizer, **I want** to confirm the final option, **so that** everyone knows the date is decided.

**Rules and permissions**
- With a session (own event) or the management link, before or after the deadline.
- The option must belong to the event. A confirmation is final in v1: a second one is rejected.
- Confirming closes voting at once and cancels the pending "voting closed" email.

**Acceptance criteria**
1. From the management page, choosing the recommended option and confirming shows "Fecha confirmada" on the management, results and participation pages.
2. Choosing an option that is not the recommended one, confirming with no votes, or confirming while voting is open asks for an explicit confirmation that explains the consequence (e.g. "la votación se cerrará").
3. Participants then see "Fecha confirmada: …" without counts, and can no longer vote.

**Validations, errors and edge cases**
- Option from another event, unknown option: rejected (`400`).
- Participation or results link, another owner's session: rejected (`403`).
- Second confirmation, or confirmation of a cancelled event: rejected with a message.

**Done when:** the shared definition of done is met.
**Feature:** [`e2e/features/hu08-confirm-date.feature`](../e2e/features/hu08-confirm-date.feature)

---

## HU09 — Summary and "voting closed" emails · Must

**As an** organizer, **I want** to receive the event summary and the "voting closed" email, and to know if a send fails, **so that** I keep my links and know when to decide.

**Emails**

| Email | Trigger | To | Content |
|---|---|---|---|
| Summary | The event is created | Organizer email | Title, options, deadline and time zone, note, participation link, management link |
| Voting closed | The deadline passes, or the organizer closes voting early | Organizer email | Winners and alternatives, results link, management link, "Confirmar fecha" button |

**Rules and permissions**
- Each email is stored as a pending row **in the same transaction** as the action that triggers it. A worker process sends pending rows and resumes after a restart.
- States: pending → sent or failed, with the attempt count; automatic retries with growing waits.
- **One row per event and email type:** an email already sent is never sent again (no duplicates on retries or restarts).
- Extending the deadline reschedules "voting closed"; it is not sent if the date was confirmed before the deadline or the event was cancelled.
- The management page shows each email's state. The organizer (session or management link) can retry a failed email; nobody else can.
- An SMTP failure never loses the event or the closing. Errors are logged without credentials or personal data.

**Acceptance criteria**
1. Creating an event leaves a sent summary email with both links (fake SMTP in tests).
2. Once the deadline passes, the "voting closed" email is sent once, with the results.
3. "Cerrar votación" sends it at once; extending the deadline reschedules it; confirming before the deadline means it is never sent.
4. With SMTP down, the event is created, the management page shows "Envío fallido" and "Reintentar"; retrying after SMTP recovers sends it once.

**Validations, errors and edge cases**
- Retry by a participation or results link: rejected (`403`). Retry of an email already sent: rejected.
- Worker restart: pending rows are sent once after the restart; rows already marked sent are never resent. (Delivery is at least once: a crash in the instant between the provider accepting an email and the row being marked sent can repeat that one email.)
- A cancelled event: pending emails are deleted.

**Done when:** the shared definition of done is met, plus one controlled real send in the deployed environment.
**Feature:** [`e2e/features/hu09-emails.feature`](../e2e/features/hu09-emails.feature)

---

## HU10 — Dates in plain language · Must

**As an** organizer, **I want** to type dates in plain language ("todos los lunes de junio"), **so that** I can propose many dates quickly.

**Rules and permissions**
- The text is interpreted by the backend, never in the browser; the AI credentials stay on the server.
- The interpreter receives the event's time zone and today's date in it. The result is validated with the same rules as HU03 (12 months, 60 options, no degenerate ranges).
- The organizer reviews the interpreted dates on the calendar before continuing, and can correct them by hand. Each interpreted group is exactly one option.
- Rate limit per IP (the event does not exist yet while the wizard is in use), e.g. about 20 requests per hour.

**Acceptance criteria**
1. "Todos los lunes de junio" selects every Monday of the next June on the calendar, for review.
2. A range ("del 3 al 7 de julio") becomes one range option.
3. Text that cannot be interpreted shows what was not understood, and the calendar keeps its previous selection.
4. The manual calendar always remains available.

**Validations, errors and edge cases**
- Empty text: nothing is sent.
- An invalid or out-of-limits answer from the AI: rejected by the backend, with a message, and the form is kept.
- AI error or timeout: "No se ha podido interpretar" with the manual calendar still usable.
- Too many requests: "Demasiadas peticiones, inténtalo en un momento".

**Done when:** the shared definition of done is met, and the interpreter passes its Spanish evaluation set. If the chosen AI provider fails its trial, the fallback provider sits behind the same interface and passes the same tests.
**Feature:** [`e2e/features/hu10-plain-language-dates.feature`](../e2e/features/hu10-plain-language-dates.feature)
