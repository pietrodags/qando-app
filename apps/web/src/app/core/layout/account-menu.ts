import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { SignedInAccount } from '@qando/contracts';
import { Toaster } from '../../shared/ui/toast';
import { Session } from '../auth/session';

/**
 * The signed-in account in the header: a round button with the account's initial that opens a
 * small menu under it, with the account's email, "Mis eventos" and "Cerrar sesión". The menu
 * closes with Escape, with a press or the focus anywhere else, and once something is chosen.
 * Signing out ends on the home page with "Has cerrado sesión."; when the server could not end
 * the session, the page stays as it is and says so.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './account-menu.scss',
  templateUrl: './account-menu.html',
  host: {
    '(keydown.escape)': 'closeFromInside()',
    '(document:click)': 'closeFromOutside($event)',
    '(document:focusin)': 'closeFromOutside($event)',
  },
})
export class AccountMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly transloco = inject(TranslocoService);

  readonly account = input.required<SignedInAccount>();

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  protected readonly open = signal(false);
  /** Whom the account is called: its name, or its email until it has one. */
  protected readonly who = computed<string>(
    () => this.account().name.trim() || this.account().email,
  );
  /** The first character of that, whole (a letter with its accent, an emoji), in capitals. */
  protected readonly initial = computed<string>(() =>
    (Array.from(this.who())[0] ?? '').toLocaleUpperCase(),
  );

  /** Closes the open menu from one of its items: the focus goes back to its button. */
  protected closeFromInside(): void {
    if (!this.open()) return;
    this.toggle().nativeElement.focus();
    this.open.set(false);
  }

  /** Closes the menu when the press or the focus is anywhere but in it. */
  protected closeFromOutside({ target }: Event): void {
    if (target instanceof Node && this.host.nativeElement.contains(target)) return;
    this.open.set(false);
  }

  protected async signOut(): Promise<void> {
    this.closeFromInside();
    try {
      await this.session.signOut();
    } catch {
      this.toaster.show(this.transloco.translate('shell.signOutFailed'));
      return;
    }
    await this.router.navigateByUrl('/');
    this.toaster.show(this.transloco.translate('shell.signedOut'));
  }
}
