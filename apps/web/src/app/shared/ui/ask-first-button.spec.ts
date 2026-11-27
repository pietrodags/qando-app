import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { AskFirstButton } from './ask-first-button';
import styles from './ask-first-button.scss' with { loader: 'text' };

describe('AskFirstButton', () => {
  let fixture: ComponentFixture<AskFirstButton>;
  let confirmed: number;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AskFirstButton], providers: [provideI18n()] });
  });

  afterEach(() => {
    document.querySelector('.elsewhere')?.remove();
  });

  /**
   * The button as the page names it and has it ask: the calendar's trash, unless told otherwise;
   * with `words`, a button that shows them.
   */
  async function render(
    label = 'Limpiar selección',
    question = '¿Borrar todo?',
    words?: string,
  ): Promise<void> {
    fixture = TestBed.createComponent(AskFirstButton);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('question', question);
    if (words !== undefined) fixture.componentRef.setInput('words', words);
    confirmed = 0;
    fixture.componentInstance.confirmed.subscribe(() => confirmed++);
    // In the page: the focus is followed.
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trash(): HTMLButtonElement | null {
    return host().querySelector<HTMLButtonElement>('button.trash');
  }

  /** The buttons on screen, as screen readers name them. */
  function buttons(): string[] {
    return [...host().querySelectorAll('button')].map(
      (each) => each.getAttribute('aria-label') ?? each.textContent.trim(),
    );
  }

  function answer(name: string): HTMLButtonElement {
    const found = [...host().querySelectorAll<HTMLButtonElement>('button.answer')].find(
      (each) => each.textContent.trim() === name,
    );
    if (!found) throw new Error(`No answer ${name}`);
    return found;
  }

  async function click(target: HTMLElement | null): Promise<void> {
    if (!target) throw new Error('Nothing to press');
    target.click();
    await fixture.whenStable();
  }

  async function escape(): Promise<void> {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
  }

  /** Something else of the page, to press or to hold the focus. */
  function elsewhere(): HTMLButtonElement {
    const other = document.createElement('button');
    other.className = 'elsewhere';
    document.body.append(other);
    return other;
  }

  it('is a trash named for screen readers and for the mouse resting on it', async () => {
    await render();

    expect(buttons()).toEqual(['Limpiar selección']);
    expect(trash()?.title).toBe('Limpiar selección');
    expect(trash()?.type).toBe('button');
    expect(trash()?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('asks in the trash’s place before it clears, "No" taking the focus', async () => {
    await render();

    await click(trash());

    expect(confirmed).toBe(0);
    expect(buttons()).toEqual(['Sí', 'No']);
    expect(host().classList.contains('asking')).toBe(true);
    expect(document.activeElement).toBe(answer('No'));
    // The two answers are heard with their question, which is heard once: as their group's name.
    const group = host().querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('¿Borrar todo?');
    expect(host().querySelector('.question')?.textContent.trim()).toBe('¿Borrar todo?');
    expect(host().querySelector('.question')?.getAttribute('aria-hidden')).toBe('true');
    expect(group?.contains(answer('Sí'))).toBe(true);
    expect(group?.contains(answer('No'))).toBe(true);
  });

  it('is named and asks as its page tells it', async () => {
    await render('Limpiar horarios', '¿Borrar?');

    expect(buttons()).toEqual(['Limpiar horarios']);
    expect(trash()?.title).toBe('Limpiar horarios');
    await click(trash());
    expect(host().querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('¿Borrar?');
    expect(host().querySelector('.question')?.textContent.trim()).toBe('¿Borrar?');
  });

  it('keeps its two answers together, so that where there is no room they go under the question', async () => {
    await render();
    await click(trash());

    const answers = host().querySelector('.answers');
    expect(answers?.contains(answer('Sí'))).toBe(true);
    expect(answers?.contains(answer('No'))).toBe(true);
    expect(answers?.contains(host().querySelector('.question'))).toBe(false);
  });

  it('clears with "Sí", once, and the trash is back, with the focus', async () => {
    await render();
    await click(trash());

    await click(answer('Sí'));

    expect(confirmed).toBe(1);
    expect(buttons()).toEqual(['Limpiar selección']);
    expect(host().classList.contains('asking')).toBe(false);
    expect(document.activeElement).toBe(trash());
  });

  describe('with words', () => {
    function wordsButton(): HTMLButtonElement | null {
      return host().querySelector<HTMLButtonElement>('button.words');
    }

    it('shows them, and is named for screen readers by its label', async () => {
      await render('Desconectar Claude', '¿Desconectar?', 'Desconectar');

      expect(trash()).toBeNull();
      expect(wordsButton()?.textContent.trim()).toBe('Desconectar');
      expect(wordsButton()?.getAttribute('aria-label')).toBe('Desconectar Claude');
      expect(wordsButton()?.type).toBe('button');
      // Its words say what it does: nothing to show to the mouse resting on it.
      expect(wordsButton()?.hasAttribute('title')).toBe(false);
      expect(wordsButton()?.querySelector('svg')).toBeNull();
    });

    it('asks in its place, and gives the focus back to it with "Sí" and with "No"', async () => {
      await render('Desconectar Claude', '¿Desconectar?', 'Desconectar');

      await click(wordsButton());
      expect(buttons()).toEqual(['Sí', 'No']);
      expect(host().querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
        '¿Desconectar?',
      );
      await click(answer('No'));
      expect(confirmed).toBe(0);
      expect(document.activeElement).toBe(wordsButton());

      await click(wordsButton());
      await click(answer('Sí'));
      expect(confirmed).toBe(1);
      expect(document.activeElement).toBe(wordsButton());
    });
  });

  it('clears nothing with "No": the trash is back, with the focus', async () => {
    await render();
    await click(trash());

    await click(answer('No'));

    expect(confirmed).toBe(0);
    expect(buttons()).toEqual(['Limpiar selección']);
    expect(document.activeElement).toBe(trash());
  });

  it('takes the question away with Escape, as with "No"', async () => {
    await render();
    await click(trash());

    await escape();

    expect(confirmed).toBe(0);
    expect(buttons()).toEqual(['Limpiar selección']);
    expect(document.activeElement).toBe(trash());
  });

  it('leaves the focus where it is on an Escape with no question', async () => {
    await render();
    const other = elsewhere();
    other.focus();

    await escape();

    expect(document.activeElement).toBe(other);
    expect(buttons()).toEqual(['Limpiar selección']);
  });

  it('takes the question away on a press anywhere else, which keeps the focus it took', async () => {
    await render();
    await click(trash());
    const other = elsewhere();
    other.focus();

    await click(other);

    expect(confirmed).toBe(0);
    expect(buttons()).toEqual(['Limpiar selección']);
    expect(document.activeElement).toBe(other);
  });

  it('keeps the question on a press on its own text', async () => {
    await render();
    await click(trash());

    await click(host().querySelector<HTMLElement>('.question'));

    expect(buttons()).toEqual(['Sí', 'No']);
  });

  it('is styled only with tokens', () => {
    expect(literalValues(styles)).toEqual([]);
  });
});
