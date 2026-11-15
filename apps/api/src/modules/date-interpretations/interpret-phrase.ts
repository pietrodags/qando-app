import { readDates, type DatesRead } from '@qando/date-reader';
import type { EditPhrase } from '../../phrase-editor/phrase-editor.js';

/** A phrase to interpret, with what its reading depends on. */
export interface PhraseToInterpret {
  /** The phrase that says when, in Spanish, Catalan or English. */
  readonly text: string;
  /** The time zone it is written in: today and the time now are taken in it. A name `Intl` knows. */
  readonly timeZone: string;
  /** The region of the writer's language ("ES", "US"…), which orders a date in figures. */
  readonly region?: string | undefined;
  /**
   * Whether the phrase is copy-edited before it is read. The wizard asks for it: people type and
   * dictate as they speak. A caller whose phrase is already well written leaves it out, and the
   * language model is not asked.
   */
  readonly copyEdit: boolean;
}

/**
 * Interprets a phrase: its options, the questions to ask first and the notices, as data. Every
 * phrase gets an answer; what is not understood is said in it.
 */
export type InterpretPhrase = (phrase: PhraseToInterpret) => Promise<DatesRead>;

/**
 * The interpreter of date phrases (ADR 0007), whatever asks for it: the editor, when the caller
 * wants it, and then the rules reader, with today and the time now of the clock in the caller's
 * time zone.
 */
export function phraseInterpreter(editPhrase: EditPhrase, now: () => Date): InterpretPhrase {
  return async ({ text, timeZone, region, copyEdit }) => {
    const phrase = copyEdit ? await editPhrase(text) : text;
    return readDates(phrase, {
      ...wallClock(now(), timeZone),
      ...(region !== undefined && { region }),
    });
  };
}

/** The day (`YYYY-MM-DD`) and the clock time (`HH:MM`, from 00:00) of an instant in a time zone. */
function wallClock(instant: Date, timeZone: string): { today: string; now: string } {
  return {
    // Canada writes its dates as ISO 8601 does.
    today: new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant),
    now: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant),
  };
}
