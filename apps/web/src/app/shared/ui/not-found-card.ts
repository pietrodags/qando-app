import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The card for an address that leads nowhere (no page of the app, or a link of no event): says
 * so, why that may be, and links to the home page.
 */
@Component({
  selector: 'app-not-found-card',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './not-found-card.scss',
  template: `
    <h1 class="title">{{ 'pages.notFound.title' | transloco }}</h1>
    <p class="message">{{ 'pages.notFound.message' | transloco }}</p>
    <a class="home" routerLink="/">{{ 'pages.notFound.homeLink' | transloco }}</a>
  `,
})
export class NotFoundCard {}
