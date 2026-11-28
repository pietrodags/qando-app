import { Service, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Toaster } from './toast';

/**
 * Copies an address for the user to paste elsewhere (a vote's own link, the connector's address)
 * and says so in a toast. When the browser refuses (no permission, not a secure page), nothing is
 * copied and nothing is said: the address stays on screen.
 */
@Service()
export class LinkCopier {
  private readonly toaster = inject(Toaster);
  private readonly transloco = inject(TranslocoService);

  async copy(address: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      return;
    }
    this.toaster.show(this.transloco.translate('common.toast.linkCopied'));
  }
}
