import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { NotFoundCard } from './not-found-card';
import cardStyles from './not-found-card.scss' with { loader: 'text' };

// What the card says is tested through the pages that show it (NotFoundPage, VotePage).
describe('NotFoundCard', () => {
  it('styles itself only with design tokens', () => {
    expect(literalValues(cardStyles)).toEqual([]);
  });

  it('takes the focus to its heading, so a screen reader follows the change', async () => {
    TestBed.configureTestingModule({
      imports: [NotFoundCard],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(NotFoundCard);
    await fixture.whenStable();
    TestBed.tick();

    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });
});
