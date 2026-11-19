import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** What is used of the browser's speech recognizer (the Web Speech API). */
interface Recognizer extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  abort(): void;
}

type RecognizerMaker = new () => Recognizer;

/** How long the bars go on moving more after a word. */
const HEARD_MS = 600;
/** How long a browser that was asked to listen and says nothing is waited for. */
const UNANSWERED_MS = 10_000;

/** The browser's recognizer, under its standard name or the prefixed one of Chrome and Safari. */
function recognizerOfBrowser(): RecognizerMaker | undefined {
  return (Reflect.get(window, 'SpeechRecognition') ??
    Reflect.get(window, 'webkitSpeechRecognition')) as RecognizerMaker | undefined;
}

/** Everything heard so far of the utterance, which the browser gives in pieces. */
function wordsOf(heard: Event): string {
  const pieces = (heard as SpeechRecognitionEvent).results;
  return Array.from(pieces, (piece) => piece[0]?.transcript ?? '')
    .join('')
    .trim();
}

/**
 * The microphone of a text: pressed, the browser listens to one utterance in the language of the
 * interface and what it hears is written as it comes, after the text there was when it was
 * pressed and a space, each time in place of what was heard before and cut where the text is
 * full (`max`). While it listens the microphone is five bars, which move more while words come,
 * and it is named for stopping. It stops with the utterance, with a second press, with `stop`,
 * when it goes from the page, when the browser gives up, and by itself when the browser, asked
 * to listen, says nothing for ten seconds; what was heard stays written. A browser that refuses
 * the microphone is told through `denied`. Where the browser has no speech recognizer there is
 * no microphone: the component shows nothing.
 */
@Component({
  selector: 'app-dictation',
  imports: [TranslocoPipe],
  styleUrl: './dictation.scss',
  templateUrl: './dictation.html',
})
export class Dictation {
  /** The text the words heard are written in. */
  readonly text = model.required<string>();
  /** The most characters the text takes. */
  readonly max = input.required<number>();
  /** The browser refused the microphone. */
  readonly denied = output();

  private readonly transloco = inject(TranslocoService);

  /** How the browser makes a recognizer, when it has one. */
  protected readonly recognizer = recognizerOfBrowser();
  /** The browser was asked to listen and has not stopped. */
  protected readonly listening = signal(false);
  /** Words came a moment ago. */
  protected readonly hearing = signal(false);
  /** What the button does, as its name. */
  protected readonly name = computed<string>(() =>
    this.listening() ? 'create.phrase.stopDictation' : 'create.phrase.dictate',
  );

  /** Lets go of the recognizer asked to listen last. */
  private letGo: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  /** Stops listening; what was heard stays written. Nothing to do at rest. */
  stop(): void {
    this.letGo();
  }

  /** The button starts the dictation, and stops it while it listens. */
  protected pressed(make: RecognizerMaker): void {
    if (this.listening()) this.stop();
    else this.listen(new make());
  }

  private listen(recognizer: Recognizer): void {
    recognizer.lang = this.transloco.translate('create.phrase.spoken');
    recognizer.interimResults = true;
    recognizer.continuous = false;

    const before = this.text().trimEnd();
    // Whatever the recognizer says once it is let go is not heard.
    const session = new AbortController();
    const heard = { signal: session.signal };
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const unanswered = setTimeout(() => {
      this.stop();
    }, UNANSWERED_MS);
    this.letGo = (): void => {
      session.abort();
      clearTimeout(unanswered);
      clearTimeout(quiet);
      recognizer.abort();
      this.listening.set(false);
      this.hearing.set(false);
    };

    recognizer.addEventListener(
      'start',
      () => {
        clearTimeout(unanswered);
      },
      heard,
    );
    recognizer.addEventListener(
      'result',
      (result) => {
        clearTimeout(unanswered);
        const written = [before, wordsOf(result)].filter((part) => part !== '').join(' ');
        this.text.set(written.slice(0, this.max()));
        this.hearing.set(true);
        clearTimeout(quiet);
        quiet = setTimeout(() => {
          this.hearing.set(false);
        }, HEARD_MS);
      },
      heard,
    );
    recognizer.addEventListener(
      'error',
      (failure) => {
        const why = (failure as SpeechRecognitionErrorEvent).error;
        this.stop();
        if (why === 'not-allowed' || why === 'service-not-allowed') this.denied.emit();
      },
      heard,
    );
    recognizer.addEventListener(
      'end',
      () => {
        this.stop();
      },
      heard,
    );

    this.listening.set(true);
    recognizer.start();
  }
}
