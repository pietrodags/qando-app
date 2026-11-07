import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Toaster } from './toast';

/**
 * Shares a link: "Compartir" opens the device's share sheet, and a row always under it opens
 * WhatsApp or Telegram in a new tab, writes an email or copies the link (the toast confirms).
 * Without a share sheet, "Compartir" points to that row. Every channel carries the same title,
 * text and link, as given.
 */
@Component({
  selector: 'app-share-links',
  imports: [TranslocoPipe],
  styleUrl: './share-links.scss',
  templateUrl: './share-links.html',
})
export class ShareLinks {
  /** The subject of the email and the title of the share sheet. */
  readonly title = input.required<string>();
  /** The message, already translated; the link follows it. */
  readonly text = input.required<string>();
  /** The absolute link to share. */
  readonly url = input.required<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly toaster = inject(Toaster);

  private readonly message = computed(() => `${this.text()}\n\n${this.url()}`);
  protected readonly whatsapp = computed<string>(
    () => `https://wa.me/?text=${encodeURIComponent(this.message())}`,
  );
  protected readonly telegram = computed<string>(
    () =>
      `https://t.me/share/url?url=${encodeURIComponent(this.url())}&text=${encodeURIComponent(this.text())}`,
  );
  protected readonly email = computed<string>(
    () =>
      `mailto:?subject=${encodeURIComponent(this.title())}&body=${encodeURIComponent(this.message())}`,
  );

  protected async share(): Promise<void> {
    const data: ShareData = { title: this.title(), text: this.text(), url: this.url() };
    // `canShare` came after `share`: a browser without it still has the share sheet.
    const shareable = 'canShare' in navigator ? navigator.canShare(data) : true;
    if (!('share' in navigator) || !shareable) {
      this.toaster.show(this.transloco.translate('common.toast.useShareButtons'));
      return;
    }
    try {
      await navigator.share(data);
    } catch {
      // Closed by the user, or refused by the device: the row below is still there.
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
    } catch {
      // The browser refused (no permission, not a secure page): nothing was copied.
      return;
    }
    this.toaster.show(this.transloco.translate('common.toast.linkCopied'));
  }
}
