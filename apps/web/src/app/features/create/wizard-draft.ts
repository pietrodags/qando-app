import { type EventDetails, detailsProblems, latestOptionDate } from '@qando/domain';
import {
  type DateSelection,
  NO_DATES,
  asksForTimes,
  hasDates,
  withoutDatesBefore,
} from './date-selection';
import { monthOf, monthWithin } from './month-grid';
import { today } from './today';
import { type CodeWait, type EventEnding, NO_ENDING, type SentEvent } from './wizard-finish';

/**
 * Everything the creation wizard holds, as a page opened again in the same tab finds it: a reload,
 * or a visit to another page and back.
 */
export interface WizardDraft {
  /** The step on screen. */
  readonly step: number;
  /** Step 3 shows the summary of the times instead of the times themselves. */
  readonly summary: boolean;
  readonly details: EventDetails;
  readonly dates: DateSelection;
  /** What is written in the smart calendar's box. */
  readonly phrase: string;
  /** The month the calendar shows, as `YYYY-MM`. */
  readonly month: string;
  readonly ending: EventEnding;
  /** The event as last sent and its management token, so sending it again repeats the token. */
  readonly sent: SentEvent | null;
  /** The sign-in code the last step waits for; `null` while it asks its fields. */
  readonly code: CodeWait | null;
}

const KEY = 'qando.wizardDraft';

/**
 * The shape of the drafts this wizard keeps: raise it whenever `WizardDraft` changes, so that a
 * tab still holding a draft of the wizard before a new version opens a new one instead.
 */
const VERSION = 3;

/** The wizard as it first opens: on step 1 with nothing asked, the calendar on today's month. */
export function newDraft(): WizardDraft {
  return {
    step: 1,
    summary: false,
    details: { organizerName: '', title: '' },
    dates: NO_DATES,
    phrase: '',
    month: monthOf(today()),
    ending: NO_ENDING,
    sent: null,
    code: null,
  };
}

/**
 * The wizard a page opens with: the draft this tab kept, as it can go on today, or else a new
 * one. The dates before today are gone, as the dates step leaves them the day after; the calendar
 * opens no earlier than today's month; a deadline chosen before today is the suggested one again;
 * and the step is one the wizard can be on with what is left: step 1 while the name or the title
 * is not valid, the dates when no date is left, the last step when no date of its own is left to
 * have times. The code the last step waited for is waited for still only on that step.
 */
export function openingDraft(): WizardDraft {
  const draft = keptDraft();
  return draft ? asOf(draft, today()) : newDraft();
}

/**
 * Keeps the draft in this tab, in the place of the one kept before, until the tab closes. A tab
 * whose storage is refused keeps none: the wizard goes on as long as the page lives.
 */
export function keepDraft(draft: WizardDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ version: VERSION, draft }));
  } catch {
    // Nothing kept: the page still holds the wizard.
  }
}

/** Forgets the draft this tab kept: its event is created. */
export function forgetDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // A storage that refuses to be used kept nothing.
  }
}

/** The draft this tab kept by this version of the wizard; `null` for none or anything else. */
function keptDraft(): WizardDraft | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      version?: unknown;
      draft?: WizardDraft;
    } | null;
    return kept?.version === VERSION ? (kept.draft ?? null) : null;
  } catch {
    return null;
  }
}

/** The draft as it can go on, with `first` as today. */
function asOf(draft: WizardDraft, first: string): WizardDraft {
  const dates = withoutDatesBefore(draft.dates, first);
  const { deadline } = draft.ending;
  const step = stepFor(draft.step, draft.details, dates);
  return {
    ...draft,
    step,
    code: step === lastStepOf(dates) ? draft.code : null,
    dates,
    month: monthWithin(draft.month, { first, last: latestOptionDate(first) }),
    ending: { ...draft.ending, deadline: deadline !== null && deadline < first ? null : deadline },
  };
}

/**
 * The number of the wizard's last step with these dates: 4, after the times and their summary,
 * while times are asked for and a date of its own can have them; 3 otherwise.
 */
export function lastStepOf(dates: DateSelection): number {
  return asksForTimes(dates) ? 4 : 3;
}

/** The step left, or the first before it whose step is no longer done. */
function stepFor(step: number, details: EventDetails, dates: DateSelection): number {
  if (detailsProblems(details).length > 0) return 1;
  if (!hasDates(dates)) return Math.min(step, 2);
  return Math.min(step, lastStepOf(dates));
}
