import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { DateSelection } from './date-selection';
import { NoticeBox } from './notice-box';
import { PhraseReader } from './phrase-reader';
import { markingOf } from './reading';
import { type NoticeLine, noticeLines } from './reading-notices';

/** The most characters a phrase takes, counted as the text box counts them. */
const MAX_LENGTH = 120;

/** What a phrase that was read leaves on the calendar. */
export interface PhraseMarked {
  /** The dates and times chosen, in place of those chosen before. */
  readonly selection: DateSelection;
  /** What the reading tells about them, to show with the calendar; none for a plain reading. */
  readonly lines: readonly NoticeLine[];
}

/**
 * The box of the smart calendar, over the calendar of the dates step: the organizer writes when
 * in their own words ("todos los lunes de julio") and Enter, or whoever shows the box through
 * `generate`, has the phrase read. A phrase that gives dates is told through `marked`, with what
 * they are and what the reading says about them; whoever shows the box closes it then. A phrase
 * that gives none stays in the box with why, in amber, and one that could not be read with a red
 * line; both go with their cross or with the next phrase. Nothing is sent for a phrase of blanks,
 * nor while an answer is waited for (`ready` says when a phrase would be sent), and an answer
 * that comes once the box is gone is dropped. The text is the page's, so it is there the next
 * time the box opens; it takes the focus when the box opens.
 */
@Component({
  selector: 'app-phrase-box',
  imports: [NoticeBox, TranslocoPipe],
  styleUrl: './phrase-box.scss',
  templateUrl: './phrase-box.html',
})
export class PhraseBox {
  /** The phrase as written. */
  readonly text = model.required<string>();
  /** Times were asked for before the phrase: they stay asked for whatever it says. */
  readonly timed = input.required<boolean>();
  /** A phrase gave dates. */
  readonly marked = output<PhraseMarked>();

  private readonly reader = inject(PhraseReader);
  private readonly transloco = inject(TranslocoService);
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');

  protected readonly max = MAX_LENGTH;
  /** An answer is waited for. */
  protected readonly waiting = signal(false);
  /** What the last reading tells, when it gave no dates. */
  protected readonly told = signal<readonly NoticeLine[]>([]);
  /** Why the last phrase was left unread. */
  protected readonly unread = signal<'failed' | 'limited' | null>(null);
  /** There is a phrase to read and no answer is waited for: `generate` would send it. */
  readonly ready = computed<boolean>(() => this.text().trim() !== '' && !this.waiting());

  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
    afterNextRender(() => this.focus());
  }

  /** The text box takes the focus. */
  focus(): void {
    this.field().nativeElement.focus();
  }

  /** Enter has the phrase read; with Shift, or while a character is being composed, it writes. */
  protected entered(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) return;
    event.preventDefault();
    void this.generate();
  }

  /** Has the phrase read, when there is one and no answer is waited for. */
  async generate(): Promise<void> {
    if (!this.ready()) return;
    this.waiting.set(true);
    this.told.set([]);
    this.unread.set(null);
    const read = await this.reader.read(this.text());
    if (this.gone) return;
    this.waiting.set(false);
    if (read.kind !== 'read') {
      this.unread.set(read.kind);
      return;
    }
    const { selection, notHeld } = markingOf(read.reading, [], this.timed());
    const lines = noticeLines(read.reading.notices, notHeld, this.transloco);
    if (read.reading.options.length === 0) this.told.set(lines);
    else this.marked.emit({ selection, lines });
  }
}
