import {
  Component,
  type ElementRef,
  Injector,
  type WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, submit, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  createEventEndpoint,
  sendSignInCodeEndpoint,
  signInCodeBodySchema,
} from '@qando/contracts';
import {
  type EventDetails,
  NOTE_MAX_LENGTH,
  type ProposedOption,
  closesAfterFirstOption,
  countCharacters,
  firstOptionDay,
  organizerNameProblem,
  suggestedDeadline,
} from '@qando/domain';
import { ApiClient } from '../../core/api/api-client';
import { apiError } from '../../core/api/api-resource';
import { newCapabilityToken } from '../../core/api/capability-token';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { ManagementTokens } from '../../core/auth/management-tokens';
import { Session } from '../../core/auth/session';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { CharacterLimit } from '../../shared/ui/character-limit';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { PrivacyLink } from '../../shared/ui/privacy-link';
import { Switch } from '../../shared/ui/switch';
import { Toaster } from '../../shared/ui/toast';
import { Tooltip } from '../../shared/ui/tooltip';
import { SignInCode } from '../sign-in/sign-in-code';
import { type DateSelection, proposedOptions } from './date-selection';
import { DeadlineField } from './deadline-field';
import { OrganizerNameField, type ProposedName } from './organizer-name-field';
import { today } from './today';

/** What the last step asks, held by the page so it outlives the step folding away. */
export interface EventEnding {
  /** The deadline the organizer chose, `YYYY-MM-DD`; `null` while it is the suggested one. */
  readonly deadline: string | null;
  /** The note for the participants, as typed. */
  readonly note: string;
  /** Participants vote without a name. */
  readonly anonymous: boolean;
  /** The email typed without a session, which the summary and the results go to. */
  readonly email: string;
}

/** Nothing asked yet: the suggested deadline, no note, voting with names and no email. */
export const NO_ENDING: EventEnding = { deadline: null, note: '', anonymous: false, email: '' };

/** A sign-in code sent from the last step and waited for, so the event can be created. */
export interface CodeWait {
  /** The email it was sent to, as the API took it. */
  readonly email: string;
  /** When another code may be asked, in milliseconds since the epoch. */
  readonly resendAt: number;
  /** It was sent because the session ended while the wizard was being filled in. */
  readonly sessionExpired: boolean;
}

/**
 * The event as it was last sent, and the management token it was sent with, held by the page.
 * Sending the same event again repeats the token, so an answer lost on the way leaves one event;
 * an event that has changed since is another event, with a token of its own.
 */
export interface SentEvent {
  /** The management token it was sent with. */
  readonly token: string;
  /** What was sent, as written in the request. */
  readonly body: string;
}

/** An event just created: what "¡Hecho!" shows of it. */
export interface CreatedEvent {
  /** The ID of its participation link, which is also its management page's. */
  readonly participationId: string;
  /** The deadline it was created with, `YYYY-MM-DD`. */
  readonly deadline: string;
}

/**
 * The last step of the creation wizard, inside its card: the deadline (`DeadlineField`), a note
 * for the participants folded under its question on the row of anonymous voting, the organizer's
 * name (`OrganizerNameField`, which may propose the account's last one: the page is told,
 * `proposed`) and, for an organizer signed in, the email the summary and the results go to,
 * centered without its label; then the round arrow back and the round "Crear" (✓). While the
 * organizer has not chosen a deadline it is the suggested one (`suggestedDeadline`), which
 * follows the dates; once chosen it is kept. When voting would close on or after the first date
 * proposed, an amber line under the selects says so, naming that date; it does not stop the
 * event. The note opens three rows tall (unfolded from the start when it holds a note), the
 * cursor going into it, stops at 150 characters as people see them, a count under it, and grows
 * with its text. Anonymous voting has an ⓘ that opens what it means in a tip, closed again by
 * the ⓘ, Escape or a press anywhere else. "Crear" with a name an event cannot have says so under
 * the name, and the cursor goes there first, then to an email that is not an address.
 *
 * "Crear" sends the event with the session (`ApiClient`) and a management token: the one it was
 * last sent with when it has not changed since (`SentEvent`), so a send repeated after a lost
 * answer stores no second event, else a new one; meanwhile its ✓ is a spinner, the fields are dimmed and off, the arrow back is off and the page
 * is told (`sending`), so it can keep the other steps closed. Created, the token is kept in this
 * browser (`ManagementTokens`) and the page is told (`created`). Any failure keeps everything as
 * it was and says so under the buttons, with "Reintentar", which sends again with the focus on
 * "Crear"; a token that holds an event of another account (sent before signing in as someone
 * else) is not sent again.
 *
 * Without a session the step asks for the email the summary and the results go to, and "Crear"
 * first sends it a sign-in code, by the API's rule for an email (one that is not an address is
 * said so, nothing sent, until it changes); a code not sent says why under the buttons. The step
 * then asks for the code (`SignInCode`, which signs in, naming a new account with this step's name), without
 * its arrows, "Cambiar email" being the way back with everything kept; signed in, the event is
 * sent as for an organizer signed in. A session that ended while the wizard was filled in (the
 * API answers `401`) sends its email a code at once and says so above it. The code waited for is
 * held by the page (`code`), so the page opened again comes back to it; signing in another way
 * meanwhile drops it. An organizer signed in can sign out under the email ("¿No eres tú? Cerrar
 * sesión"): the step stays, asking for an email (the name first, when the page emptied the one
 * proposed for that account), and the event sent before is another's.
 */
@Component({
  selector: 'app-wizard-finish',
  imports: [
    CharacterLimit,
    DeadlineField,
    FailureNotice,
    FormField,
    FormRoot,
    OrganizerNameField,
    PrivacyLink,
    SignInCode,
    Switch,
    Tooltip,
    TranslocoPipe,
  ],
  styleUrl: './wizard-finish.scss',
  templateUrl: './wizard-finish.html',
  host: {
    '(keydown.escape)': 'helpOpen.set(false)',
    '(document:click)': 'clicked($event)',
  },
})
export class WizardFinish {
  /** The organizer's name, which this step asks, and the event's title (step 1). */
  readonly details = model.required<EventDetails>();
  /** The dates chosen, and their times. */
  readonly selection = input.required<DateSelection>();
  /** The step's number (its card is named "último paso"): the arrow goes back to the one before. */
  readonly step = input.required<number>();
  /** What the step asks, held by the page. */
  readonly ending = model.required<EventEnding>();
  /** The event as last sent and its management token, held by the page; `null` before a send. */
  readonly sent = model.required<SentEvent | null>();
  /** The sign-in code waited for, held by the page; `null` while the step asks its fields. */
  readonly code = model.required<CodeWait | null>();
  /** The organizer goes back to the step before. */
  readonly back = output();
  /** The event is being sent (`true`), or its answer has come (`false`). */
  readonly sending = output<boolean>();
  /** The event is created. */
  readonly created = output<CreatedEvent>();
  /** The name of the account's last event, just proposed in the name field. */
  readonly proposed = output<ProposedName>();

  private readonly api = inject(ApiClient);
  private readonly tokens = inject(ManagementTokens);
  private readonly session = inject(Session);
  private readonly toaster = inject(Toaster);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly words: CalendarWords = calendarWords(this.transloco.getActiveLang());
  /** The account signed in, whose email the summary and the results go to. */
  protected readonly account = this.session.account;
  protected readonly noteMax = NOTE_MAX_LENGTH;

  /** The name typed was refused when the form was sent: missing or too short. */
  protected readonly nameRefused = signal(false);
  /** The email typed was refused when the form was sent: not an address. */
  protected readonly emailRefused = signal(false);

  /** The name lacks something by the API's rule. */
  private readonly nameWrong = computed<boolean>(
    () => organizerNameProblem(this.details().organizerName) !== undefined,
  );
  /** Without a session, the email typed is not an address by the API's rule. */
  private readonly emailWrong = computed<boolean>(
    () =>
      !this.account() && !signInCodeBodySchema.safeParse({ email: this.ending().email }).success,
  );

  /**
   * The last step's fields; sending the form ("Crear") creates the event, or first sends a code
   * to the email typed without a session. The organizer's name must be one an event can have, and
   * the email an address; otherwise each says so, and the cursor goes to the first.
   */
  protected readonly fields = form(
    this.ending,
    (path) => {
      validate(path, () => (this.nameWrong() ? { kind: 'name' } : null));
      validate(path.email, () => (this.emailWrong() ? { kind: 'email' } : null));
    },
    {
      submission: {
        action: () => this.send(),
        onInvalid: () => {
          this.nameRefused.set(this.nameWrong());
          this.emailRefused.set(this.emailWrong());
          if (this.nameWrong()) this.focusName();
          else this.focusEmail();
        },
      },
    },
  );

  /** The event is on its way: "Crear" waits, and everything else is off. */
  protected readonly busy = computed<boolean>(() => this.fields().submitting());
  /** The last sending failed. */
  protected readonly failed = signal(false);
  private readonly codeError = signal<unknown>(null);
  /** Why the last code was not sent, a limit counting down included; `null` when it was. */
  protected readonly codeFailure = requestFailure(this.codeError);
  /** The seconds left, when the code step opens, before another code may be asked. */
  protected readonly secondsToResend = computed<number>(() => {
    const wait = this.code();
    return wait ? Math.max(0, Math.ceil((wait.resendAt - Date.now()) / 1000)) : 0;
  });
  /** The tip of anonymous voting is open. */
  protected readonly helpOpen = signal(false);

  /** Today, as the clock said when it was last read. */
  private readonly firstDay = signal<string>(today());
  private readonly options = computed<ProposedOption[]>(() => proposedOptions(this.selection()));
  /** The deadline shown: the one chosen, or else the one suggested for the dates. */
  protected readonly deadline = computed<string>(
    () => this.ending().deadline ?? suggestedDeadline(this.options(), this.firstDay()),
  );
  /** The warning that voting closes after the first date, naming it; `null` when it does not. */
  protected readonly afterFirst = computed<{ weekday: string; day: string } | null>(() => {
    const first = firstOptionDay(this.options());
    if (first === null || !closesAfterFirstOption(this.deadline(), this.options())) return null;
    return {
      weekday: this.words.weekday(first),
      day: this.words.dayOfMonth(first, this.firstDay()),
    };
  });
  /** The note's characters as people see them, as its limit counts them. */
  protected readonly noteCount = computed<number>(() => countCharacters(this.ending().note.trim()));

  // Only on the page while the step asks its fields, not on the code step.
  private readonly createButton = viewChild<ElementRef<HTMLButtonElement>>('create');
  private readonly infoButton = viewChild<ElementRef<HTMLButtonElement>>('info');
  private readonly emailField = viewChild<ElementRef<HTMLInputElement>>('emailField');
  private readonly nameField = viewChild(OrganizerNameField);
  private readonly noteField = viewChild<ElementRef<HTMLTextAreaElement>>('noteField');

  /** The note is unfolded under its question: at first only when the page holds one. */
  protected readonly noteOpen: WritableSignal<boolean> = linkedSignal<EventEnding, boolean>({
    source: this.ending,
    computation: (ending, previous) => previous?.value ?? ending.note !== '',
  });

  constructor() {
    // Signed in another way while a code was waited for: the event needs it no more.
    effect(() => {
      if (this.account() && untracked(this.code)) this.code.set(null);
    });
  }

  /** A deadline chosen in its selects: from now on it is the deadline. */
  protected choose(deadline: string): void {
    this.ending.update((ending) => ({ ...ending, deadline }));
  }

  /** The name typed or proposed in its field. */
  protected setName(organizerName: string): void {
    this.details.update((details) => ({ ...details, organizerName }));
  }

  /** The note's question folds and unfolds it; unfolded, the cursor goes into it. */
  protected toggleNote(): void {
    this.noteOpen.update((open) => !open);
    if (!this.noteOpen()) return;
    afterNextRender(
      () => {
        this.noteField()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected setAnonymous(anonymous: boolean): void {
    this.ending.update((ending) => ({ ...ending, anonymous }));
  }

  /** "Reintentar": the event is sent again, the focus on "Crear", which shows it waits. */
  protected retry(): void {
    this.createButton()?.nativeElement.focus();
    void submit(this.fields);
  }

  /** A press anywhere but on the ⓘ closes its tip. */
  protected clicked(event: Event): void {
    if (event.target instanceof Node && this.infoButton()?.nativeElement.contains(event.target))
      return;
    this.helpOpen.set(false);
  }

  /**
   * The email typed changed: what was said of the one before (not an address, or a limit of
   * codes, which the API counts per email) is said no more.
   */
  protected emailChanged(): void {
    this.emailRefused.set(false);
    this.codeError.set(null);
  }

  /** The code was right: back on the step, signed in, the event is sent, the focus on "Crear". */
  protected signedIn(): void {
    this.code.set(null);
    afterNextRender(
      () => {
        this.createButton()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
    void submit(this.fields);
  }

  /** "Cambiar email": back on the step, the email as typed and the cursor in it. */
  protected changeEmail(): void {
    this.code.set(null);
    this.focusEmail();
  }

  /** A new code sent from the code step: the page holds when another may be asked. */
  protected codeSent(resendAfterSeconds: number): void {
    this.code.update((wait) => wait && { ...wait, resendAt: inSeconds(resendAfterSeconds) });
  }

  /** "¿No eres tú? Cerrar sesión": the step stays and asks for the email of whoever creates. */
  protected async signOut(): Promise<void> {
    try {
      await this.session.signOut();
    } catch {
      this.toaster.show(this.transloco.translate('shell.signOutFailed'));
      return;
    }
    this.ending.update((ending) => ({ ...ending, email: '' }));
    this.sent.set(null);
    // What was said of the account signed out's sending is said no more.
    this.failed.set(false);
    this.codeError.set(null);
    this.toaster.show(this.transloco.translate('shell.signedOut'));
    // The page empties a name proposed for the account signed out: then the name is asked first.
    afterNextRender(
      () => {
        if (this.details().organizerName === '') this.nameField()?.focus();
        else this.emailField()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * "Crear": the event, for an organizer signed in, or else a code to the email typed; the page
   * is told it is on its way until all of it has ended. A session that ended meanwhile sends a
   * code to its email.
   */
  private async send(): Promise<undefined> {
    this.sending.emit(true);
    const created = await this.sendWhoever().finally(() => {
      this.sending.emit(false);
    });
    // Last: the page then gives this step's place to "¡Hecho!".
    if (created) this.created.emit(created);
    return undefined;
  }

  /** The event created, or `null` when it was not (a code sent, or a failure said). */
  private async sendWhoever(): Promise<CreatedEvent | null> {
    // Read again when the last read of the session got no answer, as after a code just typed.
    const account = (await this.session.signedIn()) ? this.account() : null;
    if (!account) {
      await this.sendCode(this.ending().email, false);
      return null;
    }
    const sent = await this.sendEvent();
    if (sent !== 'signed-out') return sent === 'failed' ? null : sent;
    await this.session.refresh();
    if (this.account()) {
      // Still signed in: the refusal was not the session's.
      this.failed.set(true);
      return null;
    }
    this.ending.update((ending) => ({ ...ending, email: account.email }));
    await this.sendCode(account.email, true);
    return null;
  }

  /** Sends a sign-in code to the email, already an address, unless a limit of codes lasts. */
  private async sendCode(typed: string, sessionExpired: boolean): Promise<void> {
    if (waiting(this.codeFailure())) return;
    const { email } = signInCodeBodySchema.parse({ email: typed });
    this.codeError.set(null);
    this.failed.set(false);
    try {
      const sent = await this.api.send(sendSignInCodeEndpoint, { params: {}, body: { email } });
      this.code.set({ email, resendAt: inSeconds(sent.resendAfterSeconds), sessionExpired });
    } catch (error: unknown) {
      this.codeError.set(error);
    }
  }

  private focusName(): void {
    afterNextRender(
      () => {
        this.nameField()?.focus();
      },
      { injector: this.injector },
    );
  }

  private focusEmail(): void {
    afterNextRender(
      () => {
        this.emailField()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** Sends the event: the deadline suggested is the one of today, read now. */
  private async sendEvent(): Promise<CreatedEvent | 'failed' | 'signed-out'> {
    this.firstDay.set(today());
    const deadline = this.deadline();
    const { organizerName, title } = this.details();
    const { note, anonymous } = this.ending();
    this.failed.set(false);
    const event = {
      title,
      organizerName,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      deadline,
      note,
      anonymous,
      options: this.options(),
    };
    const body = JSON.stringify(event);
    const last = this.sent();
    const token = last?.body === body ? last.token : newCapabilityToken();
    this.sent.set({ token, body });
    try {
      const answer = await this.api.send(createEventEndpoint, {
        params: {},
        headers: { 'x-management-token': token },
        body: event,
      });
      this.tokens.keep(answer.participationId, token);
      return { participationId: answer.participationId, deadline };
    } catch (error) {
      if (apiError(createEventEndpoint, error)?.status === 401) return 'signed-out';
      if (tokenTaken(error)) this.sent.set(null);
      this.failed.set(true);
      return 'failed';
    }
  }
}

/** The time `seconds` from now, in milliseconds since the epoch. */
function inSeconds(seconds: number): number {
  return Date.now() + seconds * 1000;
}

/** The API refused the token: an event of another account holds it. */
function tokenTaken(error: unknown): boolean {
  const refused = apiError(createEventEndpoint, error);
  return (
    refused?.status === 400 &&
    refused.body.error.details.some((problem) => problem.code === 'MANAGEMENT_TOKEN_TAKEN')
  );
}
