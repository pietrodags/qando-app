import {
  Component,
  DestroyRef,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent } from '@qando/contracts';
import { closesAfterFirstOption, firstOptionDay, suggestedDeadline } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { Dialog } from '../../shared/ui/dialog';
import { Toaster } from '../../shared/ui/toast';
import { DeadlineField } from '../create/deadline-field';
import { today } from '../create/today';
import { EventManagement, type Management } from './event-management';
import { ManageSection } from './manage-section';

/** What the organizer sent: a new deadline while voting is open, reopening it, or closing it. */
type Action = 'save' | 'reopen' | 'close';

/** One asking of the question: asked again, it is a new one. */
type Question = object;

let nextHelpId = 0;

/**
 * "Plazo de votación" on the management page, a section closed as the page opens, until a date
 * is confirmed (then the deadline can no longer change and there is no section). While voting
 * is open: the deadline in the creation's three selects, from today in the event's time zone,
 * "Cambiar plazo" once another day is chosen, and "Cerrar votación", which always asks first.
 * Once closed: the selects on the day the creation would suggest today and "Reabrir votación".
 * A day on the first proposed date or after it is warned about, never refused. Each request
 * says so on its button with everything off; its answer goes to the page (the event as the API
 * leaves it, or refused, or cancelled), a new deadline is told in a toast, and after closing the
 * focus goes to "Reabrir votación"; one that did not get through says so under the buttons.
 */
@Component({
  selector: 'app-event-deadline',
  imports: [DeadlineField, Dialog, ManageSection, TranslocoPipe],
  styleUrl: './event-deadline.scss',
  templateUrl: './event-deadline.html',
})
export class EventDeadline {
  /** The event's ID, as the page manages it. */
  readonly eventId = input.required<string>();
  readonly event = input.required<ManagedEvent>();
  /** The event as a request left it. */
  readonly changed = output<Management>();

  private readonly management = inject(EventManagement);
  private readonly transloco = inject(TranslocoService);
  private readonly toaster = inject(Toaster);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly words: CalendarWords = calendarWords(this.transloco.getActiveLang());

  /** What names the selects: the help line over them. */
  protected readonly helpId = `deadline-help-${String((nextHelpId += 1))}`;

  /**
   * The day in the selects: the deadline while voting is open, the suggested one once closed.
   * A new read of the event (its emails, a vote) keeps the organizer's choice while its deadline
   * and its state stay; a change made elsewhere replaces it.
   */
  // Typed on the field: what the template reads keeps its type whatever a mutant does inside.
  protected readonly chosen: WritableSignal<string> = linkedSignal<ManagedEvent, string>({
    source: () => this.event(),
    computation: (event, previous) => {
      const kept =
        previous?.source.deadline === event.deadline && previous.source.state === event.state;
      return kept ? previous.value : startingDay(event);
    },
  });
  /** The warning that voting would close on the first date or after it; null when it does not. */
  protected readonly afterFirst = computed<{ weekday: string; day: string } | null>(() => {
    const { options, timeZone } = this.event();
    const first = firstOptionDay(options);
    if (first === null || !closesAfterFirstOption(this.chosen(), options)) return null;
    return {
      weekday: this.words.weekday(first),
      day: this.words.dayOfMonth(first, today(timeZone)),
    };
  });

  /** The request of this event on its way; a new event starts with none. */
  protected readonly sending: WritableSignal<Action | null> = linkedSignal<string, Action | null>({
    source: () => this.eventId(),
    computation: () => null,
  });
  /** The last request of this event that did not get through. */
  protected readonly failed: WritableSignal<Action | null> = linkedSignal<string, Action | null>({
    source: () => this.eventId(),
    computation: () => null,
  });
  /** The question on screen, if any; a new event starts with none. */
  private readonly asking: WritableSignal<Question | null> = linkedSignal<string, Question | null>({
    source: () => this.eventId(),
    computation: () => null,
  });
  /** One dialog per question, so a late `close` of the one just closed leaves a new one alone. */
  protected readonly questions = computed<readonly Question[]>(() => {
    const question = this.asking();
    return question === null ? [] : [question];
  });

  private readonly mainButton = viewChild<ElementRef<HTMLButtonElement>>('main');

  /** "Cambiar plazo", or "Reabrir votación" once voting has closed. */
  protected change(): void {
    const action = this.event().state === 'closed' ? 'reopen' : 'save';
    const deadline = this.chosen();
    void this.send(action, (eventId) => this.management.changeDeadline(eventId, deadline));
  }

  protected ask(): void {
    this.asking.set({});
  }

  /** The question was closed: unless another one was asked since. */
  protected dismiss(question: Question): void {
    this.asking.update((current) => (current === question ? null : current));
  }

  protected close(): void {
    void this.send('close', (eventId) => this.management.closeVoting(eventId));
  }

  /**
   * Sends a request and hands its answer to the page. Its answer is not the page's once it has
   * moved to another event (back or forward in the history) or left.
   */
  private async send(
    action: Action,
    request: (eventId: string) => Promise<Management>,
  ): Promise<void> {
    const eventId = this.eventId();
    const current = () => !this.destroyRef.destroyed && this.eventId() === eventId;
    this.sending.set(action);
    this.failed.set(null);
    try {
      const answer = await request(eventId);
      if (!current()) return;
      this.changed.emit(answer);
      if (answer.kind === 'managed') this.tell(action, answer.event);
    } catch {
      if (current()) this.failed.set(action);
    } finally {
      if (current()) this.sending.set(null);
    }
  }

  /**
   * After closing, the focus on "Reabrir votación" (none when a date was confirmed meanwhile:
   * the section is gone); a new deadline in a toast.
   */
  private tell(action: Action, { state, deadline, timeZone }: ManagedEvent): void {
    if (action === 'close') {
      afterNextRender(() => this.mainButton()?.nativeElement.focus(), { injector: this.injector });
    } else if (state === 'open') {
      const day = this.words.dayOfMonth(deadline, today(timeZone));
      const key = action === 'save' ? 'manage.deadline.saved' : 'manage.deadline.reopened';
      this.toaster.show(this.transloco.translate(key, { day }));
    }
  }
}

/** The day the selects start on: the deadline, or once closed the one suggested today. */
function startingDay({ state, deadline, options, timeZone }: ManagedEvent): string {
  return state === 'closed' ? suggestedDeadline(options, today(timeZone)) : deadline;
}
