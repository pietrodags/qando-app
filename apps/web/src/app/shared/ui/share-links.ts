import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Toaster } from './toast';

/**
 * Shares a link: "Compartir" opens the device's share sheet, and a row always under it opens
 * WhatsApp or Telegram in a new tab, writes an email or copies the link (the toast confirms).
 * Without a share sheet, "Compartir" points to that row. Every channel carries the same title,
 * text and link, as given. Given no link, it shares the text alone, a message with nothing to
 * open, and its copy button copies the message.
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
  /** The absolute link to share; without one, the text goes alone. */
  readonly url = input<string>();

  private readonly transloco = inject(TranslocoService);
  private readonly toaster = inject(Toaster);

  private readonly message = computed(() => {
    const url = this.url();
    return url === undefined ? this.text() : `${this.text()}\n\n${url}`;
  });
  protected readonly whatsapp = computed<string>(
    () => `https://wa.me/?text=${encodeURIComponent(this.message())}`,
  );
  protected readonly telegram = computed<string>(() => {
    const url = this.url();
    // Telegram shares an address: with none, the text takes its place.
    return url === undefined
      ? `https://t.me/share/url?url=${encodeURIComponent(this.text())}`
      : `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(this.text())}`;
  });
  /** What the copy button copies, the link or else the message: its name, in the catalogue. */
  protected readonly copyName = computed<string>(() =>
    this.url() === undefined ? 'common.share.copyText' : 'common.share.copyLink',
  );
  protected readonly email = computed<string>(
    () =>
      `mailto:?subject=${encodeURIComponent(this.title())}&body=${encodeURIComponent(this.message())}`,
  );

  protected async share(): Promise<void> {
    const url = this.url();
    const data: ShareData =
      url === undefined
        ? { title: this.title(), text: this.text() }
        : { title: this.title(), text: this.text(), url };
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
    const url = this.url();
    try {
      await navigator.clipboard.writeText(url ?? this.text());
    } catch {
      // The browser refused (no permission, not a secure page): nothing was copied.
      return;
    }
    const told = url === undefined ? 'common.toast.textCopied' : 'common.toast.linkCopied';
    this.toaster.show(this.transloco.translate(told));
  }
}
