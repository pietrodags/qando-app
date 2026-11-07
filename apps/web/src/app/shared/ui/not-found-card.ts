import { Component, type ElementRef, afterNextRender, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The card for an address that leads nowhere (no page of the app, or a link of no event): says
 * so, why that may be, and links to the home page. Takes the focus to its heading, so a screen
 * reader follows the page when a refused vote turns it into this card.
 */
@Component({
  selector: 'app-not-found-card',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './not-found-card.scss',
  template: `
    <h1 #heading class="title" tabindex="-1">{{ 'pages.notFound.title' | transloco }}</h1>
    <p class="message">{{ 'pages.notFound.message' | transloco }}</p>
    <a class="home" routerLink="/">{{ 'pages.notFound.homeLink' | transloco }}</a>
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
