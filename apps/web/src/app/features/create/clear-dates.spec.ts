import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ClearDates } from './clear-dates';
import clearStyles from './clear-dates.scss' with { loader: 'text' };

describe('ClearDates', () => {
  let fixture: ComponentFixture<ClearDates>;
  let cleared: number;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ClearDates], providers: [provideI18n()] });
  });

  afterEach(() => {
    document.querySelector('.elsewhere')?.remove();
  });

  async function render(touch = false): Promise<void> {
    fixture = TestBed.createComponent(ClearDates);
    // A computer with a mouse unless the page says otherwise.
    if (touch) fixture.componentRef.setInput('touch', true);
    cleared = 0;
    fixture.componentInstance.cleared.subscribe(() => cleared++);
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

  it('clears with one press of a mouse, without a question', async () => {
    await render();

    await click(trash());

    expect(cleared).toBe(1);
    expect(buttons()).toEqual(['Limpiar selección']);
    expect(host().classList.contains('asking')).toBe(false);
  });

  describe('without a mouse', () => {
    it('asks in the trash’s place before it clears, "No" taking the focus', async () => {
      await render(true);

      await click(trash());

      expect(cleared).toBe(0);
      expect(buttons()).toEqual(['Sí', 'No']);
      expect(host().classList.contains('asking')).toBe(true);
      expect(document.activeElement).toBe(answer('No'));
      // The two answers are heard with their question.
      const group = host().querySelector('[role="group"]');
      const question = group?.getAttribute('aria-labelledby');
      expect(question && document.getElementById(question)?.textContent.trim()).toBe(
        '¿Borrar todo?',
      );
      expect(group?.contains(answer('Sí'))).toBe(true);
      expect(group?.contains(answer('No'))).toBe(true);
    });

    it('clears with "Sí", once, and the trash is back', async () => {
      await render(true);
      await click(trash());

      await click(answer('Sí'));

      expect(cleared).toBe(1);
      expect(buttons()).toEqual(['Limpiar selección']);
      expect(host().classList.contains('asking')).toBe(false);
    });

    it('clears nothing with "No": the trash is back, with the focus', async () => {
      await render(true);
      await click(trash());

      await click(answer('No'));

      expect(cleared).toBe(0);
      expect(buttons()).toEqual(['Limpiar selección']);
      expect(document.activeElement).toBe(trash());
    });

    it('takes the question away with Escape, as with "No"', async () => {
      await render(true);
      await click(trash());

      await escape();

      expect(cleared).toBe(0);
      expect(buttons()).toEqual(['Limpiar selección']);
      expect(document.activeElement).toBe(trash());
    });

    it('leaves the focus where it is on an Escape with no question', async () => {
      await render(true);
      const other = elsewhere();
      other.focus();

      await escape();

      expect(document.activeElement).toBe(other);
      expect(buttons()).toEqual(['Limpiar selección']);
    });

    it('takes the question away on a press anywhere else, which keeps the focus it took', async () => {
      await render(true);
      await click(trash());
      const other = elsewhere();
      other.focus();

      await click(other);

      expect(cleared).toBe(0);
      expect(buttons()).toEqual(['Limpiar selección']);
      expect(document.activeElement).toBe(other);
    });

    it('keeps the question on a press on its own text', async () => {
      await render(true);
      await click(trash());

      await click(host().querySelector<HTMLElement>('.question'));

      expect(buttons()).toEqual(['Sí', 'No']);
    });
  });

  it('is styled only with tokens', () => {
    expect(literalValues(clearStyles)).toEqual([]);
  });
});
