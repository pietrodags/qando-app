import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  type WritableSignal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { EmailState, EmailType, ManagedEvent } from '@qando/contracts';
import { clockAt, longDate } from '../vote/display';
import { EventManagement, type Management, type RetryAnswer } from './event-management';

/** How long the page waits before reading again an event whose email is being sent. */
const READ_AGAIN_MS = 10_000;

/** Where an email stands for its organizer. */
type Stage = 'sent' | 'sending' | 'scheduled' | 'failed';

/** An email as the section shows it: its name, its state's catalogue key and values. */
interface ShownEmail {
  readonly type: EmailType;
  readonly name: string;
  readonly state: { readonly key: string; readonly params: Record<string, string> };
  readonly failed: boolean;
}

const names: Record<EmailType, string> = {
  summary: 'manage.emails.summary',
  'voting-closed': 'manage.emails.votingClosed',
};

/** As the API says: pending is "being sent", scheduled waits for voting to close. */
function stageOf(email: EmailState): Stage {
  return email.status === 'pending' ? 'sending' : email.status;
}

/** The event with one email in its new state. */
function withEmail(event: ManagedEvent, changed: EmailState): Management {
  const emails = event.emails.map((email) => (email.type === changed.type ? changed : email));
  return { kind: 'managed', event: { ...event, emails } };
}

/**
 * The emails an event sends its organizer, each with its state: when a sent one went (in the
 * event's time zone), being sent, waiting for the closing, or failed with "Reintentar". Retrying
 * asks for the email again and hands the page (`changed`) the event with the email being sent;
 * while one is being sent, the event is read again every 10 seconds and handed on, also when it
 * is refused or cancelled. Hidden when the event has no email.
 */
@Component({
  selector: 'app-event-emails',
  imports: [TranslocoPipe],
  styleUrl: './event-emails.scss',
  templateUrl: './event-emails.html',
  host: { '[hidden]': 'event().emails.length === 0' },
})
export class EventEmails {
  /** The event's ID, as the page manages it. */
  readonly eventId = input.required<string>();
  readonly event = input.required<ManagedEvent>();
  /** The event read again, after a retry or while an email is being sent. */
  readonly changed = output<Management>();

  private readonly management = inject(EventManagement);
  private readonly locale = inject(TranslocoService).getActiveLang();
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The email whose retry is on its way: every "Reintentar" waits for it. */
  protected readonly retrying: WritableSignal<EmailType | null> = signal(null);
  /** The last retry did not get through. */
  protected readonly retryFailed: WritableSignal<boolean> = signal(false);

  protected readonly shown = computed<readonly ShownEmail[]>(() => {
    const event = this.event();
    return event.emails.map((email) => {
      const stage = stageOf(email);
      return {
        type: email.type,
        name: names[email.type],
        state: {
          key: `manage.emails.${stage}`,
          params:
            email.status === 'sent'
              ? {
                  date: longDate(email.sentAt, this.locale, event.timeZone),
                  time: clockAt(email.sentAt, this.locale, event.timeZone),
                }
              : {},
        },
        failed: stage === 'failed',
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const event = this.event();
      if (!event.emails.some((email) => stageOf(email) === 'sending')) return;
      const eventId = this.eventId();
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const readLater = (): void => {
        timer = setTimeout(() => {
          this.management.read(eventId).then(
            (answer) => {
              if (!stopped) this.changed.emit(answer);
            },
            () => {
              // Did not get through: the next try, as long as the event is still shown.
              if (!stopped) readLater();
            },
          );
        }, READ_AGAIN_MS);
      };
      readLater();
      // A new event to show (the one just read) or the section gone: this round ends.
      onCleanup(() => {
        stopped = true;
        clearTimeout(timer);
      });
    });
  }

  protected async retry(type: EmailType): Promise<void> {
    this.retrying.set(type);
    this.retryFailed.set(false);
    let answer: RetryAnswer;
    try {
      answer = await this.management.retry(this.eventId(), type);
    } catch {
      this.retryFailed.set(true);
      return;
    } finally {
      this.retrying.set(null);
    }
    if (this.destroyRef.destroyed) return;
    this.changed.emit(answer.kind === 'retried' ? withEmail(this.event(), answer.email) : answer);
    // Its "Reintentar" goes: the keyboard's focus stays on the email, now being sent. (A refused
    // or cancelled event replaces the section, and the page places the focus itself.)
    this.host.nativeElement.querySelector<HTMLElement>(`[data-type="${type}"]`)?.focus();
  }
}
