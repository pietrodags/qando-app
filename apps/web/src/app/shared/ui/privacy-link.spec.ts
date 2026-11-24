import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { PrivacyLink } from './privacy-link';
import linkStyles from './privacy-link.scss' with { loader: 'text' };

describe('PrivacyLink', () => {
  async function render(): Promise<HTMLAnchorElement> {
    TestBed.configureTestingModule({
      imports: [PrivacyLink],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(PrivacyLink);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('a')!;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(linkStyles)).toEqual([]);
  });

  it('links to "Privacidad y condiciones"', async () => {
    const link = await render();

    expect(link.textContent.trim()).toBe('Privacidad y condiciones');
    expect(link.getAttribute('href')).toBe('/privacy');
  });

  it('opens it in a new tab, so nothing typed in the form beside it is lost', async () => {
    const link = await render();

    expect(link.getAttribute('target')).toBe('_blank');
  });
});
