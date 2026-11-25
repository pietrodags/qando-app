import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, type Params, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { Session } from '../auth/session';
import { signInFrom } from '../auth/sign-in-return';
import { AccountMenu } from './account-menu';

/**
 * Header of every page: the logo back to the home page and, at the other end, the account signed
 * in with its menu, or the "Entrar" icon, which asks the sign-in page to come back to the page
 * it is pressed on. Until it is known whether there is a session that end stays empty, so
 * "Entrar" never shows for a moment to someone signed in.
 */
@Component({
  selector: 'app-header',
  imports: [AccountMenu, NgOptimizedImage, RouterLink, TranslocoPipe],
  styleUrl: './app-header.scss',
  templateUrl: './app-header.html',
})
export class AppHeader {
  private readonly router = inject(Router);
  protected readonly session = inject(Session);

  /** The address of the page shown, after each navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly signInQuery = computed<Params>(() => signInFrom(this.url()));
}
