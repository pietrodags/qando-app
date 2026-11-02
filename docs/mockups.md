# qando — Mockups (desktop)

The desktop mockups are screenshots of qando's current interface at 1280 px. The new app keeps this look and these flows. Each screen lists the changes the stories make to it. Screens the current interface does not have are built from the design tokens and the shared components, without a mockup.

**Mobile** has no mockups. The app is built mobile first: every view is laid out for 375 px first, then adapted at the two breakpoints (650 px tablet, 1024 px desktop). The layout is checked with screenshots at 375, 768 and 1280 px in the end-to-end tests of each story (definition of done). This replaces separate mobile mockups.

## Create an event (HU03, HU10, HU05)

| Screen | Changes in the new app |
|---|---|
| ![Title and name](mockups/create-1-title-and-name.jpg) **1. Title and organizer name** | "Siguiente" stays disabled until the step is valid, with the reason next to the field. Signed in: the name is prefilled. |
| ![Dates on the calendar](mockups/create-2-dates-calendar.jpg) **2. Dates on the calendar** | Every date or range created is one option; a notice appears when approaching 60 options. |
| ![Dates in plain language](mockups/create-2-dates-plain-language.jpg) **2. Dates in plain language** | Interpreted by the backend; the dates are shown on the calendar for review, and what was not understood is said. |
| ![Times](mockups/create-3-times.jpg) **3. Times on single dates** | Minutes in quarters; a time range must end after it starts. |
| ![Summary](mockups/create-4-summary.jpg) **4. Summary** | Lists every option exactly as participants will vote on it. |
| ![Deadline and email](mockups/create-5-deadline-and-email.jpg) **5. Deadline, note, anonymous voting, email** | A deadline after the first date warns. "Crear" asks for the 6-digit email code the first time (HU01); a server error keeps the wizard with "Reintentar". |
| ![Done and share](mockups/create-6-done-and-share.jpg) **Done: share the link** | Copy, WhatsApp, email and native share; the user's initial appears in the header. |

## Vote (HU06)

| Screen | Changes in the new app |
|---|---|
| ![Name](mockups/vote-1-name.jpg) **1. Event and voter name** | A name needs at least 2 characters; anonymous events never ask for it. |
| ![Days](mockups/vote-2-days.jpg) **2. Days** | Same interaction. |
| ![Times](mockups/vote-3-times.jpg) **3. Times** | At most one preferred option in the whole vote. |
| ![Confirm](mockups/vote-4-confirm.jpg) **4. Confirm** | Same interaction. |
| ![Thank you](mockups/vote-5-thank-you.jpg) **Thank you** | Adds the private "Editar mi voto" link; reopening the link in the same browser edits the vote. |
| ![Error](mockups/vote-error.jpg) **Error** | Split into "Este evento no existe" and "No se ha podido cargar" + "Reintentar". New states with the same card: "Votación cerrada", "Fecha confirmada: …", "Este evento ha sido cancelado". |

## Results (HU07, HU08)

| Screen | Changes in the new app |
|---|---|
| ![Winner](mockups/results-winner.jpg) **Winner** | Marked "provisional" before the deadline and "final" after it; a confirmed date is shown apart from the recommendation. Opened with the results or management link only. |
| ![Tie](mockups/results-tie.jpg) **Tie** | Two or three tied options are listed; a tie between all options says so. |
| ![No votes](mockups/results-no-votes.jpg) **No votes** | "Aún no ha votado nadie." |

## Emails (HU09)

| Email | Changes in the new app |
|---|---|
| ![Summary email](mockups/email-summary.jpg) **Summary** | Adds the management link and the deadline's time zone; the options are listed exactly as created. |
| ![Voting closed email](mockups/email-voting-closed.jpg) **Voting closed** | Sent at the deadline or when the organizer closes voting; results link, management link and "Confirmar fecha". |

## New screens without a mockup

Built with the same card, tokens and components as the screens above:

- **Sign in with a code** (HU01): email → 6-digit code, with resend countdown and errors.
- **Management page** (HU04, HU08, HU09): links, share block, confirm a date, deadline controls, edit options, cancel, email states.
- **Mis eventos** (HU04): list of the account's events with title, state and deadline.
- **Perfil** (HU02): name and email of the account.
