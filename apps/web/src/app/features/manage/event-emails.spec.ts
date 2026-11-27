import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { EmailState, ManagedEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { EventEmails } from './event-emails';
import type { Management } from './event-management';
import emailStyles from './event-emails.scss' with { loader: 'text' };
import wellStyles from '../../../styles/_wells.scss' with { loader: 'text' };

const july10 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';

const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-12-01',
  state: 'open',
  options: [{ id: july10, dates: { kind: 'single', date: '2026-12-10' }, time: null }],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  emails: [],
};

const sentSummary: EmailState = {
  type: 'summary',
  status: 'sent',
  sentAt: '2026-11-22T09:14:00.000Z',
};
const failedSummary: EmailState = { type: 'summary', status: 'failed' };
const pendingSummary: EmailState = { type: 'summary', status: 'pending' };
const waitingClosing: EmailState = { type: 'voting-closed', status: 'scheduled' };
const sendingClosing: EmailState = { type: 'voting-closed', status: 'pending' };

function withEmails(...emails: EmailState[]): ManagedEvent {
  return { ...cena, emails };
}

const managed = `/api/events/${cena.participationId}`;
const summaryRetry = `${managed}/emails/summary/retry`;

/** Lets a settled request's promise chain reach the next request. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** The management page's part: it shows each event the section hands it. */
@Component({
  imports: [EventEmails],
  template: `@if (shown()) {
    <app-event-emails
      [eventId]="event().participationId"
      [event]="event()"
      (changed)="take($event)"
    />
  }`,
})
class Host {
  readonly event = signal(cena);
  readonly handed: Management[] = [];
  readonly shown = signal(true);

  take(management: Management): void {
    this.handed.push(management);
    if (management.kind === 'managed') this.event.set(management.event);
  }
}

describe('EventEmails', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

  function render(event: ManagedEvent): HTMLElement {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set(event);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function update(): Promise<void> {
    await settle();
    fixture.detectChanges();
  }

  /** Each email's well: its name, its state and its button, if any. */
  function rows(): { name: string; state: string; button: string | null }[] {
    const element = fixture.nativeElement as HTMLElement;
    return [...element.querySelectorAll('li')].map((row) => ({
      name: row.querySelector('.name')?.textContent.trim() ?? '',
      state: row.querySelector('.state')?.textContent.trim() ?? '',
      button: row.querySelector('button')?.textContent.trim() ?? null,
    }));
  }

  function retryButton(): HTMLButtonElement {
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'li button',
    );
    if (!button) throw new Error('No "Reintentar" on the page');
    return button;
  }

  function section(): HTMLElement {
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-event-emails');
    if (!(host instanceof HTMLElement)) throw new Error('No emails section');
    return host;
  }

  it('heads the emails with what to do if one does not arrive', () => {
    render(withEmails(sentSummary));

    expect(section().querySelector('h2')?.textContent.trim()).toBe('Emails');
    expect(section().querySelector('.help')?.textContent.trim()).toBe(
      'Si no te llega alguno, mira en la carpeta de correo no deseado.',
    );
    expect(section().hidden).toBe(false);
  });

  it('is hidden when the event has no email', () => {
    render(withEmails());

    expect(section().hidden).toBe(true);
    expect(rows()).toEqual([]);
  });

  describe('as a section that folds', () => {
    function toggle(): HTMLButtonElement {
      return section().querySelector<HTMLButtonElement>('app-manage-section h2 > button')!;
    }

    function open(): boolean {
      return toggle().getAttribute('aria-expanded') === 'true';
    }

    function setEvent(event: ManagedEvent): void {
      fixture.componentInstance.event.set(event);
      fixture.detectChanges();
    }

    it('starts closed while no email has failed', () => {
      render(withEmails(sentSummary, waitingClosing));

      expect(open()).toBe(false);
      expect(section().querySelector('li')?.closest('[hidden]')).not.toBeNull();
    });

    it('opens by itself when an email has failed, "Reintentar" in sight', () => {
      render(withEmails(sentSummary, { type: 'voting-closed', status: 'failed' }));

      expect(open()).toBe(true);
      expect(retryButton().closest('[hidden]')).toBeNull();
    });

    it('opens by itself when an email fails while the page is shown', () => {
      render(withEmails(sentSummary, waitingClosing));
      setEvent(withEmails(sentSummary, { type: 'voting-closed', status: 'failed' }));

      expect(open()).toBe(true);
    });

    it('stays open while the failed email is sent again, and once it is sent', () => {
      render(withEmails(failedSummary));
      setEvent(withEmails(pendingSummary));
      expect(open()).toBe(true);

      setEvent(withEmails(sentSummary));
      expect(open()).toBe(true);
    });

    it('stays closed when the organizer closed it, while the same email is still failed', () => {
      render(withEmails(failedSummary));
      toggle().click();
      fixture.detectChanges();

      setEvent({ ...withEmails(failedSummary), voters: 3 });

      expect(open()).toBe(false);
    });

    it('stays as the organizer left it while nothing fails', () => {
      render(withEmails(sentSummary));
      toggle().click();
      fixture.detectChanges();

      setEvent({ ...withEmails(sentSummary), voters: 3 });

      expect(open()).toBe(true);
    });
  });

  describe('read out', () => {
    /** The region a screen reader hears: one line per email, its name and its state. */
    function spoken(): HTMLElement {
      const region = section().querySelector<HTMLElement>('.visually-hidden[aria-live="polite"]');
      if (!region) throw new Error('No region read out');
      return region;
    }

    function lines(): string[] {
      return [...spoken().children].map((line) => line.textContent.replace(/\s+/g, ' ').trim());
    }

    it('says each email’s state from outside the section, so it is heard while closed', () => {
      render(withEmails(pendingSummary, waitingClosing));

      expect(spoken().closest('app-manage-section')).toBeNull();
      expect(lines()).toEqual([
        'Resumen del evento: Enviando…',
        'Votación cerrada: Se enviará al cerrar la votación',
      ]);

      // Read again with the section closed: the email failed meanwhile.
      fixture.componentInstance.event.set(withEmails(failedSummary, waitingClosing));
      fixture.detectChanges();

      expect(lines()[0]).toBe('Resumen del evento: Envío fallido');
    });

    it('leaves the states in sight silent, so nothing is heard twice', () => {
      render(withEmails(failedSummary, waitingClosing));

      expect(section().querySelectorAll('app-manage-section [aria-live]')).toHaveLength(0);
    });
  });

  it('shows when a sent email went, in the event’s time zone', () => {
    render(
      withEmails(sentSummary, {
        type: 'voting-closed',
        status: 'sent',
        sentAt: '2026-11-30T23:00:00.000Z',
      }),
    );

    expect(rows()).toEqual([
      {
        name: 'Resumen del evento',
        state: 'Enviado el 22 de noviembre de 2026 a las 10:14',
        button: null,
      },
      {
        name: 'Votación cerrada',
        state: 'Enviado el 1 de diciembre de 2026 a las 0:00',
        button: null,
      },
    ]);
  });

  it('reads the time in the event’s own zone, not the browser’s', () => {
    render({ ...withEmails(sentSummary), timeZone: 'America/New_York' });

    expect(rows()[0]?.state).toBe('Enviado el 22 de noviembre de 2026 a las 4:14');
  });

  it('shows a pending summary as being sent', () => {
    render(withEmails(pendingSummary));

    expect(rows()).toEqual([{ name: 'Resumen del evento', state: 'Enviando…', button: null }]);
  });

  it('shows "Votación cerrada" as the API says: waiting for the closing, or being sent', () => {
    render(withEmails(sentSummary, waitingClosing));
    expect(rows()[1]).toEqual({
      name: 'Votación cerrada',
      state: 'Se enviará al cerrar la votación',
      button: null,
    });

    // The email's state alone, not the event's: the API knows when the email is due.
    fixture.componentInstance.event.set(withEmails(sentSummary, sendingClosing));
    fixture.detectChanges();
    expect(rows()[1]?.state).toBe('Enviando…');
  });

  it('shows a failed email with "Reintentar"', () => {
    render(withEmails(failedSummary, waitingClosing));

    expect(rows()[0]).toEqual({
      name: 'Resumen del evento',
      state: 'Envío fallido',
      button: 'Reintentar',
    });
    expect(retryButton().type).toBe('button');
    expect(section().querySelector('.state svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(section().querySelector('.state.failed')).not.toBeNull();
    expect(section().querySelector('.retry-failed')).toBeNull();
  });

  describe('retrying', () => {
    it('asks for the email again and hands the event with the email as the API answers it', async () => {
      render(withEmails(failedSummary, waitingClosing));
      retryButton().click();
      fixture.detectChanges();

      expect(retryButton().textContent.trim()).toBe('Reintentando…');
      expect(retryButton().disabled).toBe(true);
      httpTesting.expectOne(summaryRetry).flush(pendingSummary);
      await update();

      // Without reading the event again: the answer is the email's new state.
      expect(fixture.componentInstance.handed).toEqual([
        { kind: 'managed', event: withEmails(pendingSummary, waitingClosing) },
      ]);
      expect(rows().map(({ state, button }) => ({ state, button }))).toEqual([
        { state: 'Enviando…', button: null },
        { state: 'Se enviará al cerrar la votación', button: null },
      ]);
      // The button is gone: the keyboard's focus goes to the email's new state, not the page's top.
      expect(document.activeElement).toBe(section().querySelector('.state'));
      // Settles the read that a pending summary starts 10 seconds later.
      fixture.componentInstance.shown.set(false);
      fixture.detectChanges();
    });

    it('says when the retry did not get through, and lets it be pressed again', async () => {
      render(withEmails(failedSummary));
      retryButton().click();
      fixture.detectChanges();
      httpTesting.expectOne(summaryRetry).flush(null, { status: 500, statusText: 'Error' });
      await update();

      expect(section().querySelector('.retry-failed')?.textContent.trim()).toBe(
        'No se ha podido reintentar el envío. Inténtalo de nuevo.',
      );
      expect(retryButton().textContent.trim()).toBe('Reintentar');
      expect(retryButton().disabled).toBe(false);
      expect(fixture.componentInstance.handed).toEqual([]);

      retryButton().click();
      fixture.detectChanges();
      expect(section().querySelector('.retry-failed')).toBeNull();
      httpTesting.expectOne(summaryRetry).flush(null, { status: 500, statusText: 'Error' });
      await update();
    });

    it('hands the event read again when the email was retried meanwhile, in another tab', async () => {
      render(withEmails(failedSummary));
      retryButton().click();
      httpTesting
        .expectOne(summaryRetry)
        .flush(
          { error: { code: 'EMAIL_NOT_FAILED', message: 'EMAIL_NOT_FAILED', details: [] } },
          { status: 409, statusText: 'Conflict' },
        );
      await update();
      httpTesting.expectOne(managed).flush(withEmails(sentSummary));
      await update();

      expect(fixture.componentInstance.handed).toEqual([
        { kind: 'managed', event: withEmails(sentSummary) },
      ]);
    });

    it('holds every "Reintentar" while one retry is on its way', async () => {
      const failedClosing: EmailState = { type: 'voting-closed', status: 'failed' };
      render({ ...withEmails(failedSummary, failedClosing), state: 'closed' });
      const [summary, closing] = section().querySelectorAll<HTMLButtonElement>('li button');
      summary!.click();
      fixture.detectChanges();

      expect(summary!.textContent.trim()).toBe('Reintentando…');
      expect(closing!.textContent.trim()).toBe('Reintentar');
      expect(closing!.disabled).toBe(true);
      httpTesting.expectOne(summaryRetry).flush(null, { status: 500, statusText: 'Error' });
      await update();
      expect(closing!.disabled).toBe(false);
    });

    it('hands a refusal on to the page', async () => {
      render(withEmails(failedSummary));
      retryButton().click();
      httpTesting
        .expectOne(summaryRetry)
        .flush(
          { error: { code: 'FORBIDDEN', message: 'FORBIDDEN', details: [] } },
          { status: 403, statusText: 'Forbidden' },
        );
      await update();

      expect(fixture.componentInstance.handed).toEqual([{ kind: 'refused' }]);
    });

    it('hands nothing once the section is gone', async () => {
      const warn = vi.spyOn(console, 'warn');
      render(withEmails(failedSummary));
      retryButton().click();
      fixture.componentInstance.shown.set(false);
      fixture.detectChanges();
      httpTesting.expectOne(summaryRetry).flush(pendingSummary);
      await update();

      expect(fixture.componentInstance.handed).toEqual([]);
      // Angular warns of an output emitted by a destroyed component.
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('while an email is being sent', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    async function after(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    }

    it('reads the event again every 10 seconds until none is being sent', async () => {
      const sent: EmailState = { ...sentSummary, sentAt: '2026-11-22T09:20:00.000Z' };
      render(withEmails(pendingSummary));

      await after(9_999);
      httpTesting.expectNone(managed);
      await after(1);
      httpTesting.expectOne(managed).flush(withEmails(pendingSummary));
      await after(0);
      await after(10_000);
      httpTesting.expectOne(managed).flush(withEmails(sent));
      await after(0);

      expect(fixture.componentInstance.handed).toEqual([
        { kind: 'managed', event: withEmails(pendingSummary) },
        { kind: 'managed', event: withEmails(sent) },
      ]);
      expect(rows()[0]?.state).toBe('Enviado el 22 de noviembre de 2026 a las 10:20');
      await after(60_000);
      httpTesting.expectNone(managed);
    });

    it('tries again 10 seconds later when a read does not get through', async () => {
      render(withEmails(pendingSummary));

      await after(10_000);
      httpTesting.expectOne(managed).flush(null, { status: 500, statusText: 'Error' });
      await after(0);
      expect(fixture.componentInstance.handed).toEqual([]);
      await after(10_000);
      httpTesting.expectOne(managed).flush(withEmails(sentSummary));
      await after(0);

      expect(fixture.componentInstance.handed).toHaveLength(1);
    });

    it('reads again while the summary is being sent beside a "Votación cerrada" that waits', async () => {
      render(withEmails(pendingSummary, waitingClosing));

      await after(10_000);
      httpTesting.expectOne(managed).flush(withEmails(sentSummary, waitingClosing));
      await after(0);

      expect(fixture.componentInstance.handed).toEqual([
        { kind: 'managed', event: withEmails(sentSummary, waitingClosing) },
      ]);
    });

    it('drops a read overtaken by a newer event, as one the page confirmed meanwhile', async () => {
      render(withEmails(pendingSummary));
      await after(10_000);
      const read = httpTesting.expectOne(managed);
      fixture.componentInstance.event.set({ ...withEmails(pendingSummary), voters: 3 });
      fixture.detectChanges();
      read.flush(withEmails(pendingSummary));
      await after(0);

      expect(fixture.componentInstance.handed).toEqual([]);
      // The newer event's own round reads it 10 seconds after it was shown.
      await after(10_000);
      httpTesting.expectOne(managed).flush(withEmails(sentSummary));
      await after(0);
      expect(fixture.componentInstance.handed).toEqual([
        { kind: 'managed', event: withEmails(sentSummary) },
      ]);
    });

    it('does not read again after a failed read once the section is gone', async () => {
      render(withEmails(pendingSummary));
      await after(10_000);
      const read = httpTesting.expectOne(managed);
      fixture.componentInstance.shown.set(false);
      fixture.detectChanges();
      read.flush(null, { status: 500, statusText: 'Error' });

      await after(60_000);
      httpTesting.expectNone(managed);
    });

    it('does not read again for an email that only waits for the closing', async () => {
      render(withEmails(sentSummary, waitingClosing));

      await after(60_000);
      httpTesting.expectNone(managed);
    });

    it('stops reading once the section is gone', async () => {
      render(withEmails(pendingSummary));
      fixture.componentInstance.shown.set(false);
      fixture.detectChanges();

      await after(60_000);
      httpTesting.expectNone(managed);
    });

    it('hands nothing read after the section is gone', async () => {
      render(withEmails(pendingSummary));
      await after(10_000);
      const read = httpTesting.expectOne(managed);
      fixture.componentInstance.shown.set(false);
      fixture.detectChanges();
      read.flush(withEmails(sentSummary));
      await after(0);

      expect(fixture.componentInstance.handed).toEqual([]);
    });
  });

  it('styles with the design tokens only', () => {
    expect(literalValues(emailStyles)).toEqual([]);
    expect(literalValues(wellStyles)).toEqual([]);
  });
});
