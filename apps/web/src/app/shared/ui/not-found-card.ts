import { Component, type ElementRef, afterNextRender, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The card for an address that leads nowhere (no page of the app, or a link of no event): says
 * so, why that may be, and links to the home page with a round button showing a house. Takes the focus to its heading, so a screen
 * reader follows the page when a refused vote turns it into this card.
 */
@Component({
  selector: 'app-not-found-card',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './not-found-card.scss',
  template: `
    <h1 #heading class="title" tabindex="-1">{{ 'pages.notFound.title' | transloco }}</h1>
    <p class="message">{{ 'pages.notFound.message' | transloco }}</p>
    <a class="home" routerLink="/" [attr.aria-label]="'pages.notFound.homeLink' | transloco">
      <!-- Heroicons outline: home -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    </a>
  `,
})
export class NotFoundCard {
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => {
      this.heading().nativeElement.focus();
    });
  }
}
