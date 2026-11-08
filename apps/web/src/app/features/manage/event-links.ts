import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Toaster } from '../../shared/ui/toast';

/** One link of the event: its name's key, its path, and whether the page can open it. */
interface EventLink {
  readonly name: string;
  readonly path: string;
  readonly opens: boolean;
}

/**
 * The links of an event, for its organizer to pass on: the participation link, to share with
 * the group, and the results link, which also opens here. Each is shown without its protocol
 * and copied in full. The management link is never shown: it is the one the organizer is using.
 */
@Component({
  selector: 'app-event-links',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './event-links.scss',
  template: `
    <h2>{{ 'manage.links.title' | transloco }}</h2>
    <p class="help">{{ 'manage.links.help' | transloco }}</p>
    <ul class="links">
      @for (link of links(); track link.path) {
        <li class="link">
          <span class="name">{{ link.name | transloco }}</span>
          <span class="url">{{ host }}{{ link.path }}</span>
          <span class="actions">
            @if (link.opens) {
              <a class="action" [routerLink]="link.path">{{ 'manage.links.open' | transloco }}</a>
            }
            <button type="button" class="action" (click)="copy(link.path)">
              {{ 'manage.links.copy' | transloco }}
            </button>
          </span>
        </li>
      }
    </ul>
  `,
})
export class EventLinks {
  readonly participationId = input.required<string>();
  readonly resultsId = input.required<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly toaster = inject(Toaster);
  protected readonly host = location.host;

  protected readonly links = computed<readonly EventLink[]>(() => [
    { name: 'manage.links.vote', path: `/vote/${this.participationId()}`, opens: false },
    { name: 'manage.links.results', path: `/results/${this.resultsId()}`, opens: true },
  ]);

  protected async copy(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${location.origin}${path}`);
    } catch {
      // The browser refused (no permission, not a secure page): nothing was copied.
      return;
    }
    this.toaster.show(this.transloco.translate('common.toast.linkCopied'));
  }
}
