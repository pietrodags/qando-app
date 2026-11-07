import { Component } from '@angular/core';
import { NotFoundCard } from '../../shared/ui/not-found-card';

/** Any address that is not a page of the app, such as a link cut short when copied. */
@Component({
  selector: 'app-not-found-page',
  imports: [NotFoundCard],
  styleUrl: './not-found-page.scss',
  template: `
    <main class="page">
      <app-not-found-card />
    </main>
  `,
})
export class NotFoundPage {}
