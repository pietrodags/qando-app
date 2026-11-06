import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Toaster } from '../../shared/ui/toast';
import { capitalised, longDate } from './display';

/**
 * The thank-you card after voting (green, with a white check): the vote is registered, when the
 * organizer will tell the date, and how to change the vote: the same link in this browser, or
 * the private edit link, opened or copied, from another one. Takes the focus to its heading, so
 * a screen reader follows the page's change.
 */
@Component({
  selector: 'app-vote-thanks',
  imports: [TranslocoPipe],
  styleUrl: './vote-thanks.scss',
  templateUrl: './vote-thanks.html',
})
export class VoteThanks {
  readonly organizerName = input.required<string>();
  /** The event's deadline, ISO: the organizer tells the date from then on. */
  readonly deadline = input.required<string>();
  /** The private edit link, a path: `/vote/:id/my-vote#t=<token>`. */
  readonly editLink = input.required<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  private readonly toaster = inject(Toaster);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly organizer = computed(() => capitalised(this.organizerName(), this.locale));
  protected readonly from = computed(() => longDate(this.deadline(), this.locale));

  constructor() {
    afterNextRender(() => {
      this.heading().nativeElement.focus();
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${location.origin}${this.editLink()}`);
    } catch {
      // The browser refused (no permission, not a secure page): the link stays on the button.
      return;
    }
    this.toaster.show(this.transloco.translate('common.toast.linkCopied'));
  }
}
