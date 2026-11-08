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
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent, Option } from '@qando/contracts';
import { Dialog } from '../../shared/ui/dialog';
import { OptionLabels } from '../results/option-labels';
import { optionInFull, zoneCity } from '../vote/display';

/**
 * The final date of an event on its management page. Until one is confirmed: the options to
 * choose from, the recommended ones marked "Más votada" (the only one already chosen) and the
 * button that confirms the choice. The choice is confirmed at once when it is the usual case
 * (voting closed, a recommended option, votes in); otherwise a question first says what makes
 * it unusual: nobody voted, it is not the recommended option, voting will close. Once a date is
 * confirmed: the green card with it in full. The page sends the confirmation and says how it
 * went through `sending` and `failed`.
 */
@Component({
  selector: 'app-final-date',
  imports: [Dialog, RouterLink, TranslocoPipe],
  styleUrl: './final-date.scss',
  templateUrl: './final-date.html',
})
export class FinalDate {
  readonly event = input.required<ManagedEvent>();
  /** A confirmation is on its way: nothing else can be confirmed. */
  readonly sending = input(false);
  /** The last confirmation did not get through. */
  readonly failed = input(false);
  /** The option to confirm, chosen and, when it was asked, accepted. */
  readonly confirm = output<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  protected readonly labels = inject(OptionLabels);

  /** The chosen option: the only recommended one at first, none with a tie or no votes. */
  protected readonly chosen = linkedSignal<string | null>(() => {
    const recommended = this.event().recommendedOptionIds;
    return recommended.length === 1 ? (recommended[0] ?? null) : null;
  });
  /** The question shown before confirming the chosen option; null when none is open. */
  protected readonly asking = signal<Question | null>(null);
  protected readonly questions = computed<readonly Question[]>(() => {
    const question = this.asking();
    return question === null ? [] : [question];
  });

  protected readonly recommended = computed(() => new Set(this.event().recommendedOptionIds));
  /** "Madrid" when an option has a time and the browser is in another zone. */
  protected readonly zone = computed<string | null>(() => {
    const { options, confirmedOption, timeZone } = this.event();
    const timed = [...options, confirmedOption].some((option) => option?.time != null);
    return timed ? zoneCity(timeZone) : null;
  });
  protected readonly confirmedDate = computed<string>(() => {
    const option = this.event().confirmedOption;
    return option === null
      ? ''
      : optionInFull(option, this.locale, (key, params) => this.transloco.translate(key, params));
  });

  private readonly choices = viewChild<ElementRef<HTMLElement>>('choices');
  private readonly confirmedHeading = viewChild<ElementRef<HTMLElement>>('confirmedHeading');

  constructor() {
    // The organizer has just confirmed: the focus follows the choice, now gone, to the card.
    let choosing = false;
    effect(() => {
      const heading = this.confirmedHeading();
      if (this.choices() !== undefined) {
        choosing = true;
      } else if (heading !== undefined && choosing) {
        choosing = false;
        heading.nativeElement.focus();
      }
    });
  }

  protected tryConfirm(): void {
    const optionId = this.chosen();
    if (optionId === null) return;
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
    else if (recommended.length > 0 && !this.recommended().has(optionId)) {
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

/** The question before an unusual confirmation: its title and why it is unusual. */
interface Question {
  readonly optionId: string;
  readonly title: string;
  /** Catalogue markup (bold lead-ins) around generated dates: never the organizer's text. */
  readonly notes: readonly string[];
}
