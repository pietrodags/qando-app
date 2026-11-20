import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import type { CreatedEvent } from './wizard-finish';

/**
 * The card that takes the wizard's place once the event is created (green, with a white check, as
 * the voting page's thanks): the link to vote, to share, shown without its protocol; the day the
 * results come by email, the deadline; "Gestionar evento", which opens the event's management
 * page; and "Crear otro evento". Takes the focus to its heading, so a screen reader follows the
 * page's change.
 */
@Component({
  selector: 'app-create-done',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './create-done.scss',
  templateUrl: './create-done.html',
})
export class CreateDone {
  /** The event just created. */
  readonly event = input.required<CreatedEvent>();
  /** The organizer wants to create another event. */
  readonly again = output();

  private readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());
  protected readonly host = location.host;
  /** "viernes, 27 de noviembre": the deadline, when the results come. */
  protected readonly resultsDay = computed<string>(() => this.words.dayName(this.event().deadline));

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => {
      this.heading().nativeElement.focus();
    });
  }
}
