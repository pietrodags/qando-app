import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import { capitalised, optionInFull, zoneCity } from './display';

/** A vote sent from the open page arrived after voting ended: a new one, or an edit. */
export type LateNotice = 'lateVote' | 'lateEdit';

/** What the closed card adds about this browser's vote. */
export type ClosedNotice = 'voted' | LateNotice;

/**
 * Why the participation link no longer takes votes: voting closed (the deadline passed or the
 * organizer closed it), the organizer confirmed a date, or the event was cancelled (only its
 * title is kept).
 */
export type Ended =
  | {
      readonly kind: 'closed';
      readonly title: string;
      readonly organizerName: string;
      /** The vote this browser holds was registered, or the one just sent arrived too late. */
      readonly notice: ClosedNotice | null;
    }
  | {
      readonly kind: 'confirmed';
      readonly title: string;
      readonly organizerName: string;
      readonly option: Option;
      /** The event's IANA zone, which the option's time is read in. */
      readonly timeZone: string;
      /** The vote just sent arrived after the organizer chose the date. */
      readonly notice: LateNotice | null;
    }
  | { readonly kind: 'cancelled'; readonly title: string };

/**
 * The card of the voting page once voting has ended, in place of the steps: the event's title,
 * the state's icon and heading, and what it means to the voter. Closed on the white step card,
 * confirmed on the thank-you green with the chosen date, cancelled on pink. Takes the focus to
 * its heading, so a screen reader follows the page when a refused vote turns it into this card.
 */
@Component({
  selector: 'app-vote-ended',
  imports: [TranslocoPipe],
  styleUrl: './vote-ended.scss',
  templateUrl: './vote-ended.html',
  host: { '[class]': 'ended().kind' },
})
export class VoteEnded {
  readonly ended = input.required<Ended>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly organizer = computed(() => {
    const ended = this.ended();
    return ended.kind === 'cancelled' ? '' : capitalised(ended.organizerName, this.locale);
  });

  /** "viernes 10 de julio de 2026, 20:00 a 22:00": the confirmed option, empty otherwise. */
  protected readonly confirmedDate = computed<string>(() => {
    const ended = this.ended();
    return ended.kind === 'confirmed'
      ? optionInFull(ended.option, this.locale, (key, params) =>
          this.transloco.translate(key, params),
        )
      : '';
  });

  /** The closed or confirmed card's notice of this browser's vote; null when it has none. */
  protected readonly notice = computed<ClosedNotice | null>(() => {
    const ended = this.ended();
    return ended.kind === 'cancelled' ? null : ended.notice;
  });

  /** "Madrid" when the confirmed option has a time and the browser is in another zone. */
  protected readonly confirmedZone = computed(() => {
    const ended = this.ended();
    return ended.kind === 'confirmed' && ended.option.time !== null
      ? zoneCity(ended.timeZone)
      : null;
  });

  constructor() {
    afterNextRender(() => {
      this.heading().nativeElement.focus();
    });
  }
}
