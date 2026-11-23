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

Each event has three links (voting, results and management), and each voter gets a link to edit their vote; every one carries its own unguessable value (≥ 128 bits). The **management** link and the voter's **edit** link carry a secret token: only its hash is stored, and the browser reads the token from the link, keeps it for that event, removes it from the address bar and sends it in a request header. The **voting** and **results** links carry an identifier in their path, stored as it is, because the management page shows both links again. The **API checks every permission**; hiding a button is never the only protection.

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

An option is one date or a range of dates, with an optional single time or time range (times only on single dates). Every date, range or time the organizer creates is exactly one option. Options may overlap and are never merged. Each event has at most **60 options**, dated from today to at most **12 months** ahead. The voting page, results and emails show the same list, in chronological order, in the event's time zone (never converted): by first day, then by start time, an option without a time counting from 0:00; a day or a time before a range that starts with it.

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
- The first time a browser creates an event, "Crear" sends a 6-digit code to the email given in the last step. Verifying it is two steps: the code signs in through the sign-in route (creating the account if new and opening the session), then the event is created with that session. If the second step fails, the organizer stays signed in and the wizard keeps the draft, so retrying needs no new code.
- "Entrar" in the header: email → code → back to the page where it was pressed ("Mis eventos" from the home page). It also creates the account if none exists.
- Session in an HttpOnly, Secure, SameSite cookie, validated by the API on every private request, with CSRF protection.
- Codes are stored hashed, expire after about 10 minutes and allow 5 attempts. Sending is limited per email and per IP. A new code cancels the previous one.

**Acceptance criteria**
1. Creating the first event in a browser asks for the email on the last step and shows, in the same card, "Te hemos enviado un código de 6 cifras a ana@…" with a 6-digit field. With the right code the event is created and the "¡Hecho!" card appears with the user's initial in the header.
2. While signed in, creating an event asks for no code; the name is prefilled and editable; the email is the account's, read-only, with "¿No eres tú? Cerrar sesión" below it, which signs out and keeps the wizard, asking for the email.
3. "Entrar" with email and code, on a device that never created an event, shows "Mis eventos" with all the account's events.
4. Opening a private route ("Mis eventos", "Perfil") without a session asks to sign in, then continues to that route.
5. "Cerrar sesión" deletes the session on the server, returns to the home page with "Has cerrado sesión" and removes from the browser every management link it stores (also those of other accounts' events opened there: on a shared computer nothing stays open; the links remain in their emails). The voters' edit tokens are kept.

**Validations, errors and edge cases**
- Wrong code: "Código incorrecto. Te quedan N intentos."; after 5 attempts the code is void: "Demasiados intentos" + "Enviar código nuevo".
- Expired code: "El código ha caducado" + "Enviar código nuevo".
- "Reenviar código" is enabled after about 30 s, with a visible countdown; at most about 5 sends per hour per email.
- The code does not arrive: "Revisa la carpeta de spam" and "¿Email mal escrito? Cambiar email", which returns to the last step with everything kept.
- A mistyped email creates nothing. That address receives at most the code email, which says "Si no lo has pedido tú, ignora este mensaje".
- The wizard draft survives a reload: back to the code screen with everything intact.
- A code asked on the computer can be read and typed from the phone's mail.
- The code email is sent at once (not queued). If sending fails, the page says so and the code can be asked again at once.
- An email that is not an address sends nothing: "Revisa el email: no parece una dirección completa."
- A session that expires while the wizard is filled in: "Crear" sends a code to the account's email and says "Tu sesión ha caducado."; the right code creates the event.
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
- The wizard steps: title and organizer name → dates (calendar, ranges, or plain language, HU10) → optional times on single dates, then the summary of the options in the same step and card, on the same columns (only with times) → deadline, optional note, anonymous voting (off by default) and email → "Crear".
- Requires a verified email: the code of HU01 or an open session.
- Every date, range or time created is exactly one option (see *Options*). At most 60 options; dates at most 12 months ahead; a date range spans at least 2 days; a time range ends after it starts; minutes in quarters.
- The event stores the organizer's IANA time zone. The deadline is a date: voting closes at 23:59 of that day in that zone.
- On creation the API generates the participation, management and results links **in one transaction**; the summary email (HU09) is queued in that same transaction.

**Acceptance criteria**
1. With title, name, at least one date and a valid email, "Crear" (after the code if needed) leaves only the "¡Hecho!" card, with the participation link and the share buttons.
2. Two single dates, one with two times, produce three options for the participants: one per time, plus the date without times as a whole day.
3. An overlapping range and single date are both kept as separate options.
4. With times, the summary of the times step lists every option exactly as it will be voted on.
5. The created event survives an API restart (PostgreSQL).

**Validations, errors and edge cases**
- "Siguiente" stays disabled (dimmed) until the step is valid. Each valid field shows a green tick; no sentence is shown next to the control, and screen readers hear with "Siguiente" what is missing: no title, name shorter than required, no dates, invalid email.
- The "Horario" switch is on screen only while a single date is selected, so it needs no hint; the event can still be created without times. Turning it off forgets the times marked.
- From 50 options on a counter shows how many of the 60 are taken, times included, and at 60 no more are marked; the API rejects more than 60, dates before today or beyond 12 months, exact duplicates, degenerate ranges, minutes outside the quarters, a time on a range of dates and the whole day of a date that also has times, even if the browser is bypassed.
- A deadline after the first proposed date shows a warning, not a block.
- If the server fails on "Crear", the wizard is kept and an error with "Reintentar" is shown.

**Done when:** the shared definition of done is met, and option validation has unit tests in the shared domain package.
**Feature:** [`e2e/features/hu03-create-event.feature`](../e2e/features/hu03-create-event.feature)

---

## HU04 — Manage, edit and cancel my events · Must

**As an** organizer, **I want** to see, edit and cancel my events, **so that** I can fix mistakes and keep my group informed.

**Rules and permissions**
- The management page opens with the management link or from "Mis eventos" (session, own events only). The management link keeps working when the organizer is signed in. Without a stored management link or a live session (e.g. the session expired after opening the event from "Mis eventos"), the page asks to sign in with the code and then comes back to the event.
- "Mis eventos" lists the account's events with title, state and deadline, newest first. Each row opens only the management page, which shows how voting goes and links "Ver los resultados completos"; the list carries no results ID.
- "Today" on the management page and in edit mode (the calendar's first day, the deadline selects) is counted in the event's time zone, as the API judges it.
- **Edit options only while voting is open and nobody has voted**, never on a confirmed event (a confirmation is final); a closed event with no votes is first reopened by extending the deadline. "Editar opciones" opens the wizard on the dates step with the current options; options already past when it opens (single dates before today, ranges that have already begun) are dropped, and a line names what was dropped. With times it saves on the times step's summary, otherwise on the dates step; the last step (the deadline) is not shown, and "Volver sin guardar" always leads back to the management page. A reload while editing starts again from the stored options (no draft, unlike creation). Saving replaces the whole list. The participation link does not change. Title and note are never editable. The summary email is not resent and nothing says so: its links still work and always lead to the current options.
- **Deadline:** the same three selects as the creation wizard's last step (day · month · year), offering only the days from today to twelve months ahead. An earlier deadline than the current one is allowed (to hurry the group); extending it reopens a closed event and reschedules the "voting closed" email. A deadline after the first proposed date (also when extending, also past every option) shows the creation's warning, never a block. A confirmed event's deadline cannot change.
- **"Cerrar votación"** sets the deadline to today and closes voting now, and the "voting closed" email is sent at once; the pages then show "Votación cerrada el {today}" (the original deadline is not kept). Pressed on an event already closed (by the deadline, an earlier close, another tab, a retry), it answers as the first time and changes nothing: the closing date stays the real one and no other email is sent. On a confirmed event it is refused and the page reloads with the confirmed date, where the button is gone.
- **Cancel** at any time, after an explicit confirmation. The text to forward is `Se ha cancelado "{title}".` and nothing more (no link), with the share row of the "¡Hecho!" card (copy, WhatsApp, Telegram, email, the device's share).

**What cancelling deletes and keeps**

| Deleted | Kept (tombstone) |
|---|---|
| Options, participations, votes, pending emails, the confirmation | Event ID, results ID, title, cancellation instant |

Nothing else is kept; the title is already public through the participation link.

**Acceptance criteria**
1. "Mis eventos" shows only the signed-in user's events; each opens its management page.
2. With no votes, "Editar opciones" opens the wizard with the current options; after saving, the participation link shows the new options.
3. With at least one vote, "Editar opciones" is disabled with "Ya hay votos: las opciones no se pueden cambiar".
4. Extending the deadline of a closed event reopens voting.
5. After cancelling, the organizer gets the ready-to-send text `Se ha cancelado "{title}".` with its share row on the cancelled card, which comes back with the text every time the management page of the cancelled event is opened (later from the email, after a reload). Opening the participation, management or results link shows "Este evento ha sido cancelado" with the title.
6. "Cerrar votación" closes voting at once: the pages show "Votación cerrada el {today}". Pressed again on the closed event, it changes nothing.

**Validations, errors and edge cases**
- A vote arrives while the organizer is editing: the save is refused, nothing changes, and the page goes back to the management page with a message, where "Editar opciones" is disabled. A save refused because the event was cancelled or confirmed meanwhile shows the cancelled card or the confirmed date.
- A save from an outdated list (e.g. another device saved new options first) is refused, so it never silently undoes the other; as when someone has voted, the page goes back to the management page with a message.
- Options replaced since the management page loaded: a confirmation of an option that no longer exists is refused, and the page shows the new options, chosen as when the page opens (none, unless one alone is the most voted), with the notice "No se ha confirmado la fecha: las opciones han cambiado desde otra pestaña o dispositivo. Elige de nuevo entre las de ahora." in an amber box at the top of "Elige la fecha final", which opens.
- Any management credential (any management token, any session) on a cancelled event is answered with the cancelled state and its title; a request with no credential at all is refused as unauthenticated. Cancelling twice is harmless: the page shows the same cancelled card with its text.
- A management link with a wrong or revoked token, or another owner's event from "Mis eventos": access refused (`403`), "No tienes acceso a este evento", no event data shown.
- The deadline selects offer no day before today; the API refuses a past deadline anyway.

**Done when:** the shared definition of done is met, and the edit-versus-vote race is covered by an integration test.
**Feature:** [`e2e/features/hu04-manage-event.feature`](../e2e/features/hu04-manage-event.feature)

---

## HU05 — Share the participation link · Must

**As an** organizer, **I want** to share a participation link, **so that** my group can vote without an account.

**Rules and permissions**
- The link is unguessable and valid in production; it grants reading the public event data and voting, nothing else.
- Sharing shows a preview with the event title (`og:` tags served by the API).

**Acceptance criteria**
1. The wizard's "¡Hecho!" card and the management page show the participation link with "Copiar" and share buttons (WhatsApp, email, native share where available).
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
- Named events ask for the voter's name (2 to 30 characters after trimming; the field takes no more than 30); anonymous events never ask for or store a name.
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
- A vote with an unknown state: rejected by the API (`400`).
- A vote with an option that is not one of the event's now (the options were replaced since the page loaded): rejected (`409`); the voting page goes back to where the vote was sent from (the days, or step 1 after "Me adapto…") with the new options, the name kept and every answer available again, and the notice "Las opciones han cambiado: vuelve a marcar tus preferencias." An option of another event is answered the same: only a request made by hand sends one.
- A vote sent after the deadline from a page opened before it: rejected, and the page shows "Votación cerrada".
- The API never returns names on anonymous events, and never returns other voters' answers to participants.

**Done when:** the shared definition of done is met, and the vote validation has unit tests in the domain package.
**Feature:** [`e2e/features/hu06-vote.feature`](../e2e/features/hu06-vote.feature)

---

## HU07 — Compare the options · Must

**As an** organizer, **I want** to compare the options, **so that** I can see which date suits the group.

**Rules and permissions**
- Results open with the results link (shareable by the organizer), or from the management page (opened with the management link or from "Mis eventos"). Participants have no results link.
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
- The option must belong to the event. A confirmation is final in v1: confirming another option is rejected; the confirmed option sent again (a retry) is answered as the first time.
- Confirming closes voting at once and cancels the pending "voting closed" email. A confirmed event's deadline and options can no longer change, and "Cerrar votación" is refused.

**Acceptance criteria**
1. From the management page, choosing the recommended option and confirming shows "Fecha confirmada" on the management, results and participation pages.
2. Choosing an option that is not the recommended one, confirming with no votes, or confirming while voting is open asks for an explicit confirmation that explains the consequence (e.g. "la votación se cerrará").
3. Participants then see "Fecha confirmada: …" without counts, and can no longer vote.

**Validations, errors and edge cases**
- An option that is not one of the event's now (the options were replaced since the management page loaded, the ID never existed, or it is another event's: all answered the same, as only a request made by hand sends the last two): rejected (`409`); the management page reloads with the new options and a notice.
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
| Voting closed | The deadline passes, or the organizer closes voting early (once per closing) | Organizer email | Winners and alternatives, results link, management link, "Confirmar fecha" button |

**Rules and permissions**
- Each email is stored as a pending row **in the same transaction** as the action that triggers it. The API's email outbox, which runs in the same process but never inside a request, sends pending rows and resumes after a restart.
- States: pending → sent or failed, with the attempt count; automatic retries with growing waits.
- **One row per event and email type:** the summary is sent once per event, also when the options change (its links always lead to the current options); "voting closed" is sent once per closing, never twice for the same closing (no duplicates on retries or restarts).
- Extending the deadline reschedules "voting closed": after it was sent, its row goes back to pending with the new closing instant, so it is sent again at the new closing with the up-to-date results. It is not sent if the date is confirmed before the (new) closing; cancelling deletes it.
- The management page shows each email's state. The organizer (session or management link) can retry a failed email; nobody else can.
- An SMTP failure never loses the event or the closing. Errors are logged without credentials or personal data.

**Acceptance criteria**
1. Creating an event leaves a sent summary email with both links (fake SMTP in tests).
2. Once the deadline passes, the "voting closed" email is sent once, with the results.
3. "Cerrar votación" sends it at once; extending the deadline reschedules it, also after it was sent (it is sent again at the new closing); confirming before the closing means it is not sent.
4. With SMTP down, the event is created, the management page shows "Envío fallido" and "Reintentar"; retrying after SMTP recovers sends it once.

**Validations, errors and edge cases**
- Retry by a participation or results link: rejected (`403`). Retry of an email already sent: rejected.
- Restart of the API (and its outbox): pending rows are sent once after the restart; rows already marked sent are never resent (only a reopening sets the "voting closed" row back to pending). (Delivery is at least once: a crash in the instant between the provider accepting an email and the row being marked sent can repeat that one email.)
- A cancelled event: pending emails are deleted.

**Done when:** the shared definition of done is met, plus one controlled real send in the deployed environment.
**Feature:** [`e2e/features/hu09-emails.feature`](../e2e/features/hu09-emails.feature)

---

## HU10 — Dates in plain language · Must

**As an** organizer, **I want** to type dates and times in plain language ("los viernes de julio a las 21:00"), **so that** I can propose many options quickly.

**Rules and permissions**
- The smart calendar is a switch in step 2 that opens a text box (120 characters, dictation with the microphone where the browser offers it) over the calendar. The manual calendar is always available: closing the box keeps the text and the selection.
- The text is interpreted by the backend, never in the browser; the AI credentials stay on the server. The request carries the text, the browser's time zone (today's date is taken in it) and the browser's region (for dates in figures: "7/4" is 7 April, and 4 July in the United States; when one order cannot be a date, the other is read).
- **Two parts, one interpreter.** (1) An **editor**, a language model (Google's Gemini API, paid tier), only copy-edits the phrase into a well-written one in the same language (spelling, glued words, chat abbreviations, dictation, word order); it never returns dates. (2) The **rules reader** of qando reads the edited phrase and is the only part that produces options. The editor's answer is checked in code before it is read: it must keep the numbers of the phrase (as a person reads them), the meal words, the order of the weekdays, the negations, the half of the day ("por la tarde"); an edit that keeps only the correction of a phrase that corrects itself is accepted ("el sábado a las 10, no, a las 11" → 11). Otherwise the phrase is read as written. The check and its cases are ported from the reference implementation with their tests. The editor has a time limit (3 s); on a timeout, an error or an answer that fails the check, **the phrase is read as written, never an error**. The phrase is passed to the editor as data, never as instructions. The organizer never sees the edited phrase; notices and questions quote its fragments (the organizer's words, well written).
- **What is understood is marked at once**, with no review screen: dates on step 2's calendar and, when a time is understood, the date's time in step 3. A silent misreading is caught where every selection is reviewed: step 3b ("Revisa y corrige, si hace falta.") and the summary of step 4.
- **Generating replaces** the dates and times selected before. When there was a selection, a short notice says so with an undo for a few seconds: "Hemos sustituido las 3 fechas que tenías marcadas. **Deshacer**". The notice stays 8 s, pauses while hovered or focused and goes away when the calendar is edited by hand; undo puts back the previous dates, pills, times and month exactly (one level).
- **A bare hour from 1 to 11 is never guessed** ("a las 8"): before anything is marked, the box asks one question per distinct hour, naming its date: "«a las 8» del **sáb 20 jun**: ¿mañana o tarde?" [8:00 · mañana] [20:00 · tarde] (en: "a.m. or p.m.?"). A question covering several dates names up to 3 ("sáb 3, 10 y 17 oct") and counts more ("31 fechas"). Answering the last question marks everything and closes the box; until then an answer can be changed. While a question is open the text can be edited; generating again, closing the box or leaving step 2 drops the questions. When one reading of the hour is already past, the other is taken with no question.
- **Notices.** A phrase understood in part marks what was understood, closes the box (the switch turns off, the calendar goes to the first marked month, the text is kept for the next time; a result that says the time of a day turns "Horario" on, also when the time could not be marked) and shows, above the calendar, an amber box with **every notice that applies**, one per line, closed with ×. A notice about dates starts with them in bold (up to 3 named in the order of the calendar, what they share said once: "**sáb 3, 10 y 17 oct:**", "**vie 19 y sáb 20 jun:**"; more counted: "**5 fechas:** …"; about several days it speaks in the plural, "hemos marcado los días…") ("**vie 19 jun:** hemos marcado el día, pero no hemos entendido la hora («por la tarde»)…"); a general one names the fragment ("Hay algo que no encaja en tu petición («el 31 de junio»)…"). The notices: time not understood; a time range that ends after 6:00 of the next day (the day is marked with no time); a time range the times step cannot draw, one within a single hour (the day is marked with no time: "…no hemos podido marcar el horario de 17:00 a 17:45…"); a day the phrase did not write (midnight on Friday is Saturday at 0:00); text not understood; a date that does not exist or does not fit; dates or times today already past (not marked); dates beyond 12 months (not marked; a range crossing the limit is cut at it). Notices are listed in the phrase's order and cleared by a new generation, undo, reset or leaving step 2; with questions, they appear after the last answer. Nothing understood, or more than 60 options, marks nothing: the box stays open with its notice and the previous selection is kept.
- **Times.** A time range can end on the next day up to 6:00 ("el viernes de 22 a 3" is Friday 22:00 → 3:00 (+1), one option of Friday); step 3's hour column goes on past 23:00 to 6:00 of the next day, with a divider naming that day; the rows after it only end a range that starts before midnight (a click on them alone marks nothing). Hours are written with no leading zero ("9:30") and a range's ends are joined with an arrow ("22:00 → 3:00 (+1)"; "⬇" in a vertical block); screen readers hear words ("de 22:00 a 3:00 del sábado").
- **Where the options go** (step 2's data model): each interpreted option is an `active` element of the calendar, unless it overlaps an `active` element of the same date; then whichever of the two is a range becomes a `saved` element (a pill): "del 3 al 7 de agosto y el 5 de agosto" keeps both. The times of a date follow the same rule: of two that share an hour ("a las 18 y a las 18:30", "de 17 a 19 y de 18 a 20") the first stays marked on its column and the other is saved under it, the time range being the one saved when the other is a single time. The result is validated with the same rules as HU03 (12 months, 60 options, no degenerate ranges).
- Rate limit per address (the event does not exist yet while the wizard is in use): 20 requests per rolling hour, refused before the editor is called; requests from another site's page are refused.
- Also available when editing an existing event ("today" is then taken in the event's time zone).
- **Privacy:** each phrase is sent to Google (Gemini API) to be copy-edited; the box says nothing about it, and the privacy notice (a page of its own) names Google as processor, the transfer outside the EU and its 55-day abuse-monitoring retention. Google does not use the phrases to improve its products; qando neither stores nor logs them.

**Acceptance criteria**
1. "Todos los lunes de julio" marks every Monday of the next July on the calendar at once, with no review step.
2. A range ("del 3 al 7 de agosto") becomes one range option.
3. "El viernes a las 21:00" marks Friday and gives it 21:00 in step 3; "el viernes a las 8" first asks "¿mañana o tarde?".
4. A phrase understood in part marks what was understood and lists every notice that applies above the calendar.
5. Text that is not understood shows a notice, and the calendar keeps its previous selection.
6. Replacing a selection can be undone.
7. The manual calendar always remains available.

**Validations, errors and edge cases**
- Empty or whitespace-only text: the generate button stays disabled and nothing is sent.
- A request already running: the generate button is disabled until it answers.
- The editor fails, times out or changes a number: the phrase is read as written, with no message.
- The API cannot be reached, answers an error or takes more than 10 s: "No se ha podido interpretar" in the box, the text is kept and the manual calendar still works.
- Too many requests: "Demasiadas peticiones, inténtalo en un momento".

**Done when:** the shared definition of done is met, and the rules reader passes every case of its evaluation set (Spanish, Catalan and English phrases) in CI; the editor is not called in CI; the editor's check passes its own tests.
**Feature:** [`e2e/features/hu10-plain-language-dates.feature`](../e2e/features/hu10-plain-language-dates.feature)
