import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PublicEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { MyVotes } from './my-votes';
import { VotePage } from './vote-page';
import pageStyles from './vote-page.scss' with { loader: 'text' };

const cenaDeVerano: PublicEvent = {
  title: 'Cena de verano',
  organizerName: 'Pietro',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [
    {
      id: '6f1c2a0e-0000-4000-8000-000000000001',
      dates: { kind: 'single', date: '2026-07-06' },
      time: null,
    },
  ],
  confirmedOption: null,
};

describe('VotePage', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [VotePage],
      providers: [
        provideI18n(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function render(eventId = 'k3Jd9'): ComponentFixture<VotePage> {
    const fixture = TestBed.createComponent(VotePage);
    fixture.componentRef.setInput('eventId', eventId);
    TestBed.tick();
    return fixture;
  }

  function text(fixture: ComponentFixture<VotePage>): string {
    return (fixture.nativeElement as HTMLElement).textContent.trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('reads the event of the participation link and shows its first step', async () => {
    const fixture = render('k3Jd9');

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
    await fixture.whenStable();

    expect(text(fixture)).toContain('Cena de verano');
    expect(text(fixture)).toContain('Escribe tu nombre para votar');
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.value).toBe('');
  });

  it('says it is loading while the event is on its way', () => {
    const fixture = render();

    expect(text(fixture)).toBe('Cargando…');

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
  });

  it('offers to try again when the event could not be read, and reads it again', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/public/events/k3Jd9')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No se ha podido cargar');
    const retry = (fixture.nativeElement as HTMLElement).querySelector('button');
    retry?.click();
    TestBed.tick();

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
    await fixture.whenStable();
    expect(text(fixture)).toContain('Cena de verano');
  });

  describe('once the event is read', () => {
    async function opened(event: PublicEvent = cenaDeVerano): Promise<ComponentFixture<VotePage>> {
      const fixture = render();
      httpTesting.expectOne('/api/public/events/k3Jd9').flush(event);
      await fixture.whenStable();
      return fixture;
    }

    function element(fixture: ComponentFixture<VotePage>): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function button(fixture: ComponentFixture<VotePage>, name: RegExp): HTMLButtonElement {
      const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
        name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
      );
      if (found === undefined) throw new Error(`No button named ${String(name)}`);
      return found;
    }

    async function chooseDays(fixture: ComponentFixture<VotePage>): Promise<void> {
      const field = element(fixture).querySelector('input');
      if (field !== null) {
        field.value = 'Luis';
        field.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      }
      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
    }

    it('shows step 1 in a card labelled "paso 1"', async () => {
      const fixture = await opened();

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 1');
    });

    it('goes to the days, every one available, when the voter wants to choose', async () => {
      const fixture = await opened();

      await chooseDays(fixture);

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 2');
      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: Disponible',
      );
      expect(element(fixture).querySelector('button.tab')?.textContent.trim()).toBe('paso 1');
    });

    it('keeps the name and the answers when going back to step 1 and forward again', async () => {
      const fixture = await opened();
      await chooseDays(fixture);
      button(fixture, /6 de julio/).click();
      await fixture.whenStable();

      button(fixture, /Volver al paso 1/).click();
      await fixture.whenStable();
      expect(element(fixture).querySelector('input')?.value).toBe('Luis');

      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: No puedo',
      );
    });

    it('goes back to step 1 from its tab', async () => {
      const fixture = await opened();
      await chooseDays(fixture);

      button(fixture, /^\s*paso 1\s*$/).click();
      await fixture.whenStable();

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 1');
    });

    it("gives the days step the colour of the vote's last step", async () => {
      const fixture = await opened();
      await chooseDays(fixture);

      expect(
        element(fixture)
          .querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent'),
      ).toBe('var(--q-accent-amber)');
    });

    describe('sending the vote', () => {
      const optionId = cenaDeVerano.options[0]?.id ?? '';
      const castUrl = '/api/public/events/k3Jd9/participations';
      const forbidden = { status: 403, statusText: 'Forbidden' };

      beforeEach(() => {
        localStorage.clear();
      });

      async function openConfirmation(fixture: ComponentFixture<VotePage>): Promise<void> {
        await chooseDays(fixture);
        button(fixture, /Confirmar mis días/).click();
        await fixture.whenStable();
      }

      function bubble(fixture: ComponentFixture<VotePage>): string | undefined {
        return element(fixture).querySelector('.bubble')?.textContent.replace(/\s+/g, ' ').trim();
      }

      async function answer(
        fixture: ComponentFixture<VotePage>,
        status = 201,
      ): Promise<{ token: string; body: unknown }> {
        // The page reads the event's token before it sends.
        await new Promise((resolve) => setTimeout(resolve));
        const request = httpTesting.expectOne(castUrl);
        const sent = {
          token: request.request.headers.get('x-vote-token') ?? '',
          body: request.request.body as unknown,
        };
        if (status === 201) {
          request.flush(
            { participationId: '6f1c2a0e-0000-4000-8000-0000000000aa' },
            { status, statusText: 'Created' },
          );
        } else {
          request.flush(null, { status, statusText: 'Error' });
        }
        // The answer settles the send's promise chain, which the fixture does not wait for.
        await new Promise((resolve) => setTimeout(resolve));
        await fixture.whenStable();
        return sent;
      }

      it('asks for confirmation over the days when they are answered', async () => {
        const fixture = await opened();

        await openConfirmation(fixture);

        expect(bubble(fixture)).toContain('No has elegido ningún día preferido.');
        expect(bubble(fixture)).toContain('Podrás cambiarlo hasta el 1 de julio de 2026.');
        expect(element(fixture).querySelector('.card app-vote-confirm')).not.toBeNull();
      });

      it('puts the covered days out of reach while confirming, and back afterwards', async () => {
        const fixture = await opened();
        await chooseDays(fixture);
        // A pointer or the keyboard leaves the focus on the check that opens the confirmation.
        const done = button(fixture, /Confirmar mis días/);
        done.focus();
        done.click();
        await fixture.whenStable();
        const days = element(fixture).querySelector<HTMLElement>('app-vote-days');
        expect(days?.inert).toBe(true);

        button(fixture, /Volver atrás/).click();
        await fixture.whenStable();
        await Promise.resolve();

        expect(days?.inert).toBe(false);
        expect(document.activeElement).toBe(done);
      });

      it('goes back to the days, answers kept, from the confirmation', async () => {
        const fixture = await opened();
        await chooseDays(fixture);
        button(fixture, /6 de julio/).click();
        await fixture.whenStable();
        button(fixture, /Confirmar mis días/).click();
        await fixture.whenStable();

        button(fixture, /Volver atrás/).click();
        await fixture.whenStable();

        expect(element(fixture).querySelector('app-vote-confirm')).toBeNull();
        expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
          'lunes, 6 de julio: No puedo',
        );
      });

      it('closes the confirmation when the voter goes back to step 1 by its tab', async () => {
        const fixture = await opened();
        await openConfirmation(fixture);

        button(fixture, /^\s*paso 1\s*$/).click();
        await fixture.whenStable();
        button(fixture, /Quiero elegir/).click();
        await fixture.whenStable();

        expect(element(fixture).querySelector('app-vote-confirm')).toBeNull();
      });

      it('sends the name and the answers, then thanks the voter with the private link', async () => {
        const fixture = await opened();
        await openConfirmation(fixture);

        button(fixture, /Confirmar mi voto/).click();
        const { token, body } = await answer(fixture);

        expect(body).toEqual({ name: 'Luis', votes: { [optionId]: 'available' } });
        expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('¡Hecho!');
        expect(element(fixture).querySelector('a')?.getAttribute('href')).toBe(
          `/vote/k3Jd9/my-vote#t=${token}`,
        );
        expect(element(fixture).querySelector('app-step-stack')).toBeNull();
      });

      it('says inside the bubble when the vote could not be sent, and tries again with the same token', async () => {
        const fixture = await opened();
        await openConfirmation(fixture);

        button(fixture, /Confirmar mi voto/).click();
        const first = await answer(fixture, 500);
        expect(bubble(fixture)).toContain('No se ha podido enviar tu voto. Inténtalo de nuevo.');

        button(fixture, /Confirmar mi voto/).click();
        await fixture.whenStable();
        expect(bubble(fixture)).not.toContain('No se ha podido enviar');
        // The token was sent before: the page tries to edit a stored vote, and casts when none is.
        httpTesting
          .expectOne(`${castUrl}/mine`)
          .flush({ error: { code: 'FORBIDDEN', message: 'no vote' } }, forbidden);
        await new Promise((resolve) => setTimeout(resolve));
        const second = await answer(fixture);
        httpTesting.expectOne(`${castUrl}/mine`).flush(second.body as object);
        await new Promise((resolve) => setTimeout(resolve));
        await fixture.whenStable();

        expect(second.token).toBe(first.token);
        expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('¡Hecho!');
      });

      it('cannot send twice, or go back to step 1, while the vote is on its way', async () => {
        const fixture = await opened();
        await openConfirmation(fixture);

        button(fixture, /Confirmar mi voto/).click();
        await fixture.whenStable();
        button(fixture, /^\s*paso 1\s*$/).click();
        await fixture.whenStable();

        expect(button(fixture, /Confirmar mi voto/).disabled).toBe(true);
        expect(element(fixture).querySelector('app-vote-confirm')).not.toBeNull();
        await answer(fixture);
      });

      it('sends every option available at once, without confirmation, to fit in with the majority', async () => {
        const fixture = await opened();
        const field = element(fixture).querySelector('input');
        if (field) {
          field.value = '  Luis ';
          field.dispatchEvent(new Event('input'));
          await fixture.whenStable();
        }

        button(fixture, /Me adapto/).click();
        const { body } = await answer(fixture);

        expect(body).toEqual({ name: 'Luis', votes: { [optionId]: 'available' } });
        expect(element(fixture).querySelector('h2')?.textContent.trim()).toBe('¡Hecho!');
      });

      it('says under the step 1 choices when the quick vote could not be sent', async () => {
        const fixture = await opened({ ...cenaDeVerano, anonymous: true });

        button(fixture, /Me adapto/).click();
        await answer(fixture, 0);

        expect(element(fixture).querySelector('.send-error')?.textContent.trim()).toBe(
          'No se ha podido enviar tu voto. Inténtalo de nuevo.',
        );
        expect(button(fixture, /Me adapto/).disabled).toBe(false);
      });

      it('sends no name on an anonymous event', async () => {
        const fixture = await opened({ ...cenaDeVerano, anonymous: true });

        button(fixture, /Me adapto/).click();
        const { body } = await answer(fixture);

        expect(body).toEqual({ votes: { [optionId]: 'available' } });
      });
    });

    describe('of an event with times', () => {
      const ids = {
        morning: '6f1c2a0e-0000-4000-8000-000000000011',
        evening: '6f1c2a0e-0000-4000-8000-000000000012',
        seventh: '6f1c2a0e-0000-4000-8000-000000000013',
        eighth: '6f1c2a0e-0000-4000-8000-000000000014',
      };
      const withTimes: PublicEvent = {
        ...cenaDeVerano,
        options: [
          {
            id: ids.morning,
            dates: { kind: 'single', date: '2026-07-06' },
            time: { kind: 'single', at: '09:00' },
          },
          {
            id: ids.evening,
            dates: { kind: 'single', date: '2026-07-06' },
            time: { kind: 'range', start: '18:00', end: '20:00' },
          },
          {
            id: ids.seventh,
            dates: { kind: 'single', date: '2026-07-07' },
            time: { kind: 'single', at: '10:00' },
          },
          // A whole day next to the times: the event still has times.
          { id: ids.eighth, dates: { kind: 'single', date: '2026-07-08' }, time: null },
        ],
      };

      function accent(fixture: ComponentFixture<VotePage>): string | undefined {
        return element(fixture)
          .querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent');
      }

      async function press(fixture: ComponentFixture<VotePage>, name: RegExp): Promise<void> {
        button(fixture, name).click();
        await fixture.whenStable();
      }

      it('goes from the days to their times, the last step, which takes its colour', async () => {
        const fixture = await opened(withTimes);
        await chooseDays(fixture);
        expect(accent(fixture)).toBe('var(--q-accent-slate)');

        await press(fixture, /Elegir las horas/);

        expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 3');
        expect(accent(fixture)).toBe('var(--q-accent-amber)');
        expect(button(fixture, /6 de julio, 9:00/).getAttribute('aria-label')).toBe(
          'lunes, 6 de julio, 9:00: Disponible',
        );
      });

      it('shows only the times of the days the voter can make', async () => {
        const fixture = await opened(withTimes);
        await chooseDays(fixture);
        await press(fixture, /6 de julio/);

        await press(fixture, /Elegir las horas/);

        expect(element(fixture).querySelectorAll('.block')).toHaveLength(2);
        expect(button(fixture, /7 de julio, 10:00/)).toBeDefined();
      });

      it('goes back to the days, answers kept, from the first page of times', async () => {
        const fixture = await opened(withTimes);
        await chooseDays(fixture);
        await press(fixture, /Elegir las horas/);
        await press(fixture, /10:00/);
        await press(fixture, /Volver al paso 2/);

        expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 2');
        expect(button(fixture, /7 de julio/).getAttribute('aria-label')).toBe(
          'martes, 7 de julio: No puedo',
        );
      });

      it('asks for confirmation over the times and sends every answer', async () => {
        const fixture = await opened(withTimes);
        await chooseDays(fixture);
        await press(fixture, /Elegir las horas/);
        button(fixture, /18:00 a 20:00/).dispatchEvent(
          new MouseEvent('dblclick', { bubbles: true }),
        );
        await press(fixture, /9:00/);

        await press(fixture, /Confirmar mis horas/);
        expect(element(fixture).querySelector<HTMLElement>('app-vote-times')?.inert).toBe(true);
        button(fixture, /Confirmar mi voto/).click();
        await new Promise((resolve) => setTimeout(resolve));
        const request = httpTesting.expectOne('/api/public/events/k3Jd9/participations');

        expect(request.request.body).toEqual({
          name: 'Luis',
          votes: {
            [ids.eighth]: 'available',
            [ids.morning]: 'unavailable',
            [ids.evening]: 'preferred',
            [ids.seventh]: 'available',
          },
        });
        request.flush(
          { participationId: '6f1c2a0e-0000-4000-8000-0000000000aa' },
          { status: 201, statusText: 'Created' },
        );
      });

      it('asks for confirmation over the days when no day is possible', async () => {
        const fixture = await opened(withTimes);
        await chooseDays(fixture);
        await press(fixture, /6 de julio/);
        await press(fixture, /7 de julio/);
        await press(fixture, /8 de julio/);

        await press(fixture, /Confirmar mis días/);

        expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 2');
        expect(element(fixture).querySelector('.card app-vote-confirm')?.textContent).toContain(
          'No puedes ningún día.',
        );
      });
    });
  });

  describe('when this browser holds a vote of the event', () => {
    const token = 'gnBC8IUdhskzM84pbChyLw';
    const mine = '/api/public/events/k3Jd9/participations/mine';
    const optionId = cenaDeVerano.options[0]?.id ?? '';
    const luis = { name: 'Luis', votes: { [optionId]: 'unavailable' } } as const;

    function element(fixture: ComponentFixture<VotePage>): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function button(fixture: ComponentFixture<VotePage>, name: RegExp): HTMLButtonElement {
      const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
        name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
      );
      if (found === undefined) throw new Error(`No button named ${String(name)}`);
      return found;
    }

    /** Opens the page and answers the event and, once it is asked for, the stored vote. */
    async function opened(
      answerMine: (request: ReturnType<HttpTestingController['expectOne']>) => void,
    ): Promise<ComponentFixture<VotePage>> {
      const fixture = render();
      httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
      await new Promise((resolve) => setTimeout(resolve));
      answerMine(httpTesting.expectOne(mine));
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      return fixture;
    }

    it('says it is loading until the stored vote is read', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = render();
      httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();

      expect(text(fixture)).toBe('Cargando…');

      httpTesting.expectOne(mine).flush(luis);
    });

    it('starts from the stored name and answers, and says the voter voted before', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = await opened((request) => {
        expect(request.request.headers.get('x-vote-token')).toBe(token);
        request.flush(luis);
      });

      expect(element(fixture).querySelector('input')?.value).toBe('Luis');
      expect(element(fixture).querySelector('.notice')?.textContent).toContain('Ya has votado.');
      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: No puedo',
      );
    });

    it('starts available on an option the stored vote does not answer', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = await opened((request) => {
        request.flush({ name: 'Luis', votes: {} });
      });

      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();

      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: Disponible',
      );
    });

    it('replaces the vote and says it was updated when the voter confirms', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = await opened((request) => {
        request.flush(luis);
      });
      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
      button(fixture, /6 de julio/).click();
      await fixture.whenStable();
      button(fixture, /Confirmar mis días/).click();
      await fixture.whenStable();

      button(fixture, /Confirmar mi voto/).click();
      await new Promise((resolve) => setTimeout(resolve));
      const edit = httpTesting.expectOne(mine);
      expect(edit.request.method).toBe('PUT');
      expect(edit.request.body).toEqual({ name: 'Luis', votes: { [optionId]: 'available' } });
      edit.flush(edit.request.body as object);
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();

      expect(element(fixture).querySelector('.registered')?.textContent.trim()).toBe(
        'Tu voto ha sido actualizado correctamente.',
      );
    });

    it('starts empty, without a notice, when its token holds no vote (its send failed)', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = await opened((request) => {
        request.flush(null, { status: 403, statusText: 'Forbidden' });
      });

      expect(element(fixture).querySelector('input')?.value).toBe('');
      expect(element(fixture).querySelector('.notice')).toBeNull();
    });

    it('warns when the private link it was opened from holds no vote of the event', async () => {
      TestBed.inject(MyVotes).claim('k3Jd9', token);
      const fixture = await opened((request) => {
        request.flush(null, { status: 403, statusText: 'Forbidden' });
      });

      expect(element(fixture).querySelector('.notice.warn')?.textContent).toContain(
        'No encontramos ningún voto con este enlace.',
      );
      expect(element(fixture).querySelector('input')?.value).toBe('');
    });

    it("says the vote was updated when, behind a link copied in part, the voter types the browser's vote name", async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      TestBed.inject(MyVotes).claim('k3Jd9', 'gnBC8IU');
      const fixture = await opened((request) => {
        request.flush(luis);
      });
      const field = element(fixture).querySelector('input');
      if (field) {
        field.value = 'Luis';
        field.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      }

      button(fixture, /Me adapto/).click();
      await new Promise((resolve) => setTimeout(resolve));
      const edit = httpTesting.expectOne(mine);
      expect(edit.request.method).toBe('PUT');
      edit.flush(edit.request.body as object);
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();

      expect(element(fixture).querySelector('.registered')?.textContent.trim()).toBe(
        'Tu voto ha sido actualizado correctamente.',
      );
    });
  });

  describe('when voting has ended', () => {
    const token = 'gnBC8IUdhskzM84pbChyLw';
    const eventUrl = '/api/public/events/k3Jd9';
    const castUrl = `${eventUrl}/participations`;
    const mine = `${castUrl}/mine`;
    const optionId = cenaDeVerano.options[0]?.id ?? '';
    const luis = { name: 'Luis', votes: { [optionId]: 'unavailable' } } as const;
    const closed = { error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] } };
    const cancelled = {
      error: {
        code: 'EVENT_CANCELLED',
        message: 'The event was cancelled',
        details: [],
        title: 'Cena de verano',
      },
    };

    function element(fixture: ComponentFixture<VotePage>): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function heading(fixture: ComponentFixture<VotePage>): string | undefined {
      return element(fixture).querySelector('h2')?.textContent.trim();
    }

    function button(fixture: ComponentFixture<VotePage>, name: RegExp): HTMLButtonElement {
      const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
        name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
      );
      if (found === undefined) throw new Error(`No button named ${String(name)}`);
      return found;
    }

    async function settled(fixture: ComponentFixture<VotePage>): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    }

    async function answered(
      flush: (request: ReturnType<HttpTestingController['expectOne']>) => void,
    ): Promise<ComponentFixture<VotePage>> {
      const fixture = render();
      flush(httpTesting.expectOne(eventUrl));
      await settled(fixture);
      return fixture;
    }

    it.each([
      [404, { error: { code: 'NOT_FOUND', message: 'No event has this link', details: [] } }],
      [400, { error: { code: 'VALIDATION_FAILED', message: 'Malformed', details: [] } }],
    ])(
      'shows the page not found, with no retry, when no event has the link (%i)',
      async (status, body) => {
        const fixture = await answered((request) => {
          request.flush(body, { status, statusText: 'Error' });
        });

        expect(element(fixture).querySelector('h1')?.textContent.trim()).toBe(
          'Página no encontrada',
        );
        expect(element(fixture).querySelector('a')?.getAttribute('href')).toBe('/');
        expect(element(fixture).querySelector('button')).toBeNull();
      },
    );

    it('says the event was cancelled under the title it kept', async () => {
      const fixture = await answered((request) => {
        request.flush(cancelled, { status: 410, statusText: 'Gone' });
      });

      expect(element(fixture).querySelector('h1')?.textContent.trim()).toBe('Cena de verano');
      expect(heading(fixture)).toBe('Evento cancelado');
      expect(element(fixture).querySelector('button')).toBeNull();
    });

    it('says voting is closed, with no steps, once the deadline has passed', async () => {
      const fixture = await answered((request) => {
        request.flush({ ...cenaDeVerano, state: 'closed' });
      });

      expect(heading(fixture)).toBe('Votación cerrada');
      expect(text(fixture)).toContain('Pietro comunicará la fecha del evento.');
      expect(element(fixture).querySelector('app-step-stack')).toBeNull();
      expect(element(fixture).querySelector('.notice')).toBeNull();
    });

    it('says the vote this browser holds was registered when voting is closed', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', token);
      const fixture = render();
      httpTesting.expectOne(eventUrl).flush({ ...cenaDeVerano, state: 'closed' });
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
      expect(text(fixture)).toBe('Cargando…');

      httpTesting.expectOne(mine).flush(luis);
      await settled(fixture);

      expect(heading(fixture)).toBe('Votación cerrada');
      expect(element(fixture).querySelector('.notice')?.textContent.trim()).toBe(
        'Tu voto quedó registrado.',
      );
    });

    it('shows the confirmed date, with no steps, once the organizer chose it', async () => {
      const option = {
        id: optionId,
        dates: { kind: 'single', date: '2026-07-10' },
        time: { kind: 'range', start: '20:00', end: '22:00' },
      } as const;
      const fixture = await answered((request) => {
        request.flush({ ...cenaDeVerano, state: 'confirmed', confirmedOption: option });
      });

      expect(heading(fixture)).toBe('Fecha confirmada');
      expect(element(fixture).querySelector('.date')?.textContent.trim()).toBe(
        'viernes 10 de julio de 2026, 20:00 a 22:00',
      );
      expect(element(fixture).querySelector('app-step-stack')).toBeNull();
    });

    describe('while the page was open', () => {
      async function sendQuickVote(fixture: ComponentFixture<VotePage>): Promise<void> {
        const field = element(fixture).querySelector('input');
        if (field !== null) {
          field.value = 'Luis';
          field.dispatchEvent(new Event('input'));
          await fixture.whenStable();
        }
        button(fixture, /Me adapto/).click();
        await settled(fixture);
      }

      it('says the vote did not arrive in time when a new vote is refused', async () => {
        const fixture = await answered((request) => {
          request.flush(cenaDeVerano);
        });
        await sendQuickVote(fixture);

        httpTesting.expectOne(castUrl).flush(closed, { status: 409, statusText: 'Conflict' });
        await settled(fixture);
        // The refused send's token is read again: it holds no vote.
        httpTesting
          .expectOne(mine)
          .flush(
            { error: { code: 'FORBIDDEN', message: 'no vote', details: [] } },
            { status: 403, statusText: 'Forbidden' },
          );
        await settled(fixture);

        expect(heading(fixture)).toBe('Votación cerrada');
        expect(element(fixture).querySelector('.notice')?.textContent.trim()).toBe(
          'Tu voto no ha llegado a tiempo: la votación se cerró antes de enviarlo.',
        );
        expect(element(fixture).querySelector('app-step-stack')).toBeNull();
      });

      it('says the vote sent before is kept when an edit is refused', async () => {
        localStorage.setItem('qando.voteToken.k3Jd9', token);
        const fixture = render();
        httpTesting.expectOne(eventUrl).flush(cenaDeVerano);
        await new Promise((resolve) => setTimeout(resolve));
        httpTesting.expectOne(mine).flush(luis);
        await settled(fixture);
        await sendQuickVote(fixture);

        const edit = httpTesting.expectOne(mine);
        expect(edit.request.method).toBe('PUT');
        edit.flush(closed, { status: 409, statusText: 'Conflict' });
        await settled(fixture);
        httpTesting.expectOne(mine).flush(luis);
        await settled(fixture);

        expect(heading(fixture)).toBe('Votación cerrada');
        expect(element(fixture).querySelector('.notice')?.textContent.trim()).toBe(
          'Tus cambios no han llegado a tiempo: se mantiene el voto que enviaste antes.',
        );
      });

      it('says the event was cancelled when the vote is refused for it', async () => {
        const fixture = await answered((request) => {
          request.flush(cenaDeVerano);
        });
        await sendQuickVote(fixture);

        httpTesting.expectOne(castUrl).flush(cancelled, { status: 410, statusText: 'Gone' });
        await settled(fixture);

        expect(heading(fixture)).toBe('Evento cancelado');
        expect(element(fixture).querySelector('h1')?.textContent.trim()).toBe('Cena de verano');
      });

      it('shows the page not found when the event is gone when the vote is sent', async () => {
        const fixture = await answered((request) => {
          request.flush(cenaDeVerano);
        });
        await sendQuickVote(fixture);

        httpTesting
          .expectOne(castUrl)
          .flush(
            { error: { code: 'NOT_FOUND', message: 'No event has this link', details: [] } },
            { status: 404, statusText: 'Not Found' },
          );
        await settled(fixture);

        expect(element(fixture).querySelector('h1')?.textContent.trim()).toBe(
          'Página no encontrada',
        );
        expect(element(fixture).querySelector('app-step-stack')).toBeNull();
      });

      it('keeps the page and says the vote could not be sent on any other refusal', async () => {
        const fixture = await answered((request) => {
          request.flush(cenaDeVerano);
        });
        await sendQuickVote(fixture);

        httpTesting.expectOne(castUrl).flush(null, { status: 500, statusText: 'Error' });
        await settled(fixture);

        expect(element(fixture).querySelector('app-step-stack')).not.toBeNull();
        expect(text(fixture)).toContain('No se ha podido enviar tu voto.');
      });
    });
  });
});
