import { literalValues } from '../../../styles/token-usage';
import cardStyles from './not-found-card.scss' with { loader: 'text' };

// What the card says is tested through the pages that show it (NotFoundPage, VotePage).
describe('NotFoundCard', () => {
  it('styles itself only with design tokens', () => {
    expect(literalValues(cardStyles)).toEqual([]);
  });
});
