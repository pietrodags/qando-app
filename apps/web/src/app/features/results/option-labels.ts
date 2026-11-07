import { Service, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import { capitalised, clockLabel } from '../vote/display';

/** A piece of a long label; `minor` for the words that connect the dates ("de", "a las"). */
export interface LabelPart {
  readonly text: string;
  readonly minor: boolean;
}

/** The catalogue marks the connecting words of a long label as `<m>…</m>`. */
const MINOR = /<m>(.*?)<\/m>/;

/**
 * Names an option the two ways the results show it: the long label of the winning dates
 * ("sábado 11 de julio, a las 9:30", its connecting words apart so they can be drawn smaller)
 * and the short label of the chart ("Sáb 11 Jul · 9:30"). Dates are calendar values, named in the
 * active language; the catalogue holds each shape.
 */
@Service()
export class OptionLabels {
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  private readonly names = {
    weekday: this.format({ weekday: 'long' }),
    month: this.format({ month: 'long' }),
    weekdayShort: this.format({ weekday: 'short' }),
    monthShort: this.format({ month: 'short' }),
  };

  /** "sábado 11 de julio", in parts. */
  long(option: Option): LabelPart[] {
    const text = this.label('long', option, (date) => ({
      weekday: this.names.weekday(date),
      month: this.names.month(date),
    }));
    return text
      .split(MINOR)
      .map((piece, index) => ({ text: piece, minor: index % 2 === 1 }))
      .filter(({ text: piece }) => piece !== '');
  }

  /** "sábado 11 de julio", as plain text. */
  plain(option: Option): string {
    return this.long(option)
      .map(({ text }) => text)
      .join('');
  }

  /** "Sáb 11 Jul". */
  short(option: Option): string {
    return this.label('short', option, (date) => ({
      weekday: this.titled(this.names.weekdayShort(date)),
      month: this.titled(this.names.monthShort(date)),
    }));
  }

  private label(
    form: 'long' | 'short',
    { dates, time }: Option,
    namesOf: (date: string) => { weekday: string; month: string },
  ): string {
    const key = (shape: string) => `results.label.${form}.${shape}`;
    const day = (date: string) => ({ ...namesOf(date), day: String(Number(date.slice(8))) });
    const dateLabel = (date: string) => this.transloco.translate(key('date'), day(date));

    if (dates.kind === 'range') {
      const { start, end } = dates;
      if (start.slice(0, 7) !== end.slice(0, 7)) {
        return this.transloco.translate(key('acrossMonths'), {
          start: dateLabel(start),
          end: dateLabel(end),
        });
      }
      const [first, last] = [day(start), day(end)];
      return this.transloco.translate(key('sameMonth'), {
        startWeekday: first.weekday,
        startDay: first.day,
        endWeekday: last.weekday,
        endDay: last.day,
        month: last.month,
      });
    }
    const date = dateLabel(dates.date);
    if (time === null) return date;
    if (time.kind === 'single') {
      return this.transloco.translate(key('atTime'), { date, time: clockLabel(time.at) });
    }
    return this.transloco.translate(key('betweenTimes'), {
      date,
      start: clockLabel(time.start),
      end: clockLabel(time.end),
    });
  }

  /** A name of the date's weekday or month: a date-only ISO string is read as UTC. */
  private format(options: Intl.DateTimeFormatOptions): (date: string) => string {
    const format = new Intl.DateTimeFormat(this.locale, { ...options, timeZone: 'UTC' });
    return (date) => format.format(Date.parse(date)).replace(/\.$/, '');
  }

  private titled(name: string): string {
    return capitalised(name, this.locale);
  }
}
