import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Header of every page: the logo back to the home page and "Entrar". */
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
      <a class="sign-in" routerLink="/sign-in">{{ 'shell.signIn' | transloco }}</a>
    </header>
  `,
})
export class AppHeader {}
