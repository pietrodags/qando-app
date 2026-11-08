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
      alert.textContent.trim(),
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

  it('tells a rate limit and the seconds left, alerting only what does not change', async () => {
    const fixture = await render({ kind: 'limited', seconds: 42 });

    expect(element(fixture).textContent.trim().replace(/\s+/g, ' ')).toBe(
      'Hay demasiadas visitas desde tu red en este momento. Podrás enviar tu voto en 42 s.',
    );
    expect(alerted(fixture)).toEqual(['Hay demasiadas visitas desde tu red en este momento.']);
  });

  it('goes once the rate limit is over', async () => {
    const fixture = await render({ kind: 'limited', seconds: 0 });

    expect(element(fixture).textContent.trim()).toBe('');
  });
});
