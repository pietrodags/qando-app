import { TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Toast, Toaster } from './toast';
import toastStyles from './toast.scss' with { loader: 'text' };

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [Toast] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(Toast);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function shown(element: HTMLElement): string | undefined {
    TestBed.tick();
    return element.querySelector('.toast')?.textContent.trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(toastStyles)).toEqual([]);
  });

  it('shows nothing until a page says something', () => {
    const element = render();

    expect(shown(element)).toBeUndefined();
    expect(element.querySelector('[role="status"]')).not.toBeNull();
  });

  it('announces the message for two seconds', () => {
    const element = render();

    TestBed.inject(Toaster).show('Enlace copiado');
    expect(shown(element)).toBe('Enlace copiado');

    vi.advanceTimersByTime(1999);
    expect(shown(element)).toBe('Enlace copiado');
    vi.advanceTimersByTime(1);
    expect(shown(element)).toBeUndefined();
  });

  it('shows a new message for two seconds of its own', () => {
    const element = render();
    const toaster = TestBed.inject(Toaster);

    toaster.show('Enlace copiado');
    vi.advanceTimersByTime(1500);
    toaster.show('Usa los botones de abajo para compartir');
    vi.advanceTimersByTime(1500);

    expect(shown(element)).toBe('Usa los botones de abajo para compartir');
    vi.advanceTimersByTime(500);
    expect(shown(element)).toBeUndefined();
  });

  describe('a message with something to do about it', () => {
    const REPLACED = 'Hemos sustituido las 3 fechas que tenías marcadas.';
    let element: HTMLElement;
    let toaster: Toaster;
    let undone: number;

    beforeEach(() => {
      element = render();
      toaster = TestBed.inject(Toaster);
      undone = 0;
    });

    function offer(): () => void {
      return toaster.offer(REPLACED, { label: 'Deshacer', run: () => (undone += 1) });
    }

    /** The words of the message on screen, apart from its button. */
    function words(): string | undefined {
      TestBed.tick();
      return element.querySelector('.toast .words')?.textContent.trim();
    }

    function action(): HTMLButtonElement | null {
      TestBed.tick();
      return element.querySelector<HTMLButtonElement>('.toast button');
    }

    /** The message on screen. */
    function toast(): HTMLElement {
      TestBed.tick();
      const found = element.querySelector<HTMLElement>('.toast');
      if (!found) throw new Error('No message on screen');
      return found;
    }

    it('says it with a button, in the place screen readers hear', () => {
      offer();

      expect(words()).toBe(REPLACED);
      expect(action()?.textContent.trim()).toBe('Deshacer');
      expect(action()?.type).toBe('button');
      expect(action()?.closest('[role="status"]')).not.toBeNull();
    });

    it('has no button for a message that only says', () => {
      toaster.show('Enlace copiado');

      expect(words()).toBe('Enlace copiado');
      expect(action()).toBeNull();
    });

    it('stays eight seconds', () => {
      offer();

      vi.advanceTimersByTime(7999);
      expect(words()).toBe(REPLACED);
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
      expect(undone).toBe(0);
    });

    it('does it once when the button is pressed, and goes', () => {
      offer();

      action()?.click();

      expect(undone).toBe(1);
      expect(words()).toBeUndefined();
    });

    it('is gone before what it does is done, so that a message said meanwhile stays', () => {
      toaster.offer(REPLACED, {
        label: 'Deshacer',
        run: () => {
          toaster.show('Enlace copiado');
        },
      });

      action()?.click();

      expect(words()).toBe('Enlace copiado');
    });

    it('goes early when who offered it takes it away', () => {
      const withdraw = offer();

      withdraw();

      expect(words()).toBeUndefined();
      expect(undone).toBe(0);
    });

    it('leaves the message that took its place when it is taken away late', () => {
      const withdraw = offer();
      toaster.show('Enlace copiado');

      withdraw();
      expect(words()).toBe('Enlace copiado');

      // The message in its place keeps its own two seconds.
      vi.advanceTimersByTime(1999);
      expect(words()).toBe('Enlace copiado');
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('gives way to the next message, which stays its own time', () => {
      offer();
      vi.advanceTimersByTime(7000);

      toaster.show('Enlace copiado');
      vi.advanceTimersByTime(1999);
      expect(words()).toBe('Enlace copiado');
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('stays while the mouse is over it, and its whole time again once it leaves', () => {
      offer();
      vi.advanceTimersByTime(7000);

      toast().dispatchEvent(new Event('pointerenter'));
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe(REPLACED);

      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(7999);
      expect(words()).toBe(REPLACED);
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('stays while its button has the focus, and its whole time again once it loses it', () => {
      offer();
      vi.advanceTimersByTime(7000);

      action()?.focus();
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe(REPLACED);

      action()?.blur();
      vi.advanceTimersByTime(7999);
      expect(words()).toBe(REPLACED);
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('stays while either the mouse or the focus is on it', () => {
      offer();

      toast().dispatchEvent(new Event('pointerenter'));
      action()?.focus();
      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe(REPLACED);

      toast().dispatchEvent(new Event('pointerenter'));
      action()?.blur();
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe(REPLACED);

      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(8000);
      expect(words()).toBeUndefined();
    });

    it('does not wait for a mouse that was over the message before it', () => {
      offer();
      toast().dispatchEvent(new Event('pointerenter'));
      action()?.focus();

      // Taken away under the mouse, which tells nothing of leaving what is gone.
      action()?.click();
      offer();
      vi.advanceTimersByTime(8000);
      expect(words()).toBeUndefined();

      // Nor is the next one held by the focus alone once the mouse has come and gone.
      offer();
      toast().dispatchEvent(new Event('pointerenter'));
      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(8000);
      expect(words()).toBeUndefined();
    });

    it('keeps the mouse over it when another message takes its place under the mouse', () => {
      offer();
      toast().dispatchEvent(new Event('pointerenter'));

      // In the same place on screen: the mouse tells nothing of coming over it.
      toaster.offer('Hemos sustituido la fecha que tenías marcada.', {
        label: 'Deshacer',
        run: () => undefined,
      });
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe('Hemos sustituido la fecha que tenías marcada.');

      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(7999);
      expect(words()).toBe('Hemos sustituido la fecha que tenías marcada.');
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('keeps the focus on its button when another message with a button takes its place', () => {
      offer();
      const button = action();
      button?.focus();

      offer();
      expect(action()).toBe(button);
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe(REPLACED);

      action()?.blur();
      vi.advanceTimersByTime(8000);
      expect(words()).toBeUndefined();
    });

    it('does not keep for the focus a message without a button that takes its place', () => {
      offer();
      action()?.focus();

      // The button goes with the focus on it, which tells nothing of leaving.
      toaster.show('Enlace copiado');
      expect(action()).toBeNull();
      vi.advanceTimersByTime(1999);
      expect(words()).toBe('Enlace copiado');
      vi.advanceTimersByTime(1);
      expect(words()).toBeUndefined();
    });

    it('keeps a message that only says while the mouse is over it too', () => {
      toaster.show('Enlace copiado');

      toast().dispatchEvent(new Event('pointerenter'));
      vi.advanceTimersByTime(60_000);
      expect(words()).toBe('Enlace copiado');

      toast().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(2000);
      expect(words()).toBeUndefined();
    });
  });
});
