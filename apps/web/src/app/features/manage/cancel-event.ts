import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  type WritableSignal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Dialog } from '../../shared/ui/dialog';
import { HoverTip } from '../../shared/ui/hover-tip';
import { Tooltip } from '../../shared/ui/tooltip';
import { EventManagement, type Management } from './event-management';

/** One asking of the question: asked again, it is a new one. */
type Question = object;

/**
 * "Cancelar evento", a trash at the foot of the management page, in every state of the event; its
 * name is said over it under the mouse. It always asks first (what goes with the event, that it
 * is final); once accepted it sends the cancellation, named "Cancelando…" meanwhile, and hands
 * the page the event as the API answers it: cancelled with its title (also when it already was),
 * or refused. A cancellation that did not get through says so under the trash, which offers it
 * again.
 */
@Component({
  selector: 'app-cancel-event',
  imports: [Dialog, HoverTip, Tooltip, TranslocoPipe],
  styleUrl: './cancel-event.scss',
  templateUrl: './cancel-event.html',
})
export class CancelEvent {
  /** The event's ID, as the page manages it. */
  readonly eventId = input.required<string>();
  /** Its title, named in the question. */
  readonly title = input.required<string>();
  /** The event as the cancellation left it. */
  readonly changed = output<Management>();

  private readonly management = inject(EventManagement);
  private readonly destroyRef = inject(DestroyRef);

  /** The question on screen, if any; a new event starts with none. */
  // Typed on the field: what the template reads keeps its type whatever a mutant does inside.
  private readonly asking: WritableSignal<Question | null> = linkedSignal<string, Question | null>({
    source: () => this.eventId(),
    computation: () => null,
  });
  /** One dialog per question, so a late `close` of the one just closed leaves a new one alone. */
  protected readonly questions = computed<readonly Question[]>(() => {
    const question = this.asking();
    return question === null ? [] : [question];
  });
  /** The cancellation of this event is on its way. */
  protected readonly sending: WritableSignal<boolean> = linkedSignal<string, boolean>({
    source: () => this.eventId(),
    computation: () => false,
  });
  /** The last cancellation of this event did not get through. */
  protected readonly failed: WritableSignal<boolean> = linkedSignal<string, boolean>({
    source: () => this.eventId(),
    computation: () => false,
  });

  protected ask(): void {
    this.asking.set({});
  }

  /** The question was closed: unless another one was asked since. */
  protected dismiss(question: Question): void {
    this.asking.update((current) => (current === question ? null : current));
  }

  /**
   * Sends the cancellation. Its answer is not the page's once it has moved to another event
   * (back or forward in the history) or left.
   */
  protected async cancel(): Promise<void> {
    const eventId = this.eventId();
    const current = () => !this.destroyRef.destroyed && this.eventId() === eventId;
    this.sending.set(true);
    this.failed.set(false);
    try {
      const answer = await this.management.cancel(eventId);
      if (current()) this.changed.emit(answer);
    } catch {
      if (current()) this.failed.set(true);
    } finally {
      if (current()) this.sending.set(false);
    }
  }
}
