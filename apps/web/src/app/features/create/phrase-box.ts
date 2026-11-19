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
import type { DateInterpretation } from '@qando/contracts';
import type { DateSelection } from './date-selection';
import { Dictation } from './dictation';
import { NoticeBox } from './notice-box';
import { PhraseReader } from './phrase-reader';
import { type HalfOfDay, markingOf } from './reading';
import { type NoticeLine, noticeLines } from './reading-words';
import { TimeQuestions } from './time-questions';

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
 * they are and what the reading says about them; whoever shows the box closes it then. When a
 * time was said without its half of the day ("a las 8"), the box first asks which is meant, under
 * the text (`TimeQuestions`), and tells nothing until the last question is answered; the next
 * phrase sent takes the questions away. A phrase that gives no dates stays in the box with why,
 * in amber, and one that could not be read with a red line; both go with their cross or with the
 * next phrase. Nothing is sent for a phrase of blanks, nor while an answer is waited for (`ready`
 * says when a phrase would be sent). `clear` empties the box: its text, its questions and what it
 * tells go, and it waits for no answer. An answer no longer waited for, because the box was
 * emptied or is gone, is dropped when it comes. The text is the page's, so it is there the next
 * time the box opens; it takes the focus when the box opens.
 */
@Component({
  selector: 'app-phrase-box',
  imports: [Dictation, NoticeBox, TimeQuestions, TranslocoPipe],
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
  private readonly dictation = viewChild.required(Dictation);

  protected readonly max = MAX_LENGTH;
  /** An answer is waited for. */
  protected readonly waiting = signal(false);
  /** The reading whose questions wait for their answers: nothing of it is marked until then. */
  protected readonly asking = signal<DateInterpretation | null>(null);
  /** What the last reading tells, when it gave no dates. */
  protected readonly told = signal<readonly NoticeLine[]>([]);
  /** What went wrong last: the phrase was left unread, or the microphone was refused. */
  protected readonly unread = signal<'failed' | 'limited' | 'denied' | null>(null);
  /** There is a phrase to read and no answer is waited for: `generate` would send it. */
  readonly ready = computed<boolean>(() => this.text().trim() !== '' && !this.waiting());

  /** How many answers stopped being waited for: one that comes after another did is dropped. */
  private dropped = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.dropped += 1));
    afterNextRender(() => {
      this.field().nativeElement.focus();
    });
  }

  /**
   * Empties the box: its text, its questions and what it tells are gone, the answer waited for is
   * dropped, and the text box takes the focus.
   */
  clear(): void {
    this.dictation().stop();
    this.dropped += 1;
    this.waiting.set(false);
    this.asking.set(null);
    this.told.set([]);
    this.unread.set(null);
    this.text.set('');
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
    this.dictation().stop();
    this.waiting.set(true);
    this.asking.set(null);
    this.told.set([]);
    this.unread.set(null);
    const dropped = this.dropped;
    const read = await this.reader.read(this.text());
    if (dropped !== this.dropped) return;
    this.waiting.set(false);
    if (read.kind !== 'read') {
      this.unread.set(read.kind);
      return;
    }
    if (read.reading.questions.length > 0) this.asking.set(read.reading);
    else this.mark(read.reading, []);
  }

  /**
   * Every question of a reading has its answer, or it had none to ask: a reading with dates is
   * told, with each time as it was answered; one without stays in the box with why.
   */
  protected mark(reading: DateInterpretation, answers: readonly HalfOfDay[]): void {
    const { selection, notHeld } = markingOf(reading, answers, this.timed());
    const lines = noticeLines(reading.notices, notHeld, this.transloco);
    if (reading.options.length === 0) this.told.set(lines);
    else this.marked.emit({ selection, lines });
  }
}
