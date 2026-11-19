/**
 * The browser's speech recognizer as a test has it. jsdom has none, so a test says whether the
 * browser offers one and, through each recognizer the page makes, what the browser's would tell:
 * that it listens, the words it hears, that it fails, that it ends.
 */
export class TestRecognizer extends EventTarget {
  lang = '';
  interimResults = false;
  continuous = true;
  /** Where the page left it: just made, listening since `start`, or let go with `abort`. */
  state: 'made' | 'started' | 'aborted' = 'made';

  start(): void {
    this.state = 'started';
  }

  abort(): void {
    this.state = 'aborted';
  }

  /** The microphone is open. */
  listens(): void {
    this.dispatchEvent(new Event('start'));
  }

  /** Words are heard: the pieces of everything said so far, as the browser gives them. */
  hears(...pieces: string[]): void {
    const results = pieces.map((transcript) => [{ transcript }]);
    this.dispatchEvent(Object.assign(new Event('result'), { results }));
  }

  /** The browser gives up, with its reason (`not-allowed`, `no-speech`, `network`…). */
  fails(error: string): void {
    this.dispatchEvent(Object.assign(new Event('error'), { error }));
  }

  /** Nothing more will be heard. */
  ends(): void {
    this.dispatchEvent(new Event('end'));
  }
}

/** The recognizers the page made, the first one first. */
export type TestRecognizers = readonly TestRecognizer[];

/**
 * The browser offers a speech recognizer, under its standard name or, as Chrome and Safari have
 * it, the prefixed one. Returns the recognizers the page makes from now on.
 */
export function installTestRecognizer(
  name: 'SpeechRecognition' | 'webkitSpeechRecognition' = 'SpeechRecognition',
): TestRecognizers {
  const made: TestRecognizer[] = [];
  Reflect.set(
    window,
    name,
    class extends TestRecognizer {
      constructor() {
        super();
        made.push(this);
      }
    },
  );
  return made;
}

/** The browser offers no speech recognizer, as jsdom and Firefox. */
export function removeTestRecognizer(): void {
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
}
