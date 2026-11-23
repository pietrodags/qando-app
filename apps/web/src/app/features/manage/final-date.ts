import {
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { FormField, disabled, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent, Option } from '@qando/contracts';
import type { RequestFailure } from '../../core/api/request-failure';
import { Dialog } from '../../shared/ui/dialog';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { NoticeBox, type NoticeLine } from '../create/notice-box';
import { OptionLabels } from '../results/option-labels';
import { optionInFull, zoneCity } from '../vote/display';
import { ManageSection } from './manage-section';

/**
 * The final date of an event on its management page. Until one is confirmed, a section closed as
 * the page opens, as every section: the options to choose from, the recommended ones marked "Más votada" (the only one already chosen) and the
 * button that confirms the choice. Past six options, the box shows six and scrolls the rest,
 * under ︿ and ﹀. The choice is confirmed at once when it is the usual case
 * (voting closed, a recommended option, votes in); otherwise a question first says what makes
 * it unusual: nobody voted, nobody can attend any option, it is not the recommended option,
 * voting will close. Once a date is
 * confirmed: the green card with it in full, always in sight. The page sends the confirmation and says how it
 * went through `sending` and `failure`; a confirmation refused because the options were replaced
 * meanwhile, through `notice`, told in an amber box under the help, which opens the section.
 */
@Component({
  selector: 'app-final-date',
  imports: [Dialog, FormField, ManageSection, NoticeBox, RouterLink, ScrollFold, TranslocoPipe],
  styleUrl: './final-date.scss',
  templateUrl: './final-date.html',
})
export class FinalDate {
  /** The options in sight at once; past them the box scrolls. */
  protected readonly shownOptions = 6;
  readonly event = input.required<ManagedEvent>();
  /** A confirmation is on its way: nothing else can be confirmed. */
  readonly sending = input(false);
  /** Why the last confirmation did not get through; while a rate limit lasts, it waits. */
  readonly failure = input<RequestFailure | null>(null);
  /**
   * Why the last confirmation was not made, told until the organizer closes it or the page
   * takes it away: the options were replaced since the page read them.
   */
  readonly notice = input<FinalDateNotice | null>(null);
  /** The option to confirm, chosen and, when it was asked, accepted. */
  readonly confirm = output<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  protected readonly labels = inject(OptionLabels);

  /**
   * The chosen option's ID: the only recommended one at first, none (`''`, as radios hold text)
   * with a tie or no votes. When the event is read again (a vote, its emails), once the
   * organizer has chosen, the option stays chosen while it is still one of the event's; an
   * untouched choice follows the event.
   */
  // Typed on the field: what the template reads keeps its type whatever a mutant does inside.
  protected readonly chosen: WritableSignal<string> = linkedSignal<ManagedEvent, string>({
    source: () => this.event(),
    computation: (event, previous) => {
      const kept = previous?.value;
      return this.chosenByHand && event.options.some(({ id }) => id === kept)
        ? (kept ?? '')
        : firstChoice(event);
    },
  });
  /**
   * Where the chosen option stands among the options, for the box to keep it in sight: past six,
   * the only recommended one may be below them, and confirming it unseen would surprise.
   */
  protected readonly chosenPlace = computed<number | null>(() => {
    const place = this.event().options.findIndex(({ id }) => id === this.chosen());
    return place === -1 ? null : place;
  });
  /** The organizer has chosen an option: a new read of the event keeps it. */
  protected chosenByHand = false;
  /** The radios over `chosen`: one group, off while a confirmation is on its way. */
  protected readonly choice = form(this.chosen, (path) => {
    disabled(path, { when: () => this.sending() });
  });
  /** The notice while the organizer has not closed it with its cross. */
  protected readonly shownNotice: WritableSignal<FinalDateNotice | null> = linkedSignal(() =>
    this.notice(),
  );
  protected readonly noticeLines = computed<readonly NoticeLine[]>(() =>
    this.shownNotice() === null
      ? []
      : [
          {
            lead: this.translate('manage.choose.notConfirmed'),
            text: this.translate('manage.choose.optionsChanged'),
          },
        ],
  );
  /**
   * Whether the section is open: closed as the page opens, opened by a notice, else as the
   * organizer leaves it.
   */
  protected readonly open: WritableSignal<boolean> = linkedSignal<FinalDateNotice | null, boolean>({
    source: () => this.notice(),
    computation: (notice, previous) => notice !== null || (previous?.value ?? false),
  });
  /** The question shown before confirming the chosen option; null when none is open. */
  protected readonly asking = signal<Question | null>(null);
  /** The seconds a rate limit still holds the button; 0 without one. */
  protected readonly waitSeconds = computed<number>(() => {
    const failure = this.failure();
    return failure?.kind === 'limited' ? failure.seconds : 0;
  });
  protected readonly questions = computed<readonly Question[]>(() => {
    const question = this.asking();
    return question === null ? [] : [question];
  });

  protected readonly recommended = computed<ReadonlySet<string>>(
    () => new Set(this.event().recommendedOptionIds),
  );
  /** "Madrid" when an option has a time and the browser is in another zone. */
  protected readonly zone = computed<string | null>(() => {
    const { options, confirmedOption, timeZone } = this.event();
    const timed = [...options, confirmedOption].some((option) => option?.time != null);
    return timed ? zoneCity(timeZone) : null;
  });

  private readonly choices = viewChild<ElementRef<HTMLElement>>('choices');
  private readonly confirmedHeading = viewChild<ElementRef<HTMLElement>>('confirmedHeading');

  constructor() {
    // The organizer has just confirmed: the focus follows the choice, now gone, to the card.
    let choosing = false;
    effect(() => {
      const heading = this.confirmedHeading();
      if (this.choices() !== undefined) choosing = true;
      if (heading === undefined || !choosing) return;
      choosing = false;
      heading.nativeElement.focus();
    });
  }

  /** "viernes 10 de julio de 2026, 20:00 a 22:00": the confirmed date in full. */
  protected inFull(option: Option): string {
    return optionInFull(option, this.locale, (key, params) =>
      this.transloco.translate(key, params),
    );
  }

  /**
   * The cross closed the notice: the focus, gone with it, goes to the options, to choose again:
   * to the chosen one, or the first.
   */
  protected closeNotice(): void {
    this.shownNotice.set(null);
    const options = this.choices()?.nativeElement;
    const option =
      options?.querySelector<HTMLInputElement>('input:checked') ??
      options?.querySelector<HTMLInputElement>('input');
    option?.focus();
  }

  /** Only while an option is chosen: the button waits for one. */
  protected tryConfirm(): void {
    const optionId = this.chosen();
    const question = this.questionFor(optionId);
    if (question === null) this.confirm.emit(optionId);
    else this.asking.set(question);
  }

  /** The question was closed: unless another one was asked since. */
  protected dismiss(question: Question): void {
    this.asking.update((current) => (current === question ? null : current));
  }

  protected accept(question: Question): void {
    this.confirm.emit(question.optionId);
  }

  /** What makes confirming the option unusual, or null in the usual case. */
  private questionFor(optionId: string): Question | null {
    const { state, voters, options } = this.event();
    const recommended = options.filter(({ id }) => this.recommended().has(id));
    const notes: string[] = [];
    if (voters === 0) notes.push(this.translate('manage.dialog.noVotes'));
    else if (recommended.length === 0) notes.push(this.translate('manage.dialog.nobodyCanAttend'));
    else if (!this.recommended().has(optionId)) {
      notes.push(
        this.translate('manage.dialog.notRecommended', {
          count: recommended.length,
          dates: this.list(recommended.map((option) => this.withArticle(option))),
        }),
      );
    }
    if (state === 'open') {
      notes.push(this.translate(voters === 0 ? 'manage.dialog.openNoVotes' : 'manage.dialog.open'));
    }
    if (notes.length === 0) return null;
    const option = options.find(({ id }) => id === optionId);
    const date = option === undefined ? '' : this.withArticle(option);
    return { optionId, title: this.translate('manage.dialog.title', { date }), notes };
  }

  /** "el viernes 10 de julio", "del lunes 6 al viernes 10 de julio". */
  private withArticle(option: Option): string {
    return this.translate(`manage.dateWithArticle.${option.dates.kind}`, {
      date: this.labels.plain(option),
    });
  }

  private list(items: string[]): string {
    return new Intl.ListFormat(this.locale, { type: 'conjunction' }).format(items);
  }

  private translate(key: string, params: Record<string, unknown> = {}): string {
    return this.transloco.translate(key, params);
  }
}

/** Why a confirmation was not made: the options were replaced since the page read them. */
export type FinalDateNotice = 'optionsChanged';

/** The question before an unusual confirmation: its title and why it is unusual. */
interface Question {
  readonly optionId: string;
  readonly title: string;
  /** Catalogue markup (bold lead-ins) around generated dates: never the organizer's text. */
  readonly notes: readonly string[];
}

/** The option chosen before the organizer chooses: the only recommended one, or none. */
function firstChoice({ recommendedOptionIds }: ManagedEvent): string {
  return recommendedOptionIds.length === 1 ? (recommendedOptionIds[0] ?? '') : '';
}
