import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { ConnectingApplication } from '@qando/contracts';

/** The assistants qando draws the logo of. */
type Assistant = 'claude' | 'claude-code' | 'chatgpt';

/** Where the name goes in a sentence of the catalogue: a character no sentence holds. */
const NAME = '';

/**
 * An application (an AI assistant) by its name, with its logo before the name when it is an
 * assistant qando knows: Claude, Claude Code or ChatGPT (owner, 2026-11-28). The logo is chosen by
 * the host the application's document is published at, where no other application can publish,
 * never by the name alone, which any application can give itself. With `key`, the sentence of the
 * catalogue that names it, the logo and the name where its `{app}` stands. The logo and the name
 * never part at the end of a line; the logo is decoration, screen readers read the name.
 */
@Component({
  selector: 'app-assistant-name',
  styleUrl: './assistant-name.scss',
  templateUrl: './assistant-name.html',
})
export class AssistantName {
  private readonly transloco = inject(TranslocoService);

  readonly application = input.required<ConnectingApplication>();
  /** A sentence of the catalogue whose `{app}` the name fills; without one, the name alone. */
  readonly key = input<string>();

  protected readonly assistant = computed(() => assistantOf(this.application()));
  /** The sentence's words before the name and after it. */
  protected readonly around = computed<readonly [string, string]>(() => {
    const key = this.key();
    // Without a sentence, the name stands alone: nothing before it and nothing after it.
    const sentence = key === undefined ? NAME : this.transloco.translate(key, { app: NAME });
    const at = sentence.indexOf(NAME);
    // A sentence that does not name it (a translation that left `{app}` out) keeps its words,
    // the logo and the name after them; a sentence that names it again has the name alone there.
    if (at === -1) return [`${sentence} `, ''];
    // Split and joined, not replaced: a name's "$&" or "$'" is no pattern.
    const after = sentence
      .slice(at + NAME.length)
      .split(NAME)
      .join(this.application().name);
    return [sentence.slice(0, at), after];
  });
}

function assistantOf({ name, host }: ConnectingApplication): Assistant | undefined {
  if (host === 'chatgpt.com') return 'chatgpt';
  if (host === 'claude.ai') return name === 'Claude Code' ? 'claude-code' : 'claude';
  return undefined;
}
