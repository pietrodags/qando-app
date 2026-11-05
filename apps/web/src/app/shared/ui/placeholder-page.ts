import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Stands in for a sitemap view until its story is built; shows the route's title. */
@Component({
  selector: 'app-placeholder-page',
  imports: [TranslocoPipe],
  styleUrl: './placeholder-page.scss',
  template: `
    <main class="page">
      <h1 class="title">{{ titleKey | transloco }}</h1>
      <p class="message">{{ 'pages.placeholder' | transloco }}</p>
    </main>
  `,
})
export class PlaceholderPage {
  protected readonly titleKey = inject(ActivatedRoute).snapshot.title ?? 'common.brand';
}
