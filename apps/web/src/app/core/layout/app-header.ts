import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Header of every page: the logo back to the home page and the "Entrar" icon. */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './app-header.scss',
  template: `
    <header class="header">
      <a class="logo-link" routerLink="/">
        <img class="logo" src="/logo.svg" [alt]="'common.logoAlt' | transloco" />
      </a>
      <a class="sign-in" routerLink="/sign-in" [attr.aria-label]="'shell.signIn' | transloco">
        <!-- Heroicons outline: arrow-right-end-on-rectangle -->
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
          />
        </svg>
      </a>
    </header>
  `,
})
export class AppHeader {}
