import { Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { sendSignInCodeEndpoint, signInEndpoint } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { Session } from '../../core/auth/session';
import { type CodeActions, CodeStep } from '../../shared/ui/code-step';

/**
 * The step that signs in with the code emailed to `email`, inside its page's card: the code step
 * (`CodeStep`) whose complete code signs in and whose new code is a sign-in code, and under it the
 * way back to a mistyped email. On the sign-in page its heading is the page's; inside the
 * creation wizard (`purpose` "create") it is one of the wizard's, and the last digit is said to
 * create the event, which its page sends once signed in.
 */
@Component({
  selector: 'app-sign-in-code',
  imports: [CodeStep, TranslocoPipe],
  styleUrl: './sign-in-code.scss',
  templateUrl: './sign-in-code.html',
})
export class SignInCode {
  /** The email the code was sent to, as the API took it. */
  readonly email = input.required<string>();
  /** The seconds to wait before a new code can be asked, as answered with the code just sent. */
  readonly resendAfterSeconds = input.required<number>();
  /** Where the step is: the sign-in page, or the creation wizard's last step. */
  readonly purpose = input<'sign-in' | 'create'>('sign-in');
  /** The name the account takes if this code creates it; none unless given. */
  readonly name = input<string>();
  /** The code was right: the browser holds the session. */
  readonly signedIn = output();
  /** The person wants to correct the email ("Cambiar email"). */
  readonly changeEmail = output();
  /** A new code was sent: the seconds until another may be asked. */
  readonly codeSent = output<number>();

  private readonly api = inject(ApiClient);
  private readonly session = inject(Session);

  /** A complete code signs in; a new code is a sign-in code for the same email. */
  protected readonly actions: CodeActions = {
    use: async (code) => {
      await this.api.send(signInEndpoint, {
        params: {},
        body: { email: this.email(), code, name: this.name() },
      });
      // The page told next finds the session's account already known.
      await this.session.refresh();
      this.signedIn.emit();
    },
    send: async () => {
      const sent = await this.api.send(sendSignInCodeEndpoint, {
        params: {},
        body: { email: this.email() },
      });
      this.codeSent.emit(sent.resendAfterSeconds);
      return sent.resendAfterSeconds;
    },
  };
}
