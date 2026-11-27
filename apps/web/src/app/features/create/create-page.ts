import {
  Component,
  type WritableSignal,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { SignedInAccount } from '@qando/contracts';
import type { EventDetails } from '@qando/domain';
import { Session } from '../../core/auth/session';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { CreateDone } from './create-done';
import { type DateSelection, asksForTimes } from './date-selection';
import { WizardDates } from './wizard-dates';
import type { ProposedName } from './organizer-name-field';
import { WizardDetails } from './wizard-details';
import { forgetDraft, keepDraft, lastStepOf, newDraft, openingDraft } from './wizard-draft';
import {
  type CodeWait,
  type CreatedEvent,
  type EventEnding,
  type SentEvent,
  WizardFinish,
} from './wizard-finish';
import { WizardSummary } from './wizard-summary';
import { WizardTimes } from './wizard-times';

/** The step of the times, whose second part is their summary. */
const TIMES_STEP = 3;

/**
 * The event creation wizard, on the home page: the organizer's steps as a stack of cards. The page
 * holds what each step asks, so a step folding into its tab and coming back loses nothing. Step 1
 * (name and title), step 2 (the dates, on a calendar that opens on the current month), the times
 * of the dates and their summary, and the last step: step 3 only while times are asked for and a
 * date of its own can have them, and the last step (the deadline, a note, anonymous voting, the
 * email and "Crear") counts from there. Step 3 is the times, then the summary of every option in
 * their place in the same card, on the columns the times showed; the focus goes to the card when
 * one gives way to the other, as on a change of step. Coming back to step 3 from the last step
 * opens the summary as it was left, and from the dates the times on their first columns. While
 * the event, or the code that signs its organizer in, is sent, and while that code is waited
 * for, the other steps stay closed. Once it is created, "¡Hecho!" takes the place of the whole
 * stack: going back to a step would no longer change the event. The page holds the event as it
 * was last sent and its management token (`SentEvent`), so sending the same event again after a
 * lost answer, also after a visit to another step, stores it once. "Crear otro evento" brings the
 * wizard back on step 1 with nothing asked, as the page first opens.
 *
 * All the wizard holds is kept in this tab as it changes (`keepDraft`), so that the page opened
 * again, by a reload or after a visit to another page, comes back as it was left, the event sent
 * included (`openingDraft`): sending it then still stores it once. Once the event is created the
 * tab keeps nothing, and the page opened again is a new wizard.
 *
 * The name the last step proposed is kept with the email of the account it was proposed for, and
 * stays while the wizard is that account's: signed in as it, or going on with its email (`ending`)
 * once its session ended at "Crear". Once the browser is known to hold no account or another one
 * (a question about the session without an answer decides nothing), and nothing is on its way or
 * waited for, it is forgotten; left as it was proposed, the field is emptied, the wizard staying on
 * its step with everything else kept, for the last step to ask the name of whoever creates. Whoever the wizard
 * went on with while something was on its way or a code was waited for takes the name proposed
 * over when that ends: an account that signed in meanwhile (with that code, or another way), or
 * else the email the code was sent to or could not be.
 */
@Component({
  selector: 'app-create-page',
  imports: [
    CreateDone,
    StepStack,
    Step,
    TranslocoPipe,
    WizardDates,
    WizardDetails,
    WizardFinish,
    WizardSummary,
    WizardTimes,
  ],
  styleUrl: './create-page.scss',
  templateUrl: './create-page.html',
})
export class CreatePage {
  private readonly session = inject(Session);
  private readonly opening = openingDraft();
  protected readonly step = signal<number>(this.opening.step);
  /**
   * Step 3 shows the summary of the times instead of the times: as left after a reload, and as
   * step 3 is reached, the summary from a later step and the times from an earlier one. Kept on
   * the other steps, so that step 3 keeps what it shows while it folds or fades away.
   */
  protected readonly summary: WritableSignal<boolean> = linkedSignal<number, boolean>({
    source: this.step,
    computation: (step, previous) => {
      if (!previous) return this.opening.summary;
      return step === TIMES_STEP ? previous.source > TIMES_STEP : previous.value;
    },
  });
  /**
   * The first column asked for on step 3, the same for the times and their summary: the first
   * columns when step 3 is reached from an earlier step, kept otherwise.
   */
  protected readonly place: WritableSignal<number> = linkedSignal<number, number>({
    source: this.step,
    computation: (step, previous) => {
      if (!previous || (step === TIMES_STEP && previous.source < TIMES_STEP)) return 0;
      return previous.value;
    },
  });
  protected readonly details = signal<EventDetails>(this.opening.details);
  protected readonly dates = signal<DateSelection>(this.opening.dates);
  /** What is written in the smart calendar's box. */
  protected readonly phrase = signal<string>(this.opening.phrase);
  /** The wizard has the times step. */
  protected readonly timesAsked = computed<boolean>(() => asksForTimes(this.dates()));
  /** The number of the last step: after the summary when times are asked for. */
  protected readonly lastStep = computed<number>(() => lastStepOf(this.dates()));
  /** The month the calendar shows, as `YYYY-MM`. */
  protected readonly month = signal<string>(this.opening.month);
  /** What the last step asks: the deadline, the note and anonymous voting. */
  protected readonly ending = signal<EventEnding>(this.opening.ending);
  /** The event as last sent and its management token, so sending it again repeats the token. */
  protected readonly sent = signal<SentEvent | null>(this.opening.sent);
  /** The sign-in code the last step waits for, so that a reload comes back to it. */
  protected readonly code = signal<CodeWait | null>(this.opening.code);
  /** The name the last step proposed, with the account it was proposed for, while the wizard is its. */
  protected readonly proposedName = signal<ProposedName | null>(this.opening.proposedName);
  /** The event, or a code, is on its way. */
  protected readonly sending = signal(false);
  /** The other steps stay closed: something is on its way, or a code is waited for. */
  protected readonly locked = computed<boolean>(() => this.sending() || this.code() !== null);
  /** The event created, once it is: "¡Hecho!" shows it. */
  protected readonly created = signal<CreatedEvent | null>(null);

  private readonly stack = viewChild(StepStack);

  constructor() {
    // Kept on every change, so that the page opened again in this tab finds it; once the event is
    // created there is nothing left to keep.
    effect(() => {
      if (this.created()) {
        forgetDraft();
        return;
      }
      keepDraft({
        step: this.step(),
        summary: this.summary(),
        details: this.details(),
        dates: this.dates(),
        phrase: this.phrase(),
        month: this.month(),
        ending: this.ending(),
        sent: this.sent(),
        code: this.code(),
        proposedName: this.proposedName(),
      });
    });
    // Whose the name proposed is, read again whenever the session's answer or the lock changes.
    // This effect runs before the last step's, which drops the code an account signed in for.
    let lockedBefore = false;
    effect(() => {
      const proposed = this.proposedName();
      const account = this.session.account();
      const answered = this.session.answered();
      const locked = this.locked();
      const unlocked = lockedBefore && !locked;
      lockedBefore = locked;
      if (proposed === null || !answered) return;
      untracked(() => {
        this.settleProposedName(proposed, account ?? null, locked, unlocked);
      });
    });
  }

  /**
   * Whose the name proposed is, once the session has answered: the wizard's, with the account signed
   * in or, without one, the email of the last step. The same keeps it; nothing is decided while
   * something is on its way or waited for. Whoever the wizard went on with meanwhile takes it over
   * when that ends: an account that signed in, or else the email a code was sent to (or failed to
   * be). Otherwise another account or email forgets it.
   */
  private settleProposedName(
    proposed: ProposedName,
    account: SignedInAccount | null,
    locked: boolean,
    unlocked: boolean,
  ): void {
    const email = account ? account.email : this.ending().email;
    if (email === proposed.email || locked) return;
    if (unlocked) this.proposedName.set({ ...proposed, email });
    else this.forgetProposedName(proposed.name);
  }

  /** The name proposed is forgotten, and emptied if it was left as it was, for the last step. */
  private forgetProposedName(proposed: string): void {
    this.proposedName.set(null);
    if (this.details().organizerName !== proposed) return;
    this.details.update((details) => ({ ...details, organizerName: '' }));
  }

  /** Step 3 shows the summary of its times, or the times again, in the same card. */
  protected showSummary(shown: boolean): void {
    this.summary.set(shown);
    // The control pressed is gone with its part: the focus goes to the card, as on a change of step.
    this.stack()?.focusCard();
  }

  /** "Crear otro evento": the wizard as the page first opens, on step 1 with nothing asked. */
  protected startAgain(): void {
    const draft = newDraft();
    this.step.set(draft.step);
    this.details.set(draft.details);
    this.dates.set(draft.dates);
    this.phrase.set(draft.phrase);
    this.month.set(draft.month);
    this.ending.set(draft.ending);
    this.sent.set(draft.sent);
    this.code.set(draft.code);
    this.proposedName.set(draft.proposedName);
    this.sending.set(false);
    this.created.set(null);
  }
}
