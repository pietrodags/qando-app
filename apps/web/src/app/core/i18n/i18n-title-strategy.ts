import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/**
 * A route's `title` is a catalogue key. The browser tab reads "<page> | qando",
 * or just "qando" on a route without a title.
 */
@Injectable()
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    if (key === undefined) {
      this.title.setTitle(this.transloco.translate('common.brand'));
      return;
    }
    const page: string = this.transloco.translate(key);
    this.title.setTitle(this.transloco.translate('shell.documentTitle', { page }));
  }
}
