import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { signInFrom } from '../auth/sign-in-return';

/**
 * Header of every page: the logo back to the home page and the "Entrar" icon, which asks the
 * sign-in page to come back to the page it is pressed on.
 */
@Component({
  selector: 'app-header',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  styleUrl: './app-header.scss',
  templateUrl: './app-header.html',
})
export class AppHeader {
  private readonly router = inject(Router);

  /** The address of the page shown, after each navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly signInQuery = computed<{ returnTo?: string }>(() => signInFrom(this.url()));
}
