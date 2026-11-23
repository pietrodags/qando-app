import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  type OnInit,
  type WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { latestOptionDate } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { ClearButton } from './clear-button';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { HoldRing } from '../../shared/ui/hold-ring';
import { LongPress } from '../../shared/ui/long-press';
import { SideSlide, type SlideEnd } from '../../shared/ui/side-slide';
import { Switch } from '../../shared/ui/switch';
import { Toaster } from '../../shared/ui/toast';
import { Tooltip } from '../../shared/ui/tooltip';
import {
  type DateRange,
  type DateSelection,
  type Drag,
  dragDays,
  firstMarked,
  hasDates,
  holdDay,
  pressDay,
  rangeOn,
  removeSaved,
  saveRange,
  withTimesAsked,
  withoutDates,
  withoutDatesBefore,
} from './date-selection';
import { DayDrag, type DayDragSpan, type DayDrop } from './day-drag';
import {
  type DayMove,
  type DaySpan,
  type GridDay,
  type MonthGrid,
  addMonths,
  monthGrid,
  monthOf,
  monthWithin,
  movedDay,
} from './month-grid';
import { NoticeBox, type NoticeLine } from './notice-box';
import { OptionCounter } from './option-counter';
import { PhraseBox, type PhraseMarked } from './phrase-box';
import { type SavedPill, SavedPills } from './saved-pills';
import { today } from './today';
import { TOUCH_QUERY } from '../../shared/ui/screen-matches';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A day as it is drawn: the classes of what it has, besides the one every day has. */
interface DayView extends GridDay {
  readonly classes: string;
}

/** A month beside the one on screen, drawn while a finger slides: before it or after it. */
interface Glimpse {
  readonly month: string;
  readonly side: 'before' | 'after';
  readonly blanks: readonly undefined[];
  readonly days: readonly DayView[];
}

/** Where a key takes the focus from a day; `null` for the keys the calendar leaves alone. */
function moveOf(key: string): DayMove | null {
  switch (key) {
    case 'ArrowLeft':
      return { days: -1 };
    case 'ArrowRight':
      return { days: 1 };
    case 'ArrowUp':
      return { days: -7 };
    case 'ArrowDown':
      return { days: 7 };
    case 'PageUp':
      return { months: -1 };
    case 'PageDown':
      return { months: 1 };
    default:
      return null;
  }
}

/**
 * Step 2 of the creation wizard, inside its card: one month of a calendar, from today to the last
 * day an event can propose, and the arrows back to step 1 and on to the next step. A press on a
 * free day marks it as a date of its own; a press on a marked day removes it, and on any day of a
 * range, the whole range. The days outside those limits cannot be pressed, and the month arrows,
 * which repeat while held down, stop at their months. Today is read from the clock again when the
 * step is entered and on every use: after midnight the dates marked before the new today are
 * gone, and the calendar is never left on a month before it.
 *
 * A finger that slides sideways over the days (`SideSlide`), before it has rested on one, moves
 * them with it, no farther than a month and not past the first or the last month, the months
 * beside in sight; when it lifts the calendar goes to the month it brought more than a quarter of
 * the calendar's width into sight, or the one it was flung towards (a quick, short slide), and
 * back otherwise, the days gliding to their place from where the finger left them (at once with
 * reduced motion). The month arrows, the keyboard and a drag change the month at once.
 *
 * A range, days in a row proposed as one option, is made in two ways. A drag from a day to another
 * joins them, also across months (the pointer resting at a side of the days changes the month): a
 * mouse drags by moving, a finger once it has rested on the day until a ring, drawn outside the
 * finger, has closed on it (`HoldRing`), and lifted
 * there without sliding it leaves the day as a date of its own. With the keyboard, Shift+Enter
 * holds a day and the press on another day makes the range; meanwhile a tip over the day held
 * asks for the last day, out of the way while another day has the focus (screen readers hear it
 * from a text that is not seen), the month can change, and Escape lets go; the day held, pressed
 * again or left held when going on to the next step, stays as a date of its own. Begun on the
 * first or the last day of a range, both ways move that end. While a drag goes on, nothing else
 * marks, holds or goes on.
 *
 * A range is saved with its "+", on its last day on screen: it leaves the calendar, its days free
 * again under a pale band, and waits under the calendar as a pill; a range made again over those
 * days, from the first to the last, changes nothing and pins that pill, which says why. A mouse
 * finds the "+" over any day of the range, though not
 * while it rests where the drag that made the range ended; the keyboard, with Tab from a day of
 * the range; without a mouse, a button under the calendar gives way to the "+" of every range,
 * red, until one is saved, Escape or a press anywhere else, which does what it does. A pill
 * shows its range on the calendar: outlined while the mouse is over it, and pinned by a press,
 * until Escape, the pill again or a press anywhere else, which on a day of the view does nothing
 * more; the month arrows keep the view while the range has days in the month.
 * A pill's "−" deletes its range: a mouse and the keyboard find it on the pill while none is
 * pinned, and without a mouse it is there only on the pinned pill.
 *
 * Each date of its own, each range and each saved range is one option of the event, which takes
 * 60: from 50 on a counter under the calendar says how many are taken (`OptionCounter`), red at 60,
 * when a free day stays free, though it can still be held for a range that takes dates of their
 * own in. A trash under the calendar, there while there is something to
 * clear, clears every date, range and saved range (`ClearButton`); the month stays.
 *
 * Times are asked for with the "Horario" switch, for the dates of their own: it is on screen only
 * while one is marked, and comes back as it was left. With a mouse it is at the end of the row
 * under the calendar; without one, where that end is the button of the "+", it is between the two
 * arrows, beside "Siguiente".
 *
 * The smart calendar is a switch beside the step's label: on, the box where dates are asked for
 * in plain words (`PhraseBox`) covers the calendar, as large as it, and the arrow that goes on is
 * the button that has the phrase read; what is under the calendar stays, and the trash, there
 * also for a text alone, clears the text with the dates. Off, the calendar is back as it was. A
 * phrase that gives dates closes the box: they replace those chosen before, the calendar goes to
 * the month of the first day marked, and what the reading tells about them shows above the
 * calendar, in an amber box, until its cross, the trash, the next phrase that gives dates or the
 * step folding away. The box is closed whenever the step is entered; the phrase written is the
 * page's, and is there the next time the box opens.
 *
 * When a phrase's dates took the place of others, a message at the bottom of the screen says how
 * many (each date, range and saved range is one) and offers to undo it (`Toaster`): the dates,
 * their times and the month are back as they were before the phrase, what the phrase told is
 * gone and the calendar is back, the box closed, with the focus. The offer is for the dates as
 * the phrase left them: it goes once they change in any way, and when the step folds away. After
 * two phrases, it undoes the second.
 *
 * The page holds the dates and the month on screen, so both outlive the step folding away. With
 * the keyboard, Tab reaches one day (the one used last), the arrow keys move by day and by week,
 * into the next month too, PageUp and PageDown change the month, and Enter or Space press the
 * day. Until a date is marked the arrow to the next step, still in the Tab order, does nothing
 * and tells screen readers why.
 */
@Component({
  selector: 'app-wizard-dates',
  imports: [
    ClearButton,
    DayDrag,
    HoldRepeat,
    HoldRing,
    LongPress,
    NoticeBox,
    OptionCounter,
    PhraseBox,
    SavedPills,
    SideSlide,
    Switch,
    Tooltip,
    TranslocoPipe,
  ],
  styleUrl: './wizard-dates.scss',
  templateUrl: './wizard-dates.html',
  host: {
    '[class.touch]': 'touch',
    '(document:keydown.escape)': 'letGo()',
    '(document:click)': 'clicked($event)',
  },
})
export class WizardDates implements OnInit {
  /** The dates marked so far. */
  readonly selection = model.required<DateSelection>();
  /** The month on screen, as `YYYY-MM`. */
  readonly month = model.required<string>();
  /** The phrase written in the smart calendar's box, kept while the box is closed. */
  readonly phrase = model.required<string>();
  /** The organizer goes back to step 1. */
  readonly back = output();
  /** Some date is marked and the organizer goes on. */
  readonly next = output();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The device has no mouse: the "+" and the "−" are asked for with a press. */
  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  private readonly transloco = inject(TranslocoService);
  protected readonly words: CalendarWords = calendarWords(this.transloco.getActiveLang());
  /** The smart calendar's box is open, over the calendar. */
  protected readonly asking = signal(false);
  /** The box, while it is open: the step's forward button has its phrase read. */
  protected readonly box = viewChild(PhraseBox);
  /** What the last phrase read tells about the dates it left. */
  protected readonly notices = signal<readonly NoticeLine[]>([]);
  private readonly toaster = inject(Toaster);
  /** The dates as the last phrase that replaced others left them: its undo is for them alone. */
  private phraseDates: DateSelection | null = null;
  /** Takes away the offer to undo that phrase, while it is still on screen. */
  private withdrawUndo: () => void = () => undefined;
  /** Today, as the clock said when it was last read: the first day that can be proposed. */
  private readonly firstDay = signal<string>(today());
  private readonly eligible = computed<DaySpan>(() => eligibleFrom(this.firstDay()));

  /** The first day of a range being made with the keyboard: held, its last day not chosen yet. */
  protected readonly held = signal<string | null>(null);
  /**
   * The drag of a mouse or a finger going on: the days it is between, and the dates as they were
   * when it began. It is made over those, whatever leaves the selection before its release.
   */
  private readonly pointerDrag = signal<{ span: DayDragSpan; dates: DateSelection } | null>(null);
  /**
   * A drag is going on: until its release nothing else changes the dates or goes on (a key, or
   * another finger, on a day or on "Siguiente"); the month can still change.
   */
  private readonly dragging = computed<boolean>(() => this.pointerDrag() !== null);
  /** The range being made, by a drag or from the day held; `null` without one. */
  private readonly drag = computed<Drag | null>(() => {
    const pointer = this.pointerDrag();
    if (pointer) return dragDays(pointer.dates, pointer.span.from, pointer.span.to);
    const held = this.held();
    return held === null ? null : holdDay(this.selection(), held);
  });
  /** A range is being made: meanwhile no marked day answers the mouse. */
  protected readonly making = computed<boolean>(() => this.drag() !== null);
  /** The drag goes to an earlier day: its arrow is drawn at the start of the row. */
  protected readonly backward = computed<boolean>(() => {
    const drag = this.drag();
    return drag !== null && drag.anchor !== drag.first;
  });

  /** The saved ranges with a day in the month on screen, each a pill under the calendar. */
  protected readonly pills = computed<readonly DateRange[]>(() =>
    this.selection().saved.filter((range) => touches(range, this.month())),
  );
  /** Their pills, each with the tip and the name of its "−", which says its range. */
  protected readonly savedPills = computed<readonly SavedPill<DateRange>[]>(() =>
    this.pills().map((range) => ({
      item: range,
      removeTitle: this.transloco.translate('create.dates.remove'),
      removeName: this.transloco.translate('create.dates.removeRange', {
        start: this.words.dayOfMonth(range.start),
        end: this.words.dayOfMonth(range.end),
      }),
    })),
  );
  /**
   * The saved range pinned on the calendar by a press on its pill. It lets go by itself when its
   * range is no longer saved or has no day in the month on screen.
   */
  protected readonly pinned: WritableSignal<DateRange | null> = linkedSignal<
    readonly DateRange[],
    DateRange | null
  >({
    source: this.pills,
    computation: (pills, previous) => pills.find((range) => range === previous?.value) ?? null,
  });
  /** The saved range whose pill the mouse is over. */
  protected readonly previewed = signal<DateRange | null>(null);
  /** The saved range looked at on the calendar: the pinned one, or else the mouse's. */
  private readonly viewed = computed<DateRange | null>(
    () => this.pinned() ?? this.pills().find((range) => range === this.previewed()) ?? null,
  );

  protected readonly grid = computed<MonthGrid>(() =>
    monthGrid(this.month(), this.eligible(), this.selection(), this.drag(), this.viewed()),
  );
  protected readonly blanks = computed<undefined[]>(() =>
    Array.from({ length: this.grid().leadingBlanks }),
  );
  /** The days of the month on screen as they are drawn; a range under the mouse is lit. */
  protected readonly days = computed<readonly DayView[]>(() =>
    this.grid().days.map((day) => viewOf(day, this.lit())),
  );

  /** How far a finger sliding sideways has moved the days, in pixels; `null` without one. */
  protected readonly brought = signal<number | null>(null);
  /** After a finger's slide the days glide to their place, from `glideFrom` away. */
  protected readonly gliding = signal(false);
  protected readonly glideFrom = signal('0px');
  /** Where the days were when the slide going on began, in pixels: partly through a glide, or 0. */
  private slideFrom = 0;
  /** A finger slides the days, or they glide after it: the months beside are in sight. */
  protected readonly sliding = computed<boolean>(() => this.brought() !== null || this.gliding());
  /** The months beside the one on screen, while they are in sight, before it and after it. */
  protected readonly glimpses = computed<readonly Glimpse[]>(() => {
    if (!this.sliding()) return [];
    const sides = [
      { side: 'before', month: addMonths(this.month(), -1) },
      { side: 'after', month: addMonths(this.month(), 1) },
    ] as const;
    return sides
      .filter(({ month }) => monthWithin(month, this.eligible()) === month)
      .map(({ side, month }) => {
        const grid = monthGrid(
          month,
          this.eligible(),
          this.selection(),
          this.drag(),
          this.viewed(),
        );
        return {
          month,
          side,
          blanks: Array.from({ length: grid.leadingBlanks }),
          days: grid.days.map((day) => viewOf(day, null)),
        };
      });
  });
  protected readonly atFirstMonth = computed<boolean>(
    () => this.month() <= monthOf(this.eligible().first),
  );
  protected readonly atLastMonth = computed<boolean>(
    () => this.month() >= monthOf(this.eligible().last),
  );
  /** No date is marked, nor would the range being made leave one. */
  protected readonly empty = computed<boolean>(
    () => !hasDates(this.drag()?.result ?? this.selection()),
  );

  /** Some date is marked on its own: times can be asked for, so the switch is on screen. */
  protected readonly timesOffered = computed<boolean>(() => this.selection().singles.length > 0);
  /**
   * The organizer wants times: the "Horario" switch is on. It says so only for the dates of their
   * own, and keeps its answer while there is none.
   */
  protected readonly timed = computed<boolean>(() => this.selection().timed);

  /** There is something to clear: a date marked, a range saved or, in the open box, a text. */
  protected readonly clearable = computed<boolean>(
    () => hasDates(this.selection()) || (this.asking() && this.phrase() !== ''),
  );
  /** The day the mouse is over. */
  protected readonly hovered = signal<string | null>(null);
  /**
   * The range under the mouse, lit whole; none while a range is being made, nor under the pinned
   * view, whose days do not answer the mouse.
   */
  protected readonly lit = computed<DateRange | null>(() => {
    const hovered = this.hovered();
    if (hovered === null || this.drag() || holds(this.pinned(), hovered)) return null;
    return rangeOn(this.selection(), hovered) ?? null;
  });
  /**
   * The day the last drag was released on, until the mouse leaves it: resting there shows no "+".
   * None after a release off the days.
   */
  private readonly rested = signal<string | null>(null);
  /** The range whose "+" the mouse shows: the lit one, once the mouse has moved on. */
  protected readonly offered = computed<DateRange | null>(() =>
    this.hovered() === this.rested() ? null : this.lit(),
  );
  /**
   * Without a mouse: the "+" of every range are shown, asked for with the button under the
   * calendar, which gives way to them; they hide again, and the button is back, when the ranges
   * change, as when one is saved.
   */
  protected readonly adding: WritableSignal<boolean> = linkedSignal<readonly DateRange[], boolean>({
    // A computed, so that only a change of the ranges reaches the computation.
    source: computed<readonly DateRange[]>(() => this.selection().ranges),
    computation: () => false,
  });
  /** Some range has a day on screen and none is being made: there is a "+" to show. */
  protected readonly savable = computed<boolean>(
    () => !this.making() && this.grid().days.some(({ range }) => range !== null),
  );
  /** "Julio 2026": the month on screen, as the calendar's title. */
  protected readonly title = computed<string>(() => this.words.monthTitle(this.month()));

  /** The day used last, by the keyboard or a pointer: the day with the focus, or about to get it. */
  protected readonly lastUsed = signal<string | null>(null);
  /** The one day in the Tab order: the day used last while it is on screen, or the first free. */
  protected readonly tabStop = computed<string | null>(() => {
    const days = this.grid().days.filter(({ state }) => state !== 'off');
    const lastUsed = days.find(({ date }) => date === this.lastUsed());
    return (lastUsed ?? days[0])?.date ?? null;
  });
  /** The range of the day in the Tab order: Tab goes on from its days to its "+". */
  protected readonly reachable = computed<DateRange | null>(
    () => this.grid().days.find(({ date }) => date === this.tabStop())?.range ?? null,
  );

  /**
   * A range has just been made: the click of that same press, on its way to the page, does not
   * let go the pill the range may have pinned.
   */
  private justMade = false;

  private readonly dayButtons = viewChildren<ElementRef<HTMLButtonElement>>('dayButton');
  /**
   * The day the tip points at: the day held, while it is the day used last and on screen. With
   * the focus on another day the tip is out of its way.
   */
  protected readonly tipDay = computed<HTMLButtonElement | null>(() => {
    const held = this.held();
    return held === this.lastUsed() ? (this.dayButton(held)?.nativeElement ?? null) : null;
  });
  private readonly saveButtons = viewChildren<ElementRef<HTMLButtonElement>>('saveButton');
  private readonly monthGrid = viewChild.required<ElementRef<HTMLElement>>('monthGrid');
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');
  private readonly adderButton = viewChild<ElementRef<HTMLButtonElement>>('adderButton');

  constructor() {
    // Whatever changes the dates the phrase left, a press, the trash or midnight, ends its undo.
    effect(() => {
      if (this.selection() !== this.phraseDates) this.withdrawUndo();
    });
    inject(DestroyRef).onDestroy(() => {
      this.withdrawUndo();
    });
  }

  /** The step is entered: the required models can be read from here on. */
  ngOnInit(): void {
    this.rereadToday();
  }

  /**
   * A click on a day: the last day of the range from the day held, or a press on its own. On a
   * day of the pinned view it only lets the view go, as the click does once it reaches the page.
   */
  protected press(date: string): void {
    if (this.dragging() || holds(this.pinned(), date)) return;
    this.rereadToday();
    // The day was drawn before midnight: it is yesterday now.
    if (date < this.firstDay()) return;
    const held = this.held();
    if (held !== null) {
      this.choose(held, date);
      return;
    }
    this.selection.update((selection) => pressDay(selection, date));
  }

  /**
   * Shift+Enter on a day: it becomes the first of a range, the pinned view and the "+" asked for
   * let go; a day between the ends of a range holds nothing.
   */
  protected hold(date: string): void {
    if (this.dragging()) return;
    this.pinned.set(null);
    this.adding.set(false);
    this.rereadToday();
    if (date >= this.firstDay() && holdDay(this.selection(), date)) this.held.set(date);
  }

  /**
   * A drag goes on, or is given up (`null`); it takes the place of a day held, of the pinned view
   * and of the "+" asked for.
   */
  protected dragged(span: DayDragSpan | null): void {
    this.held.set(null);
    this.pinned.set(null);
    this.adding.set(false);
    this.pointerDrag.update((drag) => span && { span, dates: drag?.dates ?? this.selection() });
  }

  /**
   * The mouse is released or the finger lifted: the drag's days are the dates, unless one of
   * them is yesterday by now, be it the day pressed or the first day of a range dragged by its
   * end. A drag that ends on the day it began on leaves that day as a date of its own.
   */
  protected dropped(drop: DayDrop): void {
    const drag = this.drag();
    this.pointerDrag.set(null);
    this.rereadToday();
    this.rested.set(drop.onDay ? drop.to : null);
    const first = this.firstDay();
    if (!drag || drop.from < first || drag.first < first) return;
    this.made(drag, withoutDatesBefore(drag.result, first));
  }

  /** The mouse comes over a day, or over its "+"; a finger's touch is not a mouse resting. */
  protected over(event: PointerEvent, date: string): void {
    if (event.pointerType === 'touch') return;
    this.hovered.set(date);
    if (date !== this.rested()) this.rested.set(null);
  }

  /** The mouse leaves a day. */
  protected left(): void {
    this.hovered.set(null);
    this.rested.set(null);
  }

  /** The "+" of a range, on `day`: the range is saved and the day takes the focus the "+" had. */
  protected save(range: DateRange, day: string): void {
    this.rereadToday();
    this.selection.update((selection) => saveRange(selection, range));
    this.focusDay(day);
  }

  /**
   * The "−" of a pill: its range is no longer saved. The pills pass the focus on among
   * themselves; with none left on screen it goes back to the calendar.
   */
  protected remove(range: DateRange): void {
    if (this.dragging()) return;
    this.rereadToday();
    this.selection.update((selection) => removeSaved(selection, range));
    if (this.pills().length > 0) return;
    this.focusOnceDrawn(() => this.dayButtons().find(inTabOrder));
  }

  protected setTimed(timed: boolean): void {
    this.selection.update((selection) => withTimesAsked(selection, timed));
  }

  /**
   * The trash: every date, range and saved range is gone, with what the last reading told and the
   * text of the smart calendar's box, and the day held is let go; the month stays. The open box
   * is emptied whole: what it tells goes too, and the answer it waits for is dropped. With nothing
   * left to clear the trash is gone: the focus goes to the calendar, or to the box while it is
   * open.
   */
  protected clear(): void {
    if (this.dragging()) return;
    this.rereadToday();
    this.held.set(null);
    this.notices.set([]);
    this.selection.update(withoutDates);
    const box = this.box();
    if (box !== undefined) {
      box.clear();
      return;
    }
    this.phrase.set('');
    this.focusOnceDrawn(() => this.dayButtons().find(inTabOrder));
  }

  /**
   * The button under the calendar, without a mouse: the "+" of every range on screen show in its
   * place, the first one taking the focus it had.
   */
  protected showSaves(): void {
    this.adding.set(true);
    this.focusOnceDrawn(() => this.saveButtons()[0]);
  }

  /**
   * Escape: the day held, the pinned view and the "+" asked for are let go; the button that
   * showed those "+" is back with the focus one of them may have had.
   */
  protected letGo(): void {
    this.held.set(null);
    this.pinned.set(null);
    if (!this.adding()) return;
    this.adding.set(false);
    this.focusOnceDrawn(() => this.adderButton());
  }

  /**
   * A click anywhere on the page lets the pinned view go, except on the pills, which pin and
   * unpin by themselves, on the month arrows, which keep it, and the click that has just pinned
   * it. It also hides the "+" asked for
   * without a mouse, except on one of them, which saves, and on the button that has just shown
   * them; whatever was pressed does what it does.
   */
  protected clicked(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const keeps = this.justMade || target?.closest('app-saved-pills button, .month-arrow');
    if (!keeps) this.pinned.set(null);
    if (!target?.closest('.save, .adder')) this.adding.set(false);
  }

  /**
   * A finger slides sideways, `by` pixels from where it was put down: the days go with it, no
   * farther than a month, nor towards a month before the first or after the last; a glide on its
   * way stops where it is, and the days go on from there.
   */
  protected slide(by: number): void {
    // A new slide takes the days from where they are, partly through a glide too.
    if (this.brought() === null) this.slideFrom = this.gliding() ? this.shownAt() : 0;
    this.gliding.set(false);
    this.brought.set(this.within(this.slideFrom + by));
  }

  /**
   * The finger lifts: the calendar goes to the month it brought more than a quarter of its width
   * into sight (the finger's own way, wherever the days were when it began), or to the one it was
   * flung towards, and the days glide there from where they are. A slide given up goes back.
   */
  protected settle({ by, flung }: SlideEnd): void {
    const from = this.brought() ?? 0;
    const way = turnOf(this.within(by), flung, this.monthBox().width / 4);
    // Measured before the month changes: the month beside, on its way, is where it was.
    const stride = way === 0 ? 0 : this.strideTo(way);
    this.brought.set(null);
    if (way !== 0) this.page(way);
    const glide = from + way * stride;
    this.glideFrom.set(`${String(glide)}px`);
    this.gliding.set(glide !== 0 && !window.matchMedia(REDUCED_MOTION_QUERY).matches);
  }

  /** The days' glide ends; the motion of something inside them is not it. */
  protected glided(event: Event): void {
    if (event.target === event.currentTarget) this.gliding.set(false);
  }

  /** How far the days are from their place as they are drawn now, partly through a glide too. */
  private shownAt(): number {
    const shown = Number.parseFloat(getComputedStyle(this.strip().nativeElement).translate);
    return Number.isNaN(shown) ? 0 : shown;
  }

  /** `by` pixels, no farther than a month and only towards a month there is. */
  private within(by: number): number {
    const width = this.monthBox().width;
    const backward = this.atFirstMonth() ? 0 : width;
    const forward = this.atLastMonth() ? 0 : width;
    return Math.min(Math.max(by, -forward), backward);
  }

  /** How far the month beside, the way given, is from the month on screen, in pixels. */
  private strideTo(way: -1 | 1): number {
    const beside = this.host.querySelector(way > 0 ? '.glimpse.after' : '.glimpse.before');
    if (!beside) return 0;
    return Math.abs(beside.getBoundingClientRect().left - this.monthBox().left);
  }

  private monthBox(): DOMRect {
    return this.monthGrid().nativeElement.getBoundingClientRect();
  }

  /** A month arrow: one month back or forward, never past the first or the last month. */
  protected page(months: -1 | 1): void {
    // From the month on screen, also when today's month has changed under it.
    const wanted = addMonths(this.month(), months);
    this.rereadToday();
    this.month.set(monthWithin(wanted, this.eligible()));
  }

  /** A key on a day: the arrows and the page keys take the focus to another day. */
  protected keyed(event: KeyboardEvent, date: string): void {
    this.rereadToday();
    const move = moveOf(event.key);
    if (!move) return;
    // The page does not scroll under the calendar.
    event.preventDefault();
    // A held key repeats before the focus has moved: each press goes on from the last one's day.
    const target = movedDay(this.lastUsed() ?? date, move, this.eligible());
    this.month.set(monthOf(target));
    this.focusDay(target);
  }

  /** The focus goes to a day of the month on screen, once it is drawn. */
  private focusDay(date: string): void {
    this.lastUsed.set(date);
    this.focusOnceDrawn(() => this.dayButton(date));
  }

  /** The button of a day, while its month is on screen and it can be chosen. */
  private dayButton(date: string | null): ElementRef<HTMLButtonElement> | undefined {
    return this.dayButtons().find(({ nativeElement }) => nativeElement.dataset['date'] === date);
  }

  /** The focus goes to the button `find` answers once the page is drawn again, if there is one. */
  private focusOnceDrawn(find: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => find()?.nativeElement.focus(), { injector: this.injector });
  }

  /** The smart calendar's switch: its box opens in the calendar's place, and a day held is let go. */
  protected ask(asking: boolean): void {
    this.held.set(null);
    this.asking.set(asking);
  }

  /**
   * A phrase gave dates: they take the place of those chosen, with what the reading tells above
   * the calendar, which is back on the month of the first day marked and with the focus. Those
   * chosen before, if there were any, can be put back for a while.
   */
  protected marked({ selection, lines }: PhraseMarked): void {
    const before = this.selection();
    const month = this.month();
    this.selection.set(selection);
    const first = firstMarked(selection);
    if (first !== undefined) this.month.set(monthOf(first));
    this.notices.set(lines);
    this.asking.set(false);
    this.focusOnceDrawn(() => this.dayButtons().find(inTabOrder));
    const count = before.singles.length + before.ranges.length + before.saved.length;
    if (count === 0) return;
    this.phraseDates = selection;
    this.withdrawUndo = this.toaster.offer(
      count === 1
        ? this.transloco.translate('create.phrase.replacedOne')
        : this.transloco.translate('create.phrase.replaced', { count }),
      {
        label: this.transloco.translate('create.phrase.undo'),
        run: () => {
          this.undo(before, month);
        },
      },
    );
  }

  /**
   * "Deshacer", in the message a phrase left: the dates, with their times, and the month are
   * those of before the phrase, what it told is gone, a day held is let go, and the calendar is
   * back, with the focus, though the box was opened again.
   */
  private undo(dates: DateSelection, month: string): void {
    this.held.set(null);
    this.selection.set(dates);
    this.month.set(month);
    this.notices.set([]);
    this.asking.set(false);
    this.rereadToday();
    this.focusOnceDrawn(() => this.dayButtons().find(inTabOrder));
  }

  protected goOn(): void {
    if (this.dragging()) return;
    this.rereadToday();
    // A day still held goes on as when it is pressed again: a date of its own, or free still
    // with every option taken.
    const held = this.held();
    if (held !== null) this.choose(held, held);
    if (!this.empty()) this.next.emit();
  }

  /** The range from the day held ends on `last`; one option too many, it is not made. */
  private choose(held: string, last: string): void {
    const drag = dragDays(this.selection(), held, last);
    this.held.set(null);
    if (drag) this.made(drag, drag.result);
  }

  /**
   * A range has been made and leaves these dates. Over the days of a saved range it has changed
   * nothing: the pill of that range is pinned, which shows the range is there already.
   */
  private made(drag: Drag, dates: DateSelection): void {
    this.selection.set(dates);
    this.pinned.set(drag.alreadySaved);
    // The click of the press that made the range comes in the same task; a later one is not it.
    this.justMade = true;
    setTimeout(() => (this.justMade = false));
  }

  /**
   * The clock is read on every use: after midnight today is another day, and the dates before it
   * are gone; a day held before it, or on a range that began before it, is let go.
   */
  private rereadToday(): void {
    const first = today();
    this.firstDay.set(first);
    const held = this.held();
    if (held !== null && (rangeOn(this.selection(), held)?.start ?? held) < first) {
      this.held.set(null);
    }
    this.selection.update((selection) => withoutDatesBefore(selection, first));
    this.month.update((month) => monthWithin(month, this.eligible()));
  }
}

/**
 * The way a slide that lifts `by` pixels from where it began turns the month: `1` to the next,
 * `-1` to the previous, `0` back to the month it began on. A finger flung goes on the way it was
 * flung, to the month beside or back; otherwise the slide turns past `quarter` pixels.
 */
function turnOf(by: number, flung: -1 | 0 | 1, quarter: number): -1 | 0 | 1 {
  if (flung !== 0) return Math.sign(by) === flung ? (-flung as -1 | 1) : 0;
  if (Math.abs(by) <= quarter) return 0;
  return by < 0 ? 1 : -1;
}

/** The day as it is drawn: what it has, and `lit` when it is a day of the range given. */
function viewOf(day: GridDay, lit: DateRange | null): DayView {
  const classes: Record<string, boolean | undefined> = {
    off: day.state === 'off',
    marked: day.state === 'single' || day.state === 'range',
    'joins-previous': day.joinsPrevious,
    'joins-next': day.joinsNext,
    'cut-before': day.cutBefore,
    'cut-after': day.cutAfter,
    middle: day.middle,
    lit: day.range !== null && day.range === lit,
    'drag-anchor': day.drag === 'anchor',
    'drag-way': day.drag === 'way',
    'drag-reached': day.drag === 'reached',
    saved: day.saved !== null,
    'saved-before': day.saved?.before,
    'saved-after': day.saved?.after,
    viewed: day.viewed !== null,
    'viewed-before': day.viewed?.before,
    'viewed-after': day.viewed?.after,
  };
  const names = Object.keys(classes).filter((name) => classes[name] === true);
  return { ...day, classes: names.join(' ') };
}

/** The range has a day in the month (`YYYY-MM`). */
function touches(range: DateRange, month: string): boolean {
  return monthOf(range.start) <= month && month <= monthOf(range.end);
}

/** The day is one of the range's, when there is a range. */
function holds(range: DateRange | null, date: string): boolean {
  return range !== null && range.start <= date && date <= range.end;
}

/** The button is the one day in the Tab order. */
function inTabOrder({ nativeElement }: ElementRef<HTMLButtonElement>): boolean {
  return nativeElement.tabIndex === 0;
}

/** Today and every day up to the last one an event created today can propose. */
function eligibleFrom(first: string): DaySpan {
  return { first, last: latestOptionDate(first) };
}
