# qando — Backlog

Approved on 2026-11-02 and created as issues #1–#90 in `qando-app` (issue number = row number). Source of the GitHub issues for the **qando** project board. Once approved, each row becomes one issue in `qando-app`, added to the board in **Backlog**, with the fields **Priority** and **Story** set and the **milestone** of its delivery block.

## Conventions

- **Milestones** = delivery blocks (Thursday → Wednesday, shown on Thursday morning):
  - **M0 Foundations** (due Wed 11-04): repository, CI, tests, tokens, first deployed version.
  - **M1 Vote, results, confirm** (due Wed 11-11): HU06–HU08 on events seeded by script.
  - **M2 Create and share** (due Wed 11-18): HU01, HU03, HU05, HU09 (summary), HU10; user validation starts.
  - **M3 Manage and close** (due Sun 11-22): HU04, HU09 ("voting closed"), HU02, final reviews, delivery.
- **Labels** (type of work): `definition`, `frontend`, `backend`, `persistence`, `integration`, `tests`, `docs`, `devops`, `spike`, `a11y`, `responsive`, `user-validation`.
- **Priority** follows the story (MoSCoW); cross-cutting work needed for the delivery is **Must**.
- **Issue body:** a short context paragraph, a link to the story in `docs/course/user-stories.md`, the **done when** criterion below as a checklist, and, for story issues, the shared *Definition of done* of the stories. Pull requests close them with `closes #N`.
- Issues are small: one pull request each, at most about half a day.

## M0 — Foundations (11-03 → 11-04)

| # | Title | Story | Prio | Labels | Done when |
|---|---|---|---|---|---|
| 1 | Monorepo scaffold: Angular web, Express API, `contracts` and `domain` packages | Cross-cutting | Must | devops | `npm ci`, `npm run build` and `npm test` pass at the root; each package has one passing sample test |
| 2 | Lint, format and type-check for every package | Cross-cutting | Must | devops | `npm run lint` and `npm run typecheck` pass; a lint error fails locally |
| 3 | CI pipeline on pull requests (lint, types, unit tests, build) | Cross-cutting | Must | devops, tests | A pull request shows the checks; a failing test blocks merging into `main` |
| 4 | Mutation testing with StrykerJS (domain ≥ 85 %, rest ≥ 70 %), incremental and blocking in pull requests | Cross-cutting | Must | tests, devops | A pull request below the threshold fails; the report is attached to the CI run |
| 5 | Executable Gherkin with `playwright-bdd` against a local or deployed URL | Cross-cutting | Must | tests | A sample feature runs locally and in CI, and against the public URL with one variable |
| 6 | Design tokens and base styles (colours, type, spacing, motion, breakpoints 650 / 1024 px) | Cross-cutting | Must | frontend, responsive | Tokens documented; a sample page uses only tokens; contrast of text tokens ≥ 4.5:1 |
| 7 | API skeleton: health endpoint, PostgreSQL connection, Drizzle migrations | Cross-cutting | Must | backend, persistence | `GET /api/health` reports the database state; migrations run from an empty database |
| 8 | Contracts: Zod schemas generate the OpenAPI document and Swagger UI | Cross-cutting | Must | backend, docs | `/api/docs` shows the health endpoint from its Zod schema |
| 9 | Typed API client for the web generated from the contracts | Cross-cutting | Must | frontend, integration | The web calls `/api/health` through the generated client; a contract change breaks the build |
| 10 | App shell: header, routes from the sitemap, not-found page, loading and error components, Spanish catalogue | Cross-cutting | Must | frontend | Every sitemap route resolves (placeholder pages); unknown paths show the not-found page; texts come from the catalogue |
| 11 | Hosting spike and first deployment (web, API, PostgreSQL) | Cross-cutting | Must | devops, spike | Provider chosen and recorded; the public URL shows the home page and the API reports the database as up |
| 12 | Move the planning deliverables to `docs/course/` and write the README (what, how to run) | Cross-cutting | Must | docs | Stories, features, sitemap, diagrams and API contract in the repo; README explains how to run it locally |
| 13 | Desktop mockups of the main screens, with the changes of each story | Cross-cutting | Must | definition | `docs/course/mockups.md` with the desktop screens and the mobile-first approach; linked from the README |

## M1 — Vote, results, confirm (11-05 → 11-11)

| # | Title | Story | Prio | Labels | Done when |
|---|---|---|---|---|---|
| 14 | Database schema: events, options, participations, votes (as in the ER diagram) | HU06 | Must | persistence | Migration creates the tables with keys, uniques and checks; integration test inserts and reads an event with votes |
| 15 | Seed script: demo and test events in every state (open, closed, confirmed, cancelled) | HU06 | Must | persistence, tests | One command creates the events and prints their links; the e2e suite uses it |
| 16 | Domain: vote validation (three states, one preferred, options of the event, name ≥ 2 characters, anonymous) | HU06 | Must | backend | Unit tests written first; mutation score ≥ 85 % |
| 17 | API: read the public event by participation link (state, closing on time, no private data) | HU06 | Must | backend | Integration tests: open, closed by deadline, confirmed, cancelled, not found; response has no email, tokens or session data |
| 18 | API: cast a vote (one transaction, resubmission stores one vote, edit token stored hashed) | HU06 | Must | backend, persistence | Integration tests: valid vote, double submit, option of another event (`400`), closed event rejected |
| 19 | API: edit my vote with the edit token | HU06 | Must | backend | Integration tests: edit updates the same voter; wrong token `403`; closed event rejected |
| 20 | Voting page: name, options as available / preferred / unavailable, one preferred, confirmation, thank-you | HU06 | Must | frontend | Component tests first; works with the keyboard; 375 / 768 / 1280 px |
| 21 | Voting page: reopen my vote in the same browser and the private "Editar mi voto" link | HU06 | Must | frontend | Reload shows previous answers; the edit link opens the vote in another browser |
| 22 | Voting page states: closed, confirmed, cancelled, not found, could not load + retry | HU06 | Must | frontend | Each state has its own message; "Reintentar" reloads |
| 23 | Feature HU06 green | HU06 | Must | tests | `hu06-vote.feature` passes locally and against the public URL |
| 24 | Domain: results engine (attendance, preferred tie-break, ties, zero attendance) with the reference case table | HU07 | Must | backend | Every reference case passes; mutation score ≥ 85 % |
| 25 | API: results by results link or management link; participation link refused | HU07 | Must | backend | Integration tests: results link, management link, participation token `403`, cancelled, unknown |
| 26 | Results page: winners, alternatives, counts, names (Spanish order), provisional / final, empty, ties | HU07 | Must | frontend | Component tests first; keyboard; 375 / 768 / 1280 px |
| 27 | Feature HU07 green | HU07 | Must | tests | `hu07-results.feature` passes locally and against the public URL |
| 28 | API: management-link access (token from a header, stored hashed), shared by every management action | HU08 | Must | backend | Integration tests: valid, wrong and missing token; token never logged |
| 29 | API: confirm an option (option of the event, final, closes voting) | HU08 | Must | backend | Integration tests: confirm, second confirmation, option of another event `400`, participation or results link `403`, cancelled event |
| 30 | Management page (first version): open with the management link, token removed from the address bar, confirm with an explicit dialog | HU08 | Must | frontend | Token stored per event and gone from the URL; the dialog explains the consequence |
| 31 | "Fecha confirmada" shown on the results and voting pages | HU08 | Must | frontend | Participants see the confirmed option without counts and cannot vote |
| 32 | Feature HU08 green | HU08 | Must | tests | `hu08-confirm-date.feature` passes locally and against the public URL |
| 33 | Accessibility and responsive check of the voting, results and management pages | Cross-cutting | Must | a11y, responsive, tests | Automatic accessibility check (axe) in the e2e run with no violations; manual keyboard and screen-reader pass recorded; screenshots at 375 / 768 / 1280 px |
| 34 | Deploy M1 and check the seeded event end to end on the public URL | Cross-cutting | Must | devops, tests | Vote → results → confirm works on the public URL |

## M2 — Create and share (11-12 → 11-18)

| # | Title | Story | Prio | Labels | Done when |
|---|---|---|---|---|---|
| 35 | Spike: Better Auth email code + email provider (measure code delivery time) | HU01 | Must | spike, integration | Provider chosen and recorded; a code reaches a real inbox; delivery time measured |
| 36 | Database schema: users, sessions, verification codes | HU01 | Must | persistence | Migration and integration test; codes stored hashed |
| 37 | API: sign in with an email code (send, verify, expiry, 5 attempts, limits per email and IP, new code cancels the old one) | HU01 | Must | backend, integration | Integration tests with a fake SMTP server cover right, wrong, expired, resent and limited codes |
| 38 | API: session cookie (HttpOnly, Secure, SameSite), CSRF protection, sign out | HU01 | Must | backend | Private request without session `401`; another owner's event `403`; sign out deletes the session |
| 39 | Sign-in page: email → code → back to the previous page; resend countdown; errors | HU01 | Must | frontend | Component tests first; every error message of the story shown; keyboard |
| 40 | Private-route guard, header with the user's initial, sign out (management links of the account removed, vote tokens kept) | HU01 | Must | frontend | Private route without session goes to sign in and back; sign out clears what the story says |
| 41 | Feature HU01 green | HU01 | Must | tests | `hu01-sign-in-with-code.feature` passes locally and against the public URL |
| 42 | Domain: option model and validation (60 options, 12 months, ranges ≥ 2 days, time end after start, quarters, duplicates) | HU03 | Must | backend | Unit tests first; mutation score ≥ 85 % |
| 43 | API: create an event (options, time zone, three links, summary email queued, all in one transaction); with a code it also creates the account and session | HU03 | Must | backend, persistence | Integration tests: valid event, each rejected input, rollback when one step fails |
| 44 | Shared step component (wizard steps with transitions and reduced motion) | HU03 | Must | frontend | Component tests first; steps keep focus order; reduced motion respected |
| 45 | Wizard step 1: title and organizer name | HU03 | Must | frontend | "Siguiente" disabled with the reason until valid |
| 46 | Wizard step 2: calendar with single dates and ranges, month paging, limits notice | HU03 | Must | frontend | Selecting, extending and removing dates and ranges works with mouse, touch and keyboard |
| 47 | Wizard step 3: times on single dates (single times, ranges, saved times) | HU03 | Must | frontend | Times in quarters; "Horario" without single dates shows the hint |
| 48 | Wizard step 4: summary of every option as it will be voted | HU03 | Must | frontend | The list matches what the voting page shows |
| 49 | Wizard step 5: deadline, note, anonymous voting, email; "Crear" with error and retry; draft kept on reload | HU03 | Must | frontend | Deadline after the first date warns; server error keeps the wizard; reload restores the draft |
| 50 | Feature HU03 green | HU03 | Must | tests | `hu03-create-event.feature` passes locally and against the public URL |
| 51 | Share block: copy, WhatsApp, email and native share (step 5 and management page) | HU05 | Must | frontend | Each button works on desktop and phone; "Copiado" feedback |
| 52 | Link previews: `og:` tags with the event title served by the API | HU05 | Must | backend | Pasting a participation link in a chat shows the title |
| 53 | Feature HU05 green | HU05 | Must | tests | `hu05-share-link.feature` passes locally and against the public URL |
| 54 | Define both email contracts and the data of their templates | HU09 | Must | definition, docs | Content, recipient and trigger of each email documented and reviewed |
| 55 | Database schema: notifications table (one row per event and email type) | HU09 | Must | persistence | Unique constraint tested; states pending / sent / failed with attempt count |
| 56 | Queue the notifications when an event is created, extended or closed | HU09 | Must | backend, persistence | Integration tests: row written in the same transaction as the action |
| 57 | Email worker with Nodemailer: send pending rows, retries with growing waits, resume after restart | HU09 | Must | backend, integration | Tests with a fake SMTP server: success, failure, retry, restart; no row sent twice |
| 58 | Email templates (summary, voting closed): responsive, Spanish, exact options | HU09 | Must | backend | Rendered in the main mail clients; links work |
| 59 | API: email state and retry by the organizer | HU09 | Must | backend | Integration tests: retry by management link or owner; participation or results link `403`; email already sent rejected |
| 60 | Management page: each email's state, "Envío fallido" and "Reintentar" | HU09 | Must | frontend | Failed email shows the retry; after retry the state updates |
| 61 | Feature HU09 (summary part) green | HU09 | Must | tests | Summary scenarios of `hu09-emails.feature` pass |
| 62 | Spike: date interpreter with the Spanish evaluation set; decide on the fallback | HU10 | Must | spike, integration | Result of the evaluation recorded; provider or fallback chosen |
| 63 | API: date interpreter endpoint (time zone and today, validation, timeout, limit per IP) | HU10 | Must | backend, integration | Integration tests: valid, invalid, ambiguous, error, timeout, too many requests |
| 64 | Wizard: plain-language field, interpreted dates for review on the calendar, errors | HU10 | Must | frontend | The calendar keeps its selection when the text is not understood; manual calendar always usable |
| 65 | Spanish evaluation set of the interpreter in CI | HU10 | Must | tests | The set runs in CI and blocks below the agreed score |
| 66 | Feature HU10 green | HU10 | Must | tests | `hu10-plain-language-dates.feature` passes locally and against the public URL |
| 67 | User validation: plan and first sessions (tasks, observations, issues found) | Cross-cutting | Must | user-validation | Plan written; first sessions recorded; each problem found is an issue |
| 68 | Accessibility and responsive check of sign in and the wizard | Cross-cutting | Must | a11y, responsive, tests | axe with no violations; keyboard-only creation of an event; screenshots at 375 / 768 / 1280 px |
| 69 | Deploy M2 and check create → share → vote → results → confirm + emails on the public URL | Cross-cutting | Must | devops, tests | Whole path works on the public URL with a real summary email |

## M3 — Manage and close (11-19 → 11-22)

| # | Title | Story | Prio | Labels | Done when |
|---|---|---|---|---|---|
| 70 | API: my events (session, own events, newest first) | HU04 | Must | backend | Integration tests: own events only; no session `401` |
| 71 | "Mis eventos" page: title, state and deadline, each opens its management page | HU04 | Must | frontend | Empty state; keyboard; 375 / 768 / 1280 px |
| 72 | API: edit options while nobody has voted (whole list replaced; a vote arriving meanwhile rejects the save) | HU04 | Must | backend, persistence | Integration test of the edit-versus-vote race |
| 73 | "Editar opciones": the wizard reopens on the date and time steps; disabled with votes | HU04 | Must | frontend | After saving, the participation link shows the new options |
| 74 | API: extend the deadline (reopens, reschedules the email) and close voting now (sends it at once) | HU04 | Must | backend | Integration tests: extend, past date rejected, close now |
| 75 | Management page: deadline controls | HU04 | Must | frontend | Extending a closed event reopens voting |
| 76 | API: cancel an event (tombstone kept, everything else deleted; writes rejected afterwards) | HU04 | Must | backend, persistence | Integration tests: cancel, cancel twice, write after cancel |
| 77 | Cancel flow: explicit confirmation, ready-to-send "Evento cancelado" text, cancelled state on every link | HU04 | Must | frontend | Copy and share buttons work; each link shows "Este evento ha sido cancelado" |
| 78 | Feature HU04 green | HU04 | Must | tests | `hu04-manage-event.feature` passes locally and against the public URL |
| 79 | Scheduled "voting closed" email at the deadline (not sent if confirmed or cancelled) | HU09 | Must | backend, integration | Tests: sent once after the deadline; rescheduled on extend; skipped on confirm or cancel |
| 80 | Feature HU09 complete and one controlled real send in the deployed environment | HU09 | Must | tests | Every scenario of `hu09-emails.feature` passes; real send recorded |
| 81 | API and page: profile (see the account, edit the name) | HU02 | Should | backend, frontend | Validation (empty, > 30 characters); new name prefilled in the next event |
| 82 | Feature HU02 green | HU02 | Should | tests | `hu02-profile.feature` passes |
| 83 | Transitions and micro-interactions with reduced motion | Cross-cutting | Should | frontend, a11y | Step transitions and feedback use motion tokens; none with reduced motion |
| 84 | Final accessibility review (WCAG 2.2 AA) of every view | Cross-cutting | Must | a11y | Checklist per view recorded; no open blocking issue |
| 85 | Final responsive and visual review at 375 / 768 / 1280 px | Cross-cutting | Must | responsive, tests | Screenshots of every view; no horizontal scroll |
| 86 | Security review (tokens, cookies, CSRF, rate limits, headers, logs without personal data) | Cross-cutting | Must | backend | Checklist recorded; findings fixed or tracked |
| 87 | User validation: closing sessions and summary of observations and changes | Cross-cutting | Must | user-validation, docs | Observations, issues and changes made documented |
| 88 | Technical guide: install, configuration, data, tests, simulating provider failures | Cross-cutting | Must | docs | A fresh clone runs by following the guide alone |
| 89 | Update diagrams and API contract to the final implementation | Cross-cutting | Must | docs | Diagrams and contract match the code |
| 90 | Final deployment and full path checked on the public URLs | Cross-cutting | Must | devops, tests | Every feature passes against the public URL |

## Not in the backlog yet

The Could items (advanced events table, FullCalendar, categories, charts, extra roles, dark mode, "fecha confirmada" email, regenerate the management link, "Continuar con Google") are added as Could issues only when the Must and Should work is done and tested.
