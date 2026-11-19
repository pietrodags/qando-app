import { Component, signal, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import {
  type TestRecognizer,
  type TestRecognizers,
  installTestRecognizer,
  removeTestRecognizer,
} from '../../../test/recognizer';
import { Dictation } from './dictation';
import micStyles from './dictation.scss' with { loader: 'text' };

/** A page that holds a text and shows the microphone beside it. */
@Component({
  imports: [Dictation],
  template: `
    @if (shown()) {
      <app-dictation [(text)]="text" [max]="max()" (denied)="denials.push('denied')" />
    }
  `,
})
class Page {
  readonly shown = signal(true);
  readonly text = signal('');
  readonly max = signal(120);
  readonly denials: string[] = [];
  readonly mic = viewChild(Dictation);
}

describe('Dictation', () => {
  let fixture: ComponentFixture<Page>;
  let recognizers: TestRecognizers;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Page], providers: [provideI18n()] });
    recognizers = installTestRecognizer();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeTestRecognizer();
  });

  /** The microphone on a page that holds `text`. */
  async function render(text = ''): Promise<void> {
    fixture = TestBed.createComponent(Page);
    page().text.set(text);
    await fixture.whenStable();
  }

  function page(): Page {
    return fixture.componentInstance;
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function mic(): HTMLButtonElement {
    const found = host().querySelector('button');
    if (!found) throw new Error('No microphone');
    return found;
  }

  /** The recognizer the page made last. */
  function recognizer(): TestRecognizer {
    const last = recognizers.at(-1);
    if (!last) throw new Error('No recognizer');
    return last;
  }

  /** The microphone pressed: the recognizer it started, or the one it stopped. */
  async function press(): Promise<TestRecognizer> {
    mic().click();
    await fixture.whenStable();
    return recognizer();
  }

  function bars(): Element[] {
    return [...host().querySelectorAll('.bars > span')];
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(micStyles)).toEqual([]);
  });

  describe('where the browser offers no dictation', () => {
    it('shows nothing', async () => {
      removeTestRecognizer();

      await render();

      expect(host().querySelector('app-dictation')?.childElementCount).toBe(0);
    });
  });

  describe('at rest', () => {
    it('is a button named for what it does, for screen readers and for the mouse', async () => {
      await render();

      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(mic().title).toBe('Dictar con micrófono');
      expect(mic().type).toBe('button');
    });

    it('shows a microphone, which screen readers pass over, and no bars', async () => {
      await render();

      expect(mic().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(bars()).toEqual([]);
      expect(mic().classList.contains('listening')).toBe(false);
    });

    it('listens to nothing', async () => {
      await render();

      expect(recognizers).toEqual([]);
    });

    it('has nothing to stop', async () => {
      await render('Cena');

      page().mic()?.stop();
      await fixture.whenStable();

      expect(page().text()).toBe('Cena');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
    });
  });

  describe('once pressed', () => {
    it('has the browser listen to one utterance in Spanish, told word by word', async () => {
      await render();

      const listening = await press();

      expect(recognizers).toHaveLength(1);
      expect(listening.state).toBe('started');
      expect(listening.lang).toBe('es-ES');
      expect(listening.interimResults).toBe(true);
      expect(listening.continuous).toBe(false);
    });

    it('is named for stopping', async () => {
      await render();

      await press();

      expect(mic().getAttribute('aria-label')).toBe('Detener dictado');
      expect(mic().title).toBe('Detener dictado');
    });

    it('shows five bars in place of the microphone, which screen readers pass over', async () => {
      await render();

      await press();

      expect(bars()).toHaveLength(5);
      expect(host().querySelector('.bars')?.getAttribute('aria-hidden')).toBe('true');
      expect(mic().querySelector('svg')).toBeNull();
      expect(mic().classList.contains('listening')).toBe(true);
    });

    it('uses the recognizer under its prefixed name where the browser has it so', async () => {
      removeTestRecognizer();
      const prefixed = installTestRecognizer('webkitSpeechRecognition');
      await render();

      mic().click();

      expect(prefixed).toHaveLength(1);
      expect(prefixed[0]?.state).toBe('started');
    });

    it('takes the standard recognizer where the browser has both', async () => {
      const prefixed = installTestRecognizer('webkitSpeechRecognition');
      await render();

      await press();

      expect(recognizers).toHaveLength(1);
      expect(prefixed).toEqual([]);
    });
  });

  describe('the words heard', () => {
    it('are written as they come, each time in place of those heard before', async () => {
      await render();
      const listening = await press();

      listening.hears('quedamos el');
      expect(page().text()).toBe('quedamos el');

      listening.hears('quedamos el viernes');
      expect(page().text()).toBe('quedamos el viernes');

      listening.hears('quedamos el viernes por la tarde');
      expect(page().text()).toBe('quedamos el viernes por la tarde');
    });

    it('go after the text there was, a space between', async () => {
      await render('Cena');
      const listening = await press();

      listening.hears('quedamos el');
      expect(page().text()).toBe('Cena quedamos el');

      listening.hears('quedamos el viernes');
      expect(page().text()).toBe('Cena quedamos el viernes');
    });

    it('go after one space when the text there was ended with blanks', async () => {
      await render('  Cena \n ');
      const listening = await press();

      listening.hears('el viernes');

      expect(page().text()).toBe('  Cena el viernes');
    });

    it('are the text when there were only blanks', async () => {
      await render('   ');
      const listening = await press();

      listening.hears('el viernes');

      expect(page().text()).toBe('el viernes');
    });

    it('are joined as the browser gives them, in several pieces', async () => {
      await render('Cena');
      const listening = await press();

      listening.hears(' quedamos el', ' viernes ');

      expect(page().text()).toBe('Cena quedamos el viernes');
    });

    it('leave the text there was while nothing is made out yet', async () => {
      await render('Cena');
      const listening = await press();

      listening.hears('');
      expect(page().text()).toBe('Cena');

      listening.hears();
      expect(page().text()).toBe('Cena');
    });

    it('are cut where the text is full', async () => {
      await render('Cena');
      page().max.set(12);
      await fixture.whenStable();
      const listening = await press();

      listening.hears('quedamos el viernes');

      expect(page().text()).toBe('Cena quedamo');
    });

    it('go after the text as it was when the microphone was pressed, not as it is now', async () => {
      await render('Cena');
      const listening = await press();
      listening.hears('quedamos');

      page().text.set('Otra cosa');
      listening.hears('quedamos el viernes');

      expect(page().text()).toBe('Cena quedamos el viernes');
    });
  });

  describe('while words come', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    function hearing(): boolean {
      fixture.detectChanges();
      return mic().classList.contains('hearing');
    }

    async function listen(): Promise<TestRecognizer> {
      fixture = TestBed.createComponent(Page);
      fixture.detectChanges();
      mic().click();
      await Promise.resolve();
      return recognizer();
    }

    it('its bars move more, and less again 600 ms after the last word', async () => {
      const listening = await listen();
      expect(hearing()).toBe(false);

      listening.hears('quedamos');
      expect(hearing()).toBe(true);

      vi.advanceTimersByTime(599);
      expect(hearing()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(hearing()).toBe(false);
      expect(mic().classList.contains('listening')).toBe(true);
    });

    it('each word heard starts the 600 ms again', async () => {
      const listening = await listen();
      listening.hears('quedamos');

      vi.advanceTimersByTime(400);
      listening.hears('quedamos el');
      vi.advanceTimersByTime(599);
      expect(hearing()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(hearing()).toBe(false);
    });

    it('its bars stop moving more as soon as it stops', async () => {
      const listening = await listen();
      listening.hears('quedamos');

      listening.ends();

      expect(hearing()).toBe(false);
    });

    it('the bars of the next dictation move little until its first word, and then their own 600 ms', async () => {
      const first = await listen();
      first.hears('quedamos');
      mic().click();
      mic().click();
      expect(recognizers).toHaveLength(2);
      expect(hearing()).toBe(false);

      vi.advanceTimersByTime(300);
      recognizer().hears('el viernes');
      // The 600 ms of the first dictation would end here.
      vi.advanceTimersByTime(400);

      expect(hearing()).toBe(true);
    });
  });

  describe('when the utterance ends', () => {
    it('is at rest again, with what was heard left in the text', async () => {
      await render('Cena');
      const listening = await press();
      listening.hears('el viernes');

      listening.ends();
      await fixture.whenStable();

      expect(page().text()).toBe('Cena el viernes');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(mic().title).toBe('Dictar con micrófono');
      expect(mic().querySelector('svg')).not.toBeNull();
      expect(bars()).toEqual([]);
      expect(mic().classList.contains('listening')).toBe(false);
    });

    it('listens again, with a new recognizer, when pressed again', async () => {
      await render();
      const first = await press();
      first.hears('el viernes');
      first.ends();

      const second = await press();
      second.hears('por la tarde');

      expect(second).not.toBe(first);
      expect(second.state).toBe('started');
      expect(page().text()).toBe('el viernes por la tarde');
    });
  });

  describe('pressed again while it listens', () => {
    it('stops: the browser is told to let go and the microphone is at rest', async () => {
      await render();
      const listening = await press();

      await press();

      expect(recognizers).toHaveLength(1);
      expect(listening.state).toBe('aborted');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(bars()).toEqual([]);
    });

    it('keeps what was heard and writes nothing that comes later', async () => {
      await render('Cena');
      const listening = await press();
      listening.hears('el viernes');

      await press();
      listening.hears('el viernes por la tarde');
      listening.fails('not-allowed');
      listening.ends();
      await fixture.whenStable();

      expect(page().text()).toBe('Cena el viernes');
      expect(page().denials).toEqual([]);
    });
  });

  describe('stopped by the page', () => {
    it('is at rest, with what was heard left in the text', async () => {
      await render();
      const listening = await press();
      listening.hears('el viernes');

      page().mic()?.stop();
      await fixture.whenStable();

      expect(listening.state).toBe('aborted');
      expect(page().text()).toBe('el viernes');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
    });
  });

  describe('when the browser refuses the microphone', () => {
    it.each(['not-allowed', 'service-not-allowed'])('says so and is at rest (%s)', async (why) => {
      await render('Cena');
      const listening = await press();

      listening.fails(why);
      await fixture.whenStable();

      expect(page().denials).toEqual(['denied']);
      expect(listening.state).toBe('aborted');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(page().text()).toBe('Cena');
    });
  });

  describe('when the browser gives up for another reason', () => {
    it.each(['no-speech', 'aborted', 'network', 'audio-capture'])(
      'is at rest and says nothing (%s)',
      async (why) => {
        await render();
        const listening = await press();
        listening.hears('el viernes');

        listening.fails(why);
        await fixture.whenStable();

        expect(page().denials).toEqual([]);
        expect(listening.state).toBe('aborted');
        expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
        expect(page().text()).toBe('el viernes');
      },
    );
  });

  describe('a browser that never answers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    function atRest(): boolean {
      fixture.detectChanges();
      return mic().getAttribute('aria-label') === 'Dictar con micrófono';
    }

    async function listen(): Promise<TestRecognizer> {
      fixture = TestBed.createComponent(Page);
      fixture.detectChanges();
      mic().click();
      await Promise.resolve();
      return recognizer();
    }

    it('is waited for 10 seconds, and then the microphone stops by itself', async () => {
      const listening = await listen();

      vi.advanceTimersByTime(9_999);
      expect(atRest()).toBe(false);
      expect(listening.state).toBe('started');

      vi.advanceTimersByTime(1);
      expect(atRest()).toBe(true);
      expect(listening.state).toBe('aborted');
      expect(page().denials).toEqual([]);
    });

    it('is not stopped once it listens, however long nothing is said', async () => {
      const listening = await listen();

      vi.advanceTimersByTime(9_999);
      listening.listens();
      vi.advanceTimersByTime(60_000);

      expect(atRest()).toBe(false);
      expect(listening.state).toBe('started');
    });

    it('is not stopped once words are heard', async () => {
      const listening = await listen();

      listening.hears('el viernes');
      vi.advanceTimersByTime(60_000);

      expect(atRest()).toBe(false);
      expect(listening.state).toBe('started');
    });

    it('is no longer waited for once the microphone is stopped by hand', async () => {
      const first = await listen();
      vi.advanceTimersByTime(6_000);
      mic().click();
      mic().click();
      const second = recognizer();

      vi.advanceTimersByTime(9_999);

      expect(second).not.toBe(first);
      expect(atRest()).toBe(false);
      expect(second.state).toBe('started');
    });
  });

  describe('when it goes from the page while it listens', () => {
    it('tells the browser to let go, and writes nothing that comes later', async () => {
      await render('Cena');
      const listening = await press();

      page().shown.set(false);
      await fixture.whenStable();
      listening.hears('el viernes');
      listening.fails('not-allowed');

      expect(listening.state).toBe('aborted');
      expect(page().text()).toBe('Cena');
      expect(page().denials).toEqual([]);
    });
  });
});
