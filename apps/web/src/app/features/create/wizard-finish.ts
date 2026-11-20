import {
  Component,
  type ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, submit } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { createEventEndpoint } from '@qando/contracts';
import {
  type EventDetails,
  NOTE_MAX_LENGTH,
  type ProposedOption,
  closesAfterFirstOption,
  countCharacters,
  firstOptionDay,
  suggestedDeadline,
} from '@qando/domain';
import { ApiClient } from '../../core/api/api-client';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { Session } from '../../core/auth/session';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { CharacterLimit } from '../../shared/ui/character-limit';
import { Switch } from '../../shared/ui/switch';
import { Tooltip } from '../../shared/ui/tooltip';
import { type DateSelection, proposedOptions } from './date-selection';
import { DeadlineField } from './deadline-field';
import { today } from './today';

/** What the last step asks, held by the page so it outlives the step folding away. */
export interface EventEnding {
  /** The deadline the organizer chose, `YYYY-MM-DD`; `null` while it is the suggested one. */
  readonly deadline: string | null;
  /** The note for the participants, as typed. */
  readonly note: string;
  /** Participants vote without a name. */
  readonly anonymous: boolean;
}

/** Nothing asked yet: the suggested deadline, no note, and voting with names. */
export const NO_ENDING: EventEnding = { deadline: null, note: '', anonymous: false };

/** An event just created: what "¡Hecho!" shows of it. */
export interface CreatedEvent {
  /** The ID of its participation link, which is also its management page's. */
  readonly participationId: string;
  /** The deadline it was created with, `YYYY-MM-DD`. */
  readonly deadline: string;
}

/**
 * The last step of the creation wizard, inside its card: the deadline (`DeadlineField`), a note
 * for the participants, anonymous voting and, for an organizer signed in, the email the summary
 * and the results go to; then the round arrow back and the round "Crear" (✓). While the organizer
 * has not chosen a deadline it is the suggested one (`suggestedDeadline`), which follows the
 * dates; once chosen it is kept. When voting would close on or after the first date proposed,
 * an amber line under the field says so, naming that date; it does not stop the event. The note
 * stops at 150 characters as people see them, a count under it, and grows with its text.
 * Anonymous voting has an ⓘ that opens what it means in a tip, closed again by the ⓘ, Escape or
 * a press anywhere else.
 *
 * "Crear" sends the event with the session (`ApiClient`); meanwhile its ✓ is a spinner, the fields
 * are dimmed and off, the arrow back is off and the page is told (`sending`), so it can keep the
 * other steps closed. Created, the event's management token is kept in this browser
 * (`ManagementTokens`) and the page is told (`created`). Any failure keeps everything as it was
 * and says so under the buttons, with "Reintentar", which sends again with the focus on "Crear".
 */
@Component({
  selector: 'app-wizard-finish',
  imports: [CharacterLimit, DeadlineField, FormField, FormRoot, Switch, Tooltip, TranslocoPipe],
  styleUrl: './wizard-finish.scss',
  templateUrl: './wizard-finish.html',
  host: {
    '(keydown.escape)': 'helpOpen.set(false)',
    '(document:click)': 'clicked($event)',
  },
})
export class WizardFinish {
  /** The organizer's name and the event's title (step 1). */
  readonly details = input.required<EventDetails>();
  /** The dates chosen, and their times. */
  readonly selection = input.required<DateSelection>();
  /** The step's number, as its card's label shows it: the arrow goes back to the one before. */
  readonly step = input.required<number>();
  /** What the step asks, held by the page. */
  readonly ending = model.required<EventEnding>();
  /** The organizer goes back to the step before. */
  readonly back = output();
  /** The event is being sent (`true`), or its answer has come (`false`). */
  readonly sending = output<boolean>();
  /** The event is created. */
  readonly created = output<CreatedEvent>();

  private readonly api = inject(ApiClient);
  private readonly tokens = inject(ManagementTokens);
  private readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());
  /** The account signed in, whose email the summary and the results go to. */
  protected readonly account = inject(Session).account;
  protected readonly noteMax = NOTE_MAX_LENGTH;

  /** The last step's fields; sending the form ("Crear") creates the event. */
  protected readonly fields = form(this.ending, {
    submission: { action: () => this.send() },
  });

  /** The event is on its way: "Crear" waits, and everything else is off. */
  protected readonly busy = computed<boolean>(() => this.fields().submitting());
  /** The last sending failed. */
  protected readonly failed = signal(false);
  /** The tip of anonymous voting is open. */
  protected readonly helpOpen = signal(false);

  /** Today, as the clock said when it was last read. */
  private readonly firstDay = signal<string>(today());
  private readonly options = computed<ProposedOption[]>(() => proposedOptions(this.selection()));
  /** The deadline shown: the one chosen, or else the one suggested for the dates. */
  protected readonly deadline = computed<string>(
    () => this.ending().deadline ?? suggestedDeadline(this.options(), this.firstDay()),
  );
  /** The warning that voting closes after the first date, naming it; `null` when it does not. */
  protected readonly afterFirst = computed<{ weekday: string; day: string } | null>(() => {
    const first = firstOptionDay(this.options());
    if (first === null || !closesAfterFirstOption(this.deadline(), this.options())) return null;
    return { weekday: this.words.weekday(first), day: this.words.dayOfMonth(first) };
  });
  /** The note's characters as people see them, as its limit counts them. */
  protected readonly noteCount = computed<number>(() => countCharacters(this.ending().note.trim()));

  private readonly createButton = viewChild.required<ElementRef<HTMLButtonElement>>('create');
  private readonly infoButton = viewChild.required<ElementRef<HTMLButtonElement>>('info');

  /** A day chosen on the deadline's calendar: from now on it is the deadline. */
  protected choose(deadline: string): void {
    this.ending.update((ending) => ({ ...ending, deadline }));
  }

  protected setAnonymous(anonymous: boolean): void {
    this.ending.update((ending) => ({ ...ending, anonymous }));
  }

  /** "Reintentar": the event is sent again, the focus on "Crear", which shows it waits. */
  protected retry(): void {
    this.createButton().nativeElement.focus();
    void submit(this.fields);
  }

  /** A press anywhere but on the ⓘ closes its tip. */
  protected clicked(event: Event): void {
    if (event.target instanceof Node && this.infoButton().nativeElement.contains(event.target))
      return;
    this.helpOpen.set(false);
  }

  /** Sends the event: the deadline suggested is the one of today, read now. */
  private async send(): Promise<undefined> {
    this.firstDay.set(today());
    const deadline = this.deadline();
    const { organizerName, title } = this.details();
    const { note, anonymous } = this.ending();
    this.failed.set(false);
    this.sending.emit(true);
    try {
      const answer = await this.api.send(createEventEndpoint, {
        params: {},
        body: {
          title,
          organizerName,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          deadline,
          note,
          anonymous,
          options: this.options(),
        },
      });
      this.tokens.keep(answer.participationId, answer.managementToken);
      this.created.emit({ participationId: answer.participationId, deadline });
    } catch {
      this.failed.set(true);
    } finally {
      this.sending.emit(false);
    }
    return undefined;
  }
}
