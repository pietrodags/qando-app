import {
  Component,
  type ElementRef,
  Injector,
  type WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  viewChildren,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { DateInterpretation } from '@qando/contracts';
import type { HalfOfDay } from './reading';
import { type QuestionLine, questionLines } from './reading-words';

type Question = DateInterpretation['questions'][number];

/** The reading picked for each question, in their order; none for one not answered yet. */
type Picked = readonly (HalfOfDay | undefined)[];

/**
 * The questions a phrase's reading asks about times said without their half of the day ("a las
 * 8"), one under another: each a sentence with its days in bold and its two readings as buttons,
 * the morning first. They are answered in any order, and an answer can be changed while another
 * question has none; once every question has its answer, they are told through `answered`, in the
 * order of the questions. The first answer takes the focus when the questions show. Other
 * questions in their place start again, with no answer picked.
 */
@Component({
  selector: 'app-time-questions',
  styleUrl: './time-questions.scss',
  templateUrl: './time-questions.html',
})
export class TimeQuestions {
  /** The questions of a reading, in its order. */
  readonly questions = input.required<readonly Question[]>();
  /** Every question has its answer. */
  readonly answered = output<readonly HalfOfDay[]>();

  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly answers = viewChildren<ElementRef<HTMLButtonElement>>('answer');

  protected readonly halves: readonly HalfOfDay[] = ['morning', 'afternoon'];
  protected readonly lines = computed<readonly QuestionLine[]>(() =>
    questionLines(this.questions(), this.transloco),
  );
  protected readonly picked: WritableSignal<Picked> = linkedSignal<readonly Question[], Picked>({
    source: this.questions,
    computation: () => [],
  });

  constructor() {
    effect(() => {
      this.questions();
      afterNextRender(() => this.answers()[0]?.nativeElement.focus(), { injector: this.injector });
    });
  }

  protected pick(question: number, half: HalfOfDay): void {
    const picked = this.questions().map((_, each) =>
      each === question ? half : this.picked()[each],
    );
    this.picked.set(picked);
    if (picked.every((each) => each !== undefined)) this.answered.emit(picked);
  }
}
