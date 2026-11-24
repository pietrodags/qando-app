import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CodeStep, type CodeActions } from '../../shared/ui/code-step';
import { Dialog } from '../../shared/ui/dialog';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { Toaster } from '../../shared/ui/toast';
import { requestFailure, waiting } from '../api/request-failure';
import { Session } from '../auth/session';

/**
 * Deleting the signed-in account, in a dialog of two steps. First the question: what goes with
 * the account (all its events) and that a code will be sent to its email; "Enviar código" sends
 * it, saying so on its button and again under it when it could not. Then the code, as when
 * signing in: the last digit deletes the account, and the home page opens, signed out, saying
 * what went with it. "Volver" closes it from either step; while the code is checked nothing
 * closes it. When the server knows no session any more (it ended, or a deletion whose answer
 * was lost went through), the home page opens, signed out, saying how to check.
 */
@Component({
  selector: 'app-account-deletion',
  imports: [CodeStep, Dialog, FailureNotice, TranslocoPipe],
  styleUrl: './account-deletion.scss',
  templateUrl: './account-deletion.html',
})
export class AccountDeletion {
  /** The account's email, where the code goes. */
  readonly email = input.required<string>();
  /** It was closed: the page removes it. */
  readonly closed = output();

  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = viewChild.required(Dialog);
  private readonly step = viewChild(CodeStep);

  /** The code is being checked: the dialog is not left before the answer is known. */
  protected readonly checking = computed<boolean>(() => this.step()?.checking() ?? false);

  /** The seconds to wait before a new code, once the first was sent; null on the question. */
  protected readonly sent = signal<number | null>(null);
  protected readonly sending = signal(false);
  private readonly sendError = signal<unknown>(null);
  protected readonly sendFailure = requestFailure(this.sendError);
  /** The code can be sent now: not while it is on its way, nor while a limit lasts. */
  protected readonly canSend = computed<boolean>(
    () => !this.sending() && !waiting(this.sendFailure()),
  );

  /**
   * The code deletes the account; what follows does not need this dialog, which goes with the
   * account's menu once the session is forgotten.
   */
  protected readonly actions: CodeActions = {
    use: async (code) => {
      const events = await this.session.deleteAccount(code);
      await this.leave(
        events === null
          ? this.transloco.translate('deleteAccount.signedOut')
          : this.transloco.translate('deleteAccount.deleted', { events }),
      );
    },
    send: () => this.sendCode(),
  };

  /** Sends the first code; the code step follows once it is delivered. */
  protected async sendFirst(): Promise<void> {
    if (!this.canSend()) return;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      this.sent.set(await this.sendCode());
    } catch (error) {
      this.sendError.set(error);
    } finally {
      this.sending.set(false);
    }
  }

  protected back(): void {
    this.dialog().close();
  }

  /**
   * Sends a code to the account's email: the seconds until another may be asked. When the server
   * knew no session any more it leaves instead, and never settles: the dialog goes with the
   * session's menu.
   */
  private async sendCode(): Promise<number> {
    const resendAfterSeconds = await this.session.sendDeletionCode();
    if (resendAfterSeconds !== null) return resendAfterSeconds;
    await this.leave(this.transloco.translate('deleteAccount.signedOut'));
    return new Promise<never>(() => undefined);
  }

  /** Opens the home page, signed out, and says `message` there. */
  private async leave(message: string): Promise<void> {
    await this.router.navigateByUrl('/');
    this.toaster.show(message);
  }
}
