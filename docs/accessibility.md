# Accessibility and responsive check

The voting, results and management pages (milestone M1) against **WCAG 2.2 AA**, at the three widths the design is checked at: **375 px** (phone), **768 px** (tablet) and **1280 px** (desktop). Most of it is checked on every run of the tests; what only a person can judge is checked by hand and recorded below.

## Checked on every run

| What | How | Where |
|---|---|---|
| No WCAG 2.2 A or AA violation that axe can find | After every step of every acceptance scenario, each page the scenario looks at is checked with axe (`@axe-core/playwright`, the rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa`), at each width. A page whose markup has not changed since its last check is skipped; animations are waited for, so colours are read at rest. Any violation fails the step and names the rule and the elements. | `e2e/steps/accessibility.hooks.ts` |
| Every stop of the keyboard shows that it has the focus (2.4.7) | The page is walked with Tab; each stop and its label are captured focused and then blurred, and the two captures must differ. Voting (steps 1 and 2, the question, the thank-you), results (with a list of names closed and open) and management (the choice and its question). | `e2e/layout/focus.ts`, `vote-page.spec.ts`, `results-bars.spec.ts`, `manage-page.spec.ts` |
| A vote is cast with the keyboard alone (2.1.1) | From the name to the thank-you: Tab, Enter says whether a day suits, Shift+Enter makes it the preferred one, Escape closes the question and gives the focus back. | `e2e/layout/vote-page.spec.ts` |
| A date is confirmed with the keyboard alone (2.1.1) | Arrows move the choice within the dates, Enter asks, Escape goes back, the confirmed heading takes the focus. | `e2e/layout/manage-page.spec.ts` |
| Nothing scrolls sideways (1.4.10) | The results and management pages, with long titles and links, at each width. | `e2e/layout` |
| Text contrast (1.4.3) | Every text colour on every surface it is drawn on, gradients at each stop. | `apps/web/src/styles` ([design tokens](design-tokens.md)) |
| Names, roles and keys of each component | Unit tests: buttons named with their date and answer, dialogs named by their question, keyboard hints, focus moved to each new step and given back when a dialog closes. | `apps/web/src/app` (`*.spec.ts`) |

### Found and fixed by this check

- **Label in name (2.5.3).** A voice-control user says what they see, so the name of a button must contain its visible text, in order:
  - a time block that shows "19:30 ⬇ 21:00" was named "lunes, 6 de julio, 19:30 a 21:00: Preferido"; it is now named "lunes, 6 de julio, 19:30–21:00: Preferido";
  - a chip of dates that overlap that shows "Mar 7 ➔ Vie 10" was named "martes, 7 de julio – viernes, 10 de julio: Preferido"; its name now starts with what it shows: "Mar 7 – Vie 10, martes, 7 de julio – viernes, 10 de julio: Preferido".

## Checked by hand

A person goes through each page with the keyboard alone and with a screen reader (VoiceOver on macOS with Safari, and on iPhone), and records here what they found.

| Page | Keyboard alone | Screen reader |
|---|---|---|
| Voting, whole days (steps 1–2, question, thank-you) | Pending | Pending |
| Voting, times (step 3) | Pending | Pending |
| Voting, dates that overlap (chips, and their modal on a phone) | Pending | Pending |
| Results (lists of names) | Pending | Pending |
| Management (choice, question, confirmed) | Pending | Pending |

## Screenshots

Each page at the three widths, the API answered with a sample event (`docs/screenshots`, full page).

| State | 375 px | 768 px | 1280 px |
|---|---|---|---|
| Voting, step 1 | [image](screenshots/vote-1-welcome-375.jpg) | [image](screenshots/vote-1-welcome-768.jpg) | [image](screenshots/vote-1-welcome-1280.jpg) |
| Voting, step 2 (days) | [image](screenshots/vote-2-days-375.jpg) | [image](screenshots/vote-2-days-768.jpg) | [image](screenshots/vote-2-days-1280.jpg) |
| Voting, step 3 (times) | [image](screenshots/vote-3-times-375.jpg) | [image](screenshots/vote-3-times-768.jpg) | [image](screenshots/vote-3-times-1280.jpg) |
| Voting, the question | [image](screenshots/vote-4-question-375.jpg) | [image](screenshots/vote-4-question-768.jpg) | [image](screenshots/vote-4-question-1280.jpg) |
| Voting, thank-you | [image](screenshots/vote-5-thanks-375.jpg) | [image](screenshots/vote-5-thanks-768.jpg) | [image](screenshots/vote-5-thanks-1280.jpg) |
| Results | [image](screenshots/results-375.jpg) | [image](screenshots/results-768.jpg) | [image](screenshots/results-1280.jpg) |
| Management, the choice | [image](screenshots/manage-1-choose-375.jpg) | [image](screenshots/manage-1-choose-768.jpg) | [image](screenshots/manage-1-choose-1280.jpg) |
| Management, the question | [image](screenshots/manage-2-question-375.jpg) | [image](screenshots/manage-2-question-768.jpg) | [image](screenshots/manage-2-question-1280.jpg) |
