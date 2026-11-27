import {
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  effect,
  inject,
  model,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { organizerNameEndpoint } from '@qando/contracts';
import {
  type DetailsProblem,
  ORGANIZER_NAME_MAX_LENGTH,
  organizerNameProblem,
} from '@qando/domain';
import { ApiClient } from '../../core/api/api-client';
import { Session } from '../../core/auth/session';
import { CharacterLimit } from '../../shared/ui/character-limit';

/** A name the field proposed, with the email of the account it was proposed for. */
export interface ProposedName {
  /** The organizer name of the account's last event. */
  readonly name: string;
  readonly email: string;
}

/** The sentence of each problem of a name, said under the field once it is refused. */
const SENTENCES: Record<Extract<DetailsProblem['code'], `NAME_${string}`>, string> = {
  NAME_MISSING: 'create.name.missing',
  NAME_TOO_SHORT: 'create.name.tooShort',
  NAME_TOO_LONG: 'create.name.tooLong',
};

/**
 * The organizer's name in the wizard's last step: its label, and a field that stops at what an
 * event allows, counting characters as people see them, with no check once valid. Refused by its
 * holder (`refused`, when the event was to be sent), it says in red under it what the name lacks,
 * by the rule the API applies, until the organizer types again.
 *
 * While it is empty, the cursor out of it, and an account is signed in, it proposes the organizer
 * name of the account's last event, which the organizer can change: asked once for each account,
 * it fills the field once the API has answered, if the field is still empty, the cursor is not in
 * it (the organizer went in to type) and the same account is signed in, and tells its holder (`proposed`, with the account's
 * email). Without a session, an event or an answer, the field stays empty. The holder empties a
 * name proposed for an account that is no longer signed in, and the field then asks for the new one.
 */
@Component({
  selector: 'app-organizer-name-field',
  imports: [CharacterLimit, FormField, TranslocoPipe],
  styleUrl: './organizer-name-field.scss',
  templateUrl: './organizer-name-field.html',
})
export class OrganizerNameField {
  private readonly session = inject(Session);
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  /** The name, as typed or proposed. */
  readonly name = model.required<string>();
  /** The name was refused when the event was to be sent; typing clears it. */
  readonly refused = model(false);
  /** The name of the account's last event, just filled in for the organizer. */
  readonly proposed = output<ProposedName>();

  protected readonly field = form(this.name);
  protected readonly limit = ORGANIZER_NAME_MAX_LENGTH;

  /** The key of what is said under the field: what a refused name lacks; `null` while it is not. */
  protected readonly said = computed<string | null>(() => {
    const problem = this.refused() ? organizerNameProblem(this.name()) : undefined;
    return problem ? SENTENCES[problem.code] : null;
  });

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  /** The email of the account the name was last asked for: each account is asked once. */
  private askedFor: string | null = null;

  constructor() {
    effect(() => {
      const account = this.session.account();
      if (!account || this.name() !== '' || account.email === this.askedFor) return;
      // The organizer is in the field, erasing a name to type another.
      if (this.typing()) return;
      this.askedFor = account.email;
      untracked(() => void this.propose(account.email));
    });
  }

  /** Puts the cursor in the field. */
  focus(): void {
    this.input()?.nativeElement.focus();
  }

  /** The cursor is in the field. */
  private typing(): boolean {
    const field = this.input()?.nativeElement;
    return field !== undefined && document.activeElement === field;
  }

  /** The organizer name of the account of `email`'s last event, in the field if it is still empty. */
  private async propose(email: string): Promise<void> {
    let proposed: string | null;
    try {
      ({ organizerName: proposed } = await this.api.send(organizerNameEndpoint, { params: {} }));
    } catch {
      // The organizer types the name, as without an event.
      return;
    }
    // The answer is of the account asked for, which another may have replaced meanwhile.
    if (proposed === null || this.destroyRef.destroyed) return;
    if (this.session.account()?.email !== email || this.name() !== '') return;
    // The organizer went into the field to type the name.
    if (this.typing()) return;
    this.name.set(proposed);
    this.proposed.emit({ name: proposed, email });
  }
}
