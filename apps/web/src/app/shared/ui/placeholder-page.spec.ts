import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { PlaceholderPage } from './placeholder-page';
import pageStyles from './placeholder-page.scss' with { loader: 'text' };

describe('PlaceholderPage', () => {
  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('shows the title of its route and says the page is being built', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideRouter([
          { path: 'profile', title: 'pages.profile.title', component: PlaceholderPage },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();

    const element = await harness
      .navigateByUrl('/profile', PlaceholderPage)
      .then(() => harness.routeNativeElement);

    expect(element?.querySelector('h1')?.textContent.trim()).toBe('Perfil');
    expect(element?.querySelector('p')?.textContent.trim()).toBe(
      'Esta página está en construcción.',
    );
  });
});
