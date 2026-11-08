import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ManagedEvent, Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { FinalDate } from './final-date';
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
    { sending = false, failed = false } = {},
  ): Promise<ComponentFixture<FinalDate>> {
    fixture = TestBed.createComponent(FinalDate);
    confirmed = [];
    fixture.componentInstance.confirm.subscribe((optionId) => confirmed.push(optionId));
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('sending', sending);
    fixture.componentRef.setInput('failed', failed);
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
    await render(cena, { failed: true });

    expect(text(element().querySelector('[role="status"]'))).toBe(
      'No se ha podido confirmar la fecha. Inténtalo de nuevo.',
    );
    expect(confirmButton().disabled).toBe(false);
  });

  it('says nothing while nothing failed', async () => {
    await render(cena);

    expect(text(element().querySelector('[role="status"]'))).toBe('');
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

    it('leaves the focus alone when the page opens on it', async () => {
      document.body.focus();
      await render(done);

      expect(document.activeElement).not.toBe(element().querySelector('.confirmed h2'));
    });
  });
});
