import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Any address that is not a page of the app, such as a link cut short when copied. */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './not-found-page.scss',
  template: `
    <main class="page">
      <section class="card">
        <h1 class="title">{{ 'pages.notFound.title' | transloco }}</h1>
        <p class="message">{{ 'pages.notFound.message' | transloco }}</p>
        <a class="home" routerLink="/">{{ 'pages.notFound.homeLink' | transloco }}</a>
      </section>
    </main>
  `,
})
export class NotFoundPage {}
