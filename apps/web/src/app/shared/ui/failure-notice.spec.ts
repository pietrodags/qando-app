import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { RequestFailure } from '../../core/api/request-failure';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { FailureNotice } from './failure-notice';
import noticeStyles from './failure-notice.scss' with { loader: 'text' };

describe('FailureNotice', () => {
  async function render(failure: RequestFailure | null): Promise<ComponentFixture<FailureNotice>> {
    TestBed.configureTestingModule({ imports: [FailureNotice], providers: [provideI18n()] });
    const fixture = TestBed.createComponent(FailureNotice);
    fixture.componentRef.setInput('failure', failure);
    fixture.componentRef.setInput('failedKey', 'vote.confirm.sendError');
    fixture.componentRef.setInput('waitKey', 'vote.confirm.rateLimited');
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<FailureNotice>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The text read out when it appears. */
  function alerted(fixture: ComponentFixture<FailureNotice>): string[] {
    return Array.from(element(fixture).querySelectorAll('[role="alert"]'), (alert) =>
      alert.textContent.trim().replace(/\s+/g, ' '),
    );
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(noticeStyles)).toEqual([]);
  });

  it('says nothing without a failure', async () => {
    const fixture = await render(null);

    expect(element(fixture).textContent.trim()).toBe('');
  });

  it('alerts a failure that trying again may fix', async () => {
    const fixture = await render({ kind: 'failed' });

    expect(alerted(fixture)).toEqual(['No se ha podido enviar tu voto. Inténtalo de nuevo.']);
  });

  /** The count the page shows, hidden from screen readers. */
  function shownCount(fixture: ComponentFixture<FailureNotice>): string | undefined {
    return element(fixture).querySelector('[aria-hidden="true"]')?.textContent.trim();
  }

  it('alerts a rate limit once, with the seconds it starts with, and shows the count', async () => {
    const fixture = await render({ kind: 'limited', seconds: 42 });

    expect(alerted(fixture)).toEqual([
      'Hay demasiadas visitas desde tu red en este momento. Podrás enviar tu voto en 42 s.',
    ]);
    expect(shownCount(fixture)).toBe('Podrás enviar tu voto en 42 s.');
  });

  it('counts down where only the eye reads it: what screen readers hear never changes', async () => {
    // A change inside an alert (or an alertdialog, as the bubble that sends the vote) is read
    // again: a count that changes each second would be cut off and restarted each second.
    const fixture = await render({ kind: 'limited', seconds: 42 });
    fixture.componentRef.setInput('failure', { kind: 'limited', seconds: 41 });
    await fixture.whenStable();

    expect(alerted(fixture)).toEqual([
      'Hay demasiadas visitas desde tu red en este momento. Podrás enviar tu voto en 42 s.',
    ]);
    expect(shownCount(fixture)).toBe('Podrás enviar tu voto en 41 s.');
  });

  it('alerts a new rate limit with its own seconds once the previous one is over', async () => {
    const fixture = await render({ kind: 'limited', seconds: 42 });
    fixture.componentRef.setInput('failure', { kind: 'limited', seconds: 0 });
    await fixture.whenStable();
    fixture.componentRef.setInput('failure', { kind: 'limited', seconds: 30 });
    await fixture.whenStable();

    expect(alerted(fixture)).toEqual([
      'Hay demasiadas visitas desde tu red en este momento. Podrás enviar tu voto en 30 s.',
    ]);
  });

  it('alerts a rate limit that follows a plain failure with its own seconds', async () => {
    const fixture = await render({ kind: 'failed' });
    fixture.componentRef.setInput('failure', { kind: 'limited', seconds: 30 });
    await fixture.whenStable();

    expect(alerted(fixture)).toEqual([
      'Hay demasiadas visitas desde tu red en este momento. Podrás enviar tu voto en 30 s.',
    ]);
  });

  it('goes once the rate limit is over', async () => {
    const fixture = await render({ kind: 'limited', seconds: 0 });

    expect(element(fixture).textContent.trim()).toBe('');
  });
});
