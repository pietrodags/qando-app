import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import type { HalfOfDay } from './reading';
import { TimeQuestions } from './time-questions';
import questionStyles from './time-questions.scss' with { loader: 'text' };

type Question = DateInterpretation['questions'][number];

/** "a las 10" asked of Monday 22 June. */
const AT_TEN: Question = {
  fragment: 'a las 10',
  dates: ['2026-06-22'],
  morning: { kind: 'single', at: '10:00' },
  afternoon: { kind: 'single', at: '22:00' },
};

/** "de 5 a 7" asked of Tuesday 16 June. */
const FIVE_TO_SEVEN: Question = {
  fragment: 'de 5 a 7',
  dates: ['2026-06-16'],
  morning: { kind: 'range', start: '05:00', end: '07:00' },
  afternoon: { kind: 'range', start: '17:00', end: '19:00' },
};

describe('TimeQuestions', () => {
  let fixture: ComponentFixture<TimeQuestions>;
  /** Each time every question had its answer, the answers told. */
  let answered: (readonly HalfOfDay[])[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TimeQuestions], providers: [provideI18n()] });
  });

  async function render(questions: readonly Question[]): Promise<void> {
    fixture = TestBed.createComponent(TimeQuestions);
    fixture.componentRef.setInput('questions', questions);
    answered = [];
    fixture.componentInstance.answered.subscribe((answers) => answered.push(answers));
    // In the page: the focus is followed.
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function groups(): HTMLElement[] {
    return [...host().querySelectorAll<HTMLElement>('[role="group"]')];
  }

  /** The answers of a question, the morning first. */
  function answers(question: number): HTMLButtonElement[] {
    return [...(groups()[question]?.querySelectorAll('button') ?? [])];
  }

  async function press(question: number, half: HalfOfDay): Promise<void> {
    answers(question)[half === 'morning' ? 0 : 1]?.click();
    await fixture.whenStable();
  }

  /** Which answer of each question shows as picked. */
  function picked(): (HalfOfDay | null)[] {
    return groups().map((_, question) => {
      const [morning, afternoon] = answers(question).map(
        (each) => each.getAttribute('aria-pressed') === 'true',
      );
      if (morning && afternoon) throw new Error('Both answers of a question are picked');
      if (morning) return 'morning';
      return afternoon ? 'afternoon' : null;
    });
  }

  function text(element: Element | null | undefined): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(questionStyles)).toEqual([]);
  });

  it('asks each question in a sentence, its days in bold, one under another', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    expect(groups().map((each) => text(each.querySelector('p')))).toEqual([
      '«a las 10» del lun 22 jun: ¿mañana o tarde?',
      '«de 5 a 7» del mar 16 jun: ¿mañana o tarde?',
    ]);
    expect([...host().querySelectorAll('strong')].map((each) => each.textContent)).toEqual([
      'lun 22 jun',
      'mar 16 jun',
    ]);
  });

  it('names each pair of answers after its question, for screen readers', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    expect(groups().map((each) => each.getAttribute('aria-label'))).toEqual([
      '«a las 10» del lun 22 jun: ¿mañana o tarde?',
      '«de 5 a 7» del mar 16 jun: ¿mañana o tarde?',
    ]);
  });

  it('gives each question its two readings as buttons, the morning first, none picked', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    const shown = (question: number): string[] =>
      answers(question).map((each) => text(each.querySelector('[aria-hidden="true"]')));
    expect(shown(0)).toEqual(['10:00 · mañana', '22:00 · tarde']);
    expect(shown(1)).toEqual(['5:00 → 7:00 · mañana', '17:00 → 19:00 · tarde']);
    expect(answers(0).map((each) => each.type)).toEqual(['button', 'button']);
    expect(picked()).toEqual([null, null]);
  });

  it('says each reading in words to screen readers, in place of what the button shows', async () => {
    await render([FIVE_TO_SEVEN]);

    const heard = answers(0).map((each) => {
      const said = [...each.children].filter((part) => part.getAttribute('aria-hidden') !== 'true');
      return said.map(text);
    });
    expect(heard).toEqual([['de 5:00 a 7:00, mañana'], ['de 17:00 a 19:00, tarde']]);
  });

  it('takes the focus on the first answer of the first question', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    expect(document.activeElement).toBe(answers(0)[0]);
  });

  it('tells the answer of its only question as soon as it is picked', async () => {
    await render([AT_TEN]);

    await press(0, 'afternoon');

    expect(answered).toEqual([['afternoon']]);
  });

  it('shows an answer as picked and tells nothing while a question has none', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    await press(0, 'morning');

    expect(picked()).toEqual(['morning', null]);
    expect(answered).toEqual([]);
  });

  it('lets an answer be changed before the last question has its own', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    await press(0, 'morning');
    await press(0, 'afternoon');

    expect(picked()).toEqual(['afternoon', null]);
    expect(answered).toEqual([]);

    await press(1, 'morning');
    expect(answered).toEqual([['afternoon', 'morning']]);
  });

  it('takes the answers in any order, and tells them in the order of the questions', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);

    await press(1, 'afternoon');
    expect(picked()).toEqual([null, 'afternoon']);
    expect(answered).toEqual([]);

    await press(0, 'morning');
    expect(answered).toEqual([['morning', 'afternoon']]);
  });

  it('starts again with other questions: none picked, and the focus on the first answer', async () => {
    await render([AT_TEN, FIVE_TO_SEVEN]);
    await press(1, 'afternoon');
    answers(1)[1]?.focus();

    fixture.componentRef.setInput('questions', [FIVE_TO_SEVEN, AT_TEN]);
    await fixture.whenStable();

    expect(picked()).toEqual([null, null]);
    expect(document.activeElement).toBe(answers(0)[0]);

    await press(0, 'morning');
    expect(answered).toEqual([]);
  });
});
