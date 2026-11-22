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
import { EventManagement, type Management } from './event-management';

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

/**
 * Pending is "being sent", except "Votación cerrada" while voting is open: it waits for the
 * closing.
 */
function stageOf(email: EmailState, event: ManagedEvent): Stage {
  if (email.status !== 'pending') return email.status;
  return email.type === 'voting-closed' && event.state === 'open' ? 'scheduled' : 'sending';
}

/**
 * The emails an event sends its organizer, each with its state: when a sent one went (in the
 * event's time zone), being sent, waiting for the closing, or failed with "Reintentar". Retrying
 * asks for the email again; while one is being sent, the event is read again every 10 seconds.
 * Either way the event as it then is goes to the page (`changed`), also when it is refused or
 * cancelled. Hidden when the event has no email.
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

  /** The email whose retry is on its way. */
  protected readonly retrying: WritableSignal<EmailType | null> = signal(null);
  /** The last retry did not get through. */
  protected readonly retryFailed: WritableSignal<boolean> = signal(false);

  protected readonly shown = computed<readonly ShownEmail[]>(() => {
    const event = this.event();
    return event.emails.map((email) => {
      const stage = stageOf(email, event);
      return {
        type: email.type,
        name: names[email.type],
        state: {
          key: `manage.emails.${stage}`,
          params: email.status === 'sent' ? this.sentOn(email.sentAt, event.timeZone) : {},
        },
        failed: stage === 'failed',
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const event = this.event();
      if (!event.emails.some((email) => stageOf(email, event) === 'sending')) return;
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
    let answer: Management;
    try {
      answer = await this.management.retry(this.eventId(), type);
    } catch {
      this.retryFailed.set(true);
      return;
    } finally {
      this.retrying.set(null);
    }
    if (this.destroyRef.destroyed) return;
    this.changed.emit(answer);
    // Its "Reintentar" goes: the keyboard's focus stays on the email, now being sent.
    if (answer.kind === 'managed') {
      this.host.nativeElement.querySelector<HTMLElement>(`[data-type="${type}"]`)?.focus();
    }
  }

  /** `2026-11-22T09:14:00Z` in Madrid → "22 de noviembre de 2026" and "10:14". */
  private sentOn(sentAt: string, timeZone: string): Record<string, string> {
    const at = Date.parse(sentAt);
    const date = new Intl.DateTimeFormat(this.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone,
    });
    const time = new Intl.DateTimeFormat(this.locale, {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    });
    return { date: date.format(at), time: time.format(at) };
  }
}
