import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ManagedEvent, Option } from '@qando/contracts';
import type { RequestFailure } from '../../core/api/request-failure';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { literalValues } from '../../../styles/token-usage';
import { FinalDate, type FinalDateNotice } from './final-date';
import finalDateStyles from './final-date.scss' with { loader: 'text' };

function day(date: string, n: number, time: Option['time'] = null): Option {
  return {
    id: `6f1c2a0e-0000-4000-8000-00000000000${String(n)}`,
    dates: { kind: 'single', date },
    time,
  };
}

const july6 = day('2026-07-06', 1);
const july10 = day('2026-07-10', 2);
const july11 = day('2026-07-11', 3);

/** After the deadline, 2 votes, July 10 recommended: confirming it asks nothing. */
const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'closed',
  options: [july6, july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  emails: [],
};

describe('FinalDate', () => {
  let fixture: ComponentFixture<FinalDate>;
  let confirmed: string[];

  // jsdom has no modal dialogs: these stand for the browser's, closing with a `close` event.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({
      imports: [FinalDate],
      providers: [provideI18n(), provideRouter([])],
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  async function render(
    event: ManagedEvent,
    {
      sending = false,
      failure = null,
    }: { sending?: boolean; failure?: RequestFailure | null } = {},
  ): Promise<ComponentFixture<FinalDate>> {
    fixture = TestBed.createComponent(FinalDate);
    confirmed = [];
    fixture.componentInstance.confirm.subscribe((optionId) => confirmed.push(optionId));
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('sending', sending);
    fixture.componentRef.setInput('failure', failure);
    await fixture.whenStable();
    return fixture;
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null | undefined): string | undefined {
    return node?.textContent.replace(/\s+/g, ' ').trim();
  }

  function radios(): HTMLInputElement[] {
    return [...element().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  function choices(): (string | undefined)[] {
    return [...element().querySelectorAll('.option .label')].map((label) => text(label));
  }

  function confirmButton(): HTMLButtonElement {
    return element().querySelector<HTMLButtonElement>('button.confirm')!;
  }

  function dialog(): HTMLDialogElement | null {
    return element().querySelector('dialog');
  }

  async function choose(index: number): Promise<void> {
    radios()[index]!.click();
    await fixture.whenStable();
  }

  async function pressConfirm(): Promise<void> {
    confirmButton().click();
    await fixture.whenStable();
  }

  async function answerDialog(name: string): Promise<void> {
    [...dialog()!.querySelectorAll('button')].find((button) => text(button) === name)!.click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(finalDateStyles)).toEqual([]);
  });

  it("sinks the confirmed date's green card without the white light of a well's edges", () => {
    const shadow = /\.confirmed\s*\{[^}]*?box-shadow:\s*([^;]+);/.exec(finalDateStyles)?.[1];

    expect(shadow).toBe('var(--q-shadow-well-cast)');
  });

  it("writes the confirmed date's time zone in the quiet text that reads on its green card", () => {
    const zone = /\.confirmed\s*\{[\s\S]*?\.zone\s*\{[^}]*?color:\s*([^;]+);/.exec(
      finalDateStyles,
    )?.[1];

    expect(zone).toBe('var(--q-on-success-subtle)');
  });

  it('lists the options in order, the recommended one marked and already chosen', async () => {
    await render(cena);

    expect(text(element().querySelector('h2'))).toBe('Elige la fecha final');
    expect(choices()).toEqual(['lunes 6 de julio', 'viernes 10 de julio']);
    const badges = [...element().querySelectorAll('.option')].map((option) =>
      text(option.querySelector('.badge')),
    );
    expect(badges).toEqual([undefined, 'Más votada']);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
    expect(confirmButton().disabled).toBe(false);
  });

  it.each([
    ['a tie', { recommendedOptionIds: [july6.id, july10.id] }],
    ['no votes', { voters: 0, recommendedOptionIds: [] }],
  ])('chooses nothing with %s: confirming waits for a choice', async (_name, facts) => {
    await render({ ...cena, ...facts });

    expect(radios().map((radio) => radio.checked)).toEqual([false, false]);
    expect(confirmButton().disabled).toBe(true);

    await choose(0);

    expect(confirmButton().disabled).toBe(false);
  });

  it('marks the chosen option, and the mark follows the choice', async () => {
    await render(cena);
    const marked = (): (string | undefined)[] =>
      [...element().querySelectorAll('.option.chosen .label')].map((label) => text(label));

    expect(marked()).toEqual(['viernes 10 de julio']);

    await choose(0);

    expect(marked()).toEqual(['lunes 6 de julio']);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
  });

  it('keeps the options one group, so the arrow keys move between them', async () => {
    await render({ ...cena, options: [july6, july10, july11] });

    const names = new Set(radios().map((radio) => radio.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');
  });

  it('confirms the recommended option at once after the deadline', async () => {
    await render(cena);

    await pressConfirm();

    expect(dialog()).toBeNull();
    expect(confirmed).toEqual([july10.id]);
  });

  it('asks first while voting is open, saying voting will close', async () => {
    await render({ ...cena, state: 'open' });

    await pressConfirm();

    expect(confirmed).toEqual([]);
    expect(dialog()?.getAttribute('aria-label')).toBe('¿Confirmar el viernes 10 de julio?');
    expect(text(dialog()?.querySelector('h2'))).toBe('¿Confirmar el viernes 10 de julio?');
    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'Al confirmar, la votación se cerrará: quien aún no haya votado ya no podrá hacerlo.',
    ]);
    expect(text(dialog()?.querySelector('.final'))).toBe(
      'La confirmación es definitiva: después no podrás elegir otra fecha.',
    );

    await answerDialog('Confirmar');

    expect(confirmed).toEqual([july10.id]);
    expect(dialog()).toBeNull();
  });

  it('confirms nothing when the organizer goes back', async () => {
    await render({ ...cena, state: 'open' });
    await pressConfirm();

    await answerDialog('Volver');

    expect(confirmed).toEqual([]);
    expect(dialog()).toBeNull();
  });

  it('asks again at once after the organizer went back, before the page settled', async () => {
    await render({ ...cena, state: 'open' });
    await pressConfirm();

    // Escape closes the dialog at once, but the browser fires its `close` event in a later task:
    // Enter on the button comes in between.
    const closing = dialog()!;
    closing.removeAttribute('open');
    confirmButton().click();
    closing.dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(dialog()?.hasAttribute('open')).toBe(true);
  });

  it('asks first for an option that is not the recommended one, naming the recommended', async () => {
    await render(cena);
    await choose(0);

    await pressConfirm();

    expect(text(dialog()?.querySelector('h2'))).toBe('¿Confirmar el lunes 6 de julio?');
    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'No es la fecha más votada. La más votada es el viernes 10 de julio.',
    ]);

    await answerDialog('Confirmar');

    expect(confirmed).toEqual([july6.id]);
  });

  it('names every recommended option of a tie', async () => {
    await render({
      ...cena,
      options: [july6, july10, july11],
      recommendedOptionIds: [july10.id, july11.id],
    });
    await choose(0);

    await pressConfirm();

    expect(text(dialog()?.querySelector('.note'))).toBe(
      'No es la fecha más votada. Las más votadas son el viernes 10 de julio y el sábado 11 de julio.',
    );
  });

  it('confirms an option of a tie at once after the deadline', async () => {
    await render({ ...cena, recommendedOptionIds: [july6.id, july10.id] });
    await choose(0);

    await pressConfirm();

    expect(dialog()).toBeNull();
    expect(confirmed).toEqual([july6.id]);
  });

  it('asks first when nobody voted, saying so', async () => {
    await render({ ...cena, state: 'open', voters: 0, recommendedOptionIds: [] });
    await choose(1);

    await pressConfirm();

    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'Nadie ha votado todavía.',
      'Al confirmar, la votación se cerrará: nadie podrá votar.',
    ]);
  });

  it('asks first when nobody voted, also after the deadline', async () => {
    await render({ ...cena, voters: 0, recommendedOptionIds: [] });
    await choose(1);

    await pressConfirm();

    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'Nadie ha votado todavía.',
    ]);
  });

  it('asks first when votes are in but nobody can attend any option', async () => {
    await render({ ...cena, recommendedOptionIds: [] });
    await choose(1);

    await pressConfirm();

    expect(confirmed).toEqual([]);
    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'Nadie puede asistir en ninguna de las fechas propuestas.',
    ]);
  });

  it('names a range of days without the article', async () => {
    const week: Option = {
      id: '6f1c2a0e-0000-4000-8000-000000000009',
      dates: { kind: 'range', start: '2026-07-06', end: '2026-07-10' },
      time: null,
    };
    await render({ ...cena, state: 'open', options: [week], recommendedOptionIds: [week.id] });

    await pressConfirm();

    expect(text(dialog()?.querySelector('h2'))).toBe(
      '¿Confirmar del lunes 6 al viernes 10 de julio?',
    );
  });

  it('says it is confirming while the confirmation is on its way, and takes no other', async () => {
    await render(cena, { sending: true });

    expect(text(confirmButton())).toBe('Confirmando…');
    expect(confirmButton().disabled).toBe(true);
    expect(radios().every((radio) => radio.disabled)).toBe(true);
  });

  it('says when the confirmation did not get through', async () => {
    await render(cena, { failure: { kind: 'failed' } });

    expect(text(element().querySelector('.outcome[role="status"]'))).toBe(
      'No se ha podido confirmar la fecha. Inténtalo de nuevo.',
    );
    expect(confirmButton().disabled).toBe(false);
  });

  it('holds the confirmation while the API limits the requests, saying for how long', async () => {
    await render(cena, { failure: { kind: 'limited', seconds: 30 } });

    // Said above the button, which counts the seconds down, held (not greyed out like a button
    // waiting for a choice).
    expect(element().querySelector('.wait + .actions > button.confirm')).toBe(confirmButton());
    expect(text(element().querySelector('.wait [role="alert"]'))).toBe(
      'Hay demasiadas visitas desde tu red en este momento.',
    );
    expect(text(confirmButton())).toBe('Confirmar fecha en 30 s');
    expect(text(element().querySelector('.outcome[role="status"]'))).toBe('');
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().classList).toContain('waiting');
  });

  it('confirms again, and says nothing more, once the rate limit is over', async () => {
    await render(cena, { failure: { kind: 'limited', seconds: 0 } });

    expect(element().querySelector('.wait')).toBeNull();
    expect(text(confirmButton())).toBe('Confirmar fecha');
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().classList).not.toContain('waiting');
  });

  describe('when the event is read again', () => {
    function checked(): boolean[] {
      return radios().map((radio) => radio.checked);
    }

    async function readAgain(event: ManagedEvent): Promise<void> {
      fixture.componentRef.setInput('event', event);
      await fixture.whenStable();
    }

    it('keeps the option the organizer chose', async () => {
      await render(cena);
      await choose(0);

      await readAgain({ ...cena, voters: 3 });

      expect(checked()).toEqual([true, false]);
      await pressConfirm();
      // Not the recommended option: still asked before confirming.
      expect(dialog()?.open).toBe(true);
    });

    it('keeps a choice made by hand also when it matches the new recommendation', async () => {
      await render({ ...cena, recommendedOptionIds: [july10.id, july6.id] });
      await choose(0);

      await readAgain({ ...cena, recommendedOptionIds: [july6.id] });

      expect(checked()).toEqual([true, false]);
    });

    it('keeps a choice made by hand through reads that recommend it and then others', async () => {
      const tie = { ...cena, recommendedOptionIds: [july6.id, july10.id] };
      await render(tie);
      await choose(0);

      await readAgain({ ...cena, recommendedOptionIds: [july6.id] });
      await readAgain(tie);
      expect(checked()).toEqual([true, false]);
      await readAgain(cena);
      expect(checked()).toEqual([true, false]);
    });

    it('moves an untouched choice to the option now recommended', async () => {
      await render(cena);

      await readAgain({ ...cena, recommendedOptionIds: [july6.id] });

      expect(checked()).toEqual([true, false]);
    });

    it('starts again when the chosen option is no longer the event’s', async () => {
      await render({ ...cena, options: [july6, july10, july11] });
      await choose(2);

      await readAgain(cena);

      expect(checked()).toEqual([false, true]);
    });
  });

  it('starts neither sending nor failed when the page says nothing', async () => {
    fixture = TestBed.createComponent(FinalDate);
    fixture.componentRef.setInput('event', cena);
    await fixture.whenStable();

    expect(text(confirmButton())).toBe('Confirmar fecha');
    expect(confirmButton().disabled).toBe(false);
    expect(text(element().querySelector('.outcome[role="status"]'))).toBe('');
  });

  it('says nothing while nothing failed', async () => {
    await render(cena);

    expect(text(element().querySelector('.outcome[role="status"]'))).toBe('');
  });

  it('names the event’s time zone under times when the browser is in another', async () => {
    const zone = 'Pacific/Chatham';
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(zone);
    const atNine = day('2026-07-10', 4, { kind: 'single', at: '09:30' });

    await render({ ...cena, timeZone: zone, options: [atNine], recommendedOptionIds: [] });

    expect(choices()).toEqual(['viernes 10 de julio, a las 9:30']);
    expect(text(element().querySelector('.zone'))).toBe('Hora de Chatham');
  });

  it('names no zone for whole days', async () => {
    await render({ ...cena, timeZone: 'Pacific/Chatham' });

    expect(element().querySelector('.zone')).toBeNull();
  });

  it('is a section closed as the page opens, which folds the choice and the link to the results', async () => {
    await render(cena);

    const toggle = element().querySelector<HTMLButtonElement>('app-manage-section h2 > button');
    expect(text(toggle)).toBe('Elige la fecha final');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(element().querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Elige la fecha final',
    );
    expect(confirmButton().closest('[hidden]')).not.toBeNull();
    expect(element().querySelector('a.results')?.closest('[hidden]')).not.toBeNull();

    toggle?.click();
    await fixture.whenStable();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(confirmButton().closest('[hidden]')).toBeNull();
    expect(element().querySelector('a.results')?.closest('[hidden]')).toBeNull();
  });

  describe('"Editar opciones"', () => {
    /** Voting open, nobody voted: the options can still change. */
    const fresh: ManagedEvent = { ...cena, state: 'open', voters: 0, recommendedOptionIds: [] };

    function edit(): HTMLElement | null {
      return element().querySelector('.edit');
    }

    function why(): HTMLElement | null {
      return element().querySelector('.why');
    }

    it('links to the editor of the options beside "Confirmar fecha" while they can change', async () => {
      await render(fresh);

      expect(edit()?.tagName).toBe('A');
      expect(text(edit())).toBe('Editar opciones');
      expect(edit()?.getAttribute('href')).toBe('/manage/k3Jd9aB2cD4eF6gH8iJ0kL/options');
      expect(edit()?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(edit()?.parentElement).toBe(confirmButton().parentElement);
      expect(edit()?.previousElementSibling).toBe(confirmButton());
      expect(why()).toBeNull();
    });

    it('is folded with the section', async () => {
      await render(fresh);

      expect(edit()?.closest('[hidden]')).not.toBeNull();
    });

    it.each([
      [
        'someone voted',
        { ...cena, state: 'open', voters: 1 },
        'Ya hay votos: las opciones no se pueden cambiar',
      ],
      ['someone voted and voting closed', cena, 'Ya hay votos: las opciones no se pueden cambiar'],
      [
        'voting closed and nobody voted',
        { ...cena, voters: 0, recommendedOptionIds: [] },
        'La votación está cerrada: para cambiar las opciones, reábrela con un plazo nuevo.',
      ],
    ] satisfies [string, ManagedEvent, string][])(
      'is off when %s, saying why under it',
      async (_name, event, reason) => {
        await render(event);

        const button = edit() as HTMLButtonElement | null;
        expect(button?.tagName).toBe('BUTTON');
        expect(button?.disabled).toBe(true);
        expect(text(button)).toBe('Editar opciones');
        expect(text(why())).toBe(reason);
        expect(why()?.tagName).toBe('P');
        expect(why()?.previousElementSibling).toBe(button?.parentElement);
        expect(button?.getAttribute('aria-describedby')).toBe(why()?.id);
        expect(why()?.id).not.toBe('');
      },
    );

    it('turns off when the event comes back with a vote', async () => {
      await render(fresh);

      fixture.componentRef.setInput('event', { ...fresh, voters: 1 });
      await fixture.whenStable();

      expect(edit()?.tagName).toBe('BUTTON');
      expect(text(why())).toBe('Ya hay votos: las opciones no se pueden cambiar');
    });

    it('is gone once a date is confirmed', async () => {
      await render({ ...cena, state: 'confirmed', confirmedOption: july10, voters: 0 });

      expect(edit()).toBeNull();
      expect(why()).toBeNull();
    });
  });

  describe('after new options were not saved', () => {
    function notice(): HTMLElement | null {
      return element().querySelector('app-notice-box');
    }

    it.each([
      [
        'votedMeanwhile',
        'No se han guardado tus cambios: alguien ha votado mientras editabas, y con votos las opciones ya no se pueden cambiar.',
      ],
      [
        'optionsOutdated',
        'No se han guardado tus cambios: las opciones se cambiaron antes desde otra pestaña o dispositivo. Estas son las de ahora.',
      ],
    ] satisfies [FinalDateNotice, string][])(
      'says why (%s) in the box under the help, its section open',
      async (why, said) => {
        await render(cena);

        fixture.componentRef.setInput('notice', why);
        await fixture.whenStable();

        expect(text(notice())).toBe(said);
        expect(text(notice()?.querySelector('strong'))).toBe('No se han guardado tus cambios:');
        expect(element().querySelector('.help + [role="status"] app-notice-box')).toBe(notice());
        expect(
          element().querySelector('app-manage-section h2 > button')?.getAttribute('aria-expanded'),
        ).toBe('true');
      },
    );
  });

  describe('after a confirmation refused because the options changed', () => {
    function toggle(): HTMLButtonElement {
      return element().querySelector<HTMLButtonElement>('app-manage-section h2 > button')!;
    }

    function notice(): HTMLElement | null {
      return element().querySelector('app-notice-box');
    }

    async function told(): Promise<void> {
      fixture.componentRef.setInput('notice', 'optionsChanged');
      await fixture.whenStable();
    }

    it('says so in a box under the help, in a live region', async () => {
      await render(cena);
      toggle().click();
      await fixture.whenStable();

      await told();

      expect(text(notice())).toBe(
        'No se ha confirmado la fecha: las opciones han cambiado desde otra pestaña o dispositivo. Elige de nuevo entre las de ahora.',
      );
      expect(text(notice()?.querySelector('strong'))).toBe('No se ha confirmado la fecha:');
      expect(notice()?.closest('[role="status"]')).not.toBeNull();
      expect(element().querySelector('.help + [role="status"] app-notice-box')).toBe(notice());
    });

    it('opens its section to say it, which the organizer can still close', async () => {
      await render(cena);

      await told();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');

      toggle().click();
      await fixture.whenStable();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps the section open when the notice goes', async () => {
      await render(cena);
      await told();

      fixture.componentRef.setInput('notice', null);
      await fixture.whenStable();

      expect(notice()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('closes the box with its cross, and shows it again on the next refusal', async () => {
      await render(cena);
      await told();

      notice()!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!.click();
      await fixture.whenStable();
      expect(notice()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');

      fixture.componentRef.setInput('notice', null);
      await fixture.whenStable();
      await told();
      expect(notice()).not.toBeNull();
    });

    it('gives the focus to the chosen option when the cross closes the box', async () => {
      await render(cena);
      await told();
      const cross = notice()!.querySelector<HTMLButtonElement>(
        'button[aria-label="Cerrar aviso"]',
      )!;
      cross.focus();

      cross.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(radios()[1]);
    });

    it('gives the focus to the first option when none is chosen', async () => {
      await render({ ...cena, recommendedOptionIds: [] });
      await told();

      notice()!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(radios()[0]);
    });

    it('shows no box without a notice', async () => {
      await render(cena);

      expect(notice()).toBeNull();
    });
  });

  describe('with more than six options', () => {
    const options = (count: number): Option[] =>
      Array.from({ length: count }, (_, i) => day(`2026-07-1${String(i)}`, i));

    // jsdom lays nothing out: a folded box holds more than it shows, as in a browser.
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.style.blockSize === '' ? 0 : 500;
        },
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    });

    function box(): HTMLElement | null {
      return element().querySelector('.options');
    }

    function arrows(): HTMLButtonElement[] {
      return Array.from(element().querySelectorAll<HTMLButtonElement>('.fold-arrow'));
    }

    it('shows six and scrolls the rest under ︿ and ﹀, which start with ︿ off', async () => {
      await render({ ...cena, options: options(7), recommendedOptionIds: [] });

      expect(box()?.classList).toContain('folded');
      expect(arrows().map((arrow) => arrow.textContent.trim())).toEqual(['︿', '﹀']);
      expect(arrows().map((arrow) => arrow.disabled)).toEqual([true, false]);
      expect(arrows().map((arrow) => arrow.classList.contains('spent'))).toEqual([true, false]);
      // For the mouse and the finger: the keyboard moves through the options, and the box follows.
      expect(arrows().map((arrow) => [arrow.tabIndex, arrow.getAttribute('aria-hidden')])).toEqual([
        [-1, 'true'],
        [-1, 'true'],
      ]);
      expect(choices()).toHaveLength(7);
    });

    it('shows six whole, with no arrows', async () => {
      await render({ ...cena, options: options(6), recommendedOptionIds: [] });

      expect(box()?.classList).not.toContain('folded');
      expect(arrows()).toEqual([]);
    });

    /** The option the box keeps in sight. */
    function kept(): number | null {
      return fixture.debugElement
        .query(By.directive(ScrollFold))
        .injector.get(ScrollFold)
        .foldSight();
    }

    it('keeps the chosen option in sight: the only recommended one, even the eighth of nine', async () => {
      const nine = options(9);
      await render({ ...cena, options: nine, recommendedOptionIds: [nine[7]!.id] });

      expect(kept()).toBe(7);
    });

    it('keeps in sight the option the organizer chooses, and none while none is chosen', async () => {
      const nine = options(9);
      await render({ ...cena, options: nine, recommendedOptionIds: [nine[1]!.id, nine[7]!.id] });
      expect(kept()).toBeNull();

      await choose(2);

      expect(kept()).toBe(2);
    });
  });

  it('asks its questions outside the section', async () => {
    await render(cena);
    await choose(0);
    await pressConfirm();

    expect(dialog()?.closest('app-manage-section')).toBeNull();
  });

  it('links to the full results', async () => {
    await render(cena);

    const link = element().querySelector<HTMLAnchorElement>('a.results');
    expect(text(link)).toBe('Ver los resultados completos');
    expect(link?.getAttribute('href')).toBe('/results/Qw7p2aB2cD4eF6gH8iJ0kL');
  });

  describe('once a date is confirmed', () => {
    const done: ManagedEvent = {
      ...cena,
      state: 'confirmed',
      confirmedOption: day('2026-07-10', 2, { kind: 'range', start: '20:00', end: '22:00' }),
      recommendedOptionIds: [],
    };

    it('shows the confirmed date in full instead of the choice', async () => {
      await render(done);

      expect(radios()).toEqual([]);
      expect(text(element().querySelector('.confirmed h2'))).toBe('Fecha confirmada');
      expect(text(element().querySelector('.confirmed .date'))).toBe(
        'viernes 10 de julio de 2026, 20:00 a 22:00',
      );
      expect(text(element().querySelector('.confirmed .message'))).toBe(
        'Los participantes ya ven esta fecha y no se puede votar.',
      );
      expect(element().querySelector('a.results')).not.toBeNull();
      // Nothing is left to choose: always in sight, not a section that folds.
      expect(element().querySelector('app-manage-section')).toBeNull();
    });

    it('names the event’s zone when the browser is in another', async () => {
      await render({ ...done, timeZone: 'Pacific/Chatham' });

      expect(text(element().querySelector('.confirmed .zone'))).toBe('Hora de Chatham');
    });

    it('takes the focus to it when the organizer has just confirmed', async () => {
      await render(cena);
      expect(document.activeElement).not.toBe(element().querySelector('.confirmed h2'));

      fixture.componentRef.setInput('event', done);
      await fixture.whenStable();

      expect(document.activeElement).toBe(element().querySelector('.confirmed h2'));
    });

    it('takes the focus only once, not again when the event is read anew', async () => {
      await render(cena);
      fixture.componentRef.setInput('event', done);
      await fixture.whenStable();
      const elsewhere = document.body.appendChild(document.createElement('button'));
      elsewhere.focus();

      fixture.componentRef.setInput('event', { ...done, voters: 3 });
      await fixture.whenStable();

      expect(document.activeElement).toBe(elsewhere);
      elsewhere.remove();
    });

    it('leaves the focus alone when the page opens on it', async () => {
      document.body.focus();
      await render(done);

      expect(document.activeElement).not.toBe(element().querySelector('.confirmed h2'));
    });
  });
});
