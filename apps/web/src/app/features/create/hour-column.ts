import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  type Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { HoldRing } from '../../shared/ui/hold-ring';
import { LongPress } from '../../shared/ui/long-press';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { Tooltip } from '../../shared/ui/tooltip';
import { ClearButton } from './clear-button';
import {
  type DayTime,
  type DayTimes,
  type HourDrag,
  type HourMark,
  NO_TIMES,
  type SavedEdit,
  dragHours,
  endEdit,
  markAt,
  pressHour,
  removeSavedTime,
  saveTime,
  savedLike,
  shiftEdited,
  shiftQuarter,
} from './day-times';
import { RowDrag, type RowDragSpan } from './row-drag';
import { type SavedPill, SavedPills } from './saved-pills';

/** An hour of the day as its row shows it. */
interface HourRow {
  readonly hour: number;
  readonly part: HourMark['part'];
  /** The marked time it is of; `null` for a free hour and under the saved time being edited. */
  readonly time: DayTime | null;
  /**
   * What tells its row from the others. With a band: its part and `marked`, `live` while it is
   * being drawn and `edited` for the saved time being edited. Free: `saved` when a saved time
   * takes it, and `joined` when a saved range goes on to the next hour.
   */
  readonly classes: string;
  /** The minutes it shows: those of its time, ":00" while it has none, nothing inside a range. */
  readonly minutes: string;
  /** Its time as it reads, "18:15"; the hour, "18:00", where it has none. */
  readonly label: string;
  /** The two ends of its range as they read; `null` off a range. */
  readonly range: { readonly start: string; readonly end: string } | null;
  /** It has a marked time, or one being drawn. */
  readonly marked: boolean;
  /** It has a time to move by quarters: a time of its own, or an end of a range. */
  readonly moves: boolean;
  /** Its time is at the first quarter of the hour, or at the last: it moves no further. */
  readonly atFirstQuarter: boolean;
  readonly atLastQuarter: boolean;
  /** It is the last hour of a marked time, which has its "+" here. */
  readonly savable: boolean;
  /** Its "+" is shown: the mouse has come to its time, or the page shows them all. */
  readonly offered: boolean;
  /** Its "+" is the next Tab stop: its time has the hour with the focus. */
  readonly reachable: boolean;
  /** How many hours the frame of the saved time under the mouse takes from this one; 0 for none. */
  readonly framed: number;
}

/** A saved time as its pill reads it: its time, or its two ends, and what screen readers hear. */
interface TimePill extends SavedPill<DayTime> {
  readonly ends: readonly { readonly hour: string; readonly minutes: string }[];
  readonly heard: string;
}

/**
 * The times of one day: a list of the 24 hours where a press on an hour marks a time on the hour
 * and a press on a marked time unmarks it, and the two arrows of a marked time move it a quarter
 * within its hour. A drag from an hour to another makes a time range, drawn as it goes and made
 * when it is released: with a mouse by pressing and moving, with a finger by resting half a
 * second on the hour, a ring closing on it meanwhile, and then sliding (a finger that slides
 * before scrolls the list); near the ends of the list the drag scrolls it. A range is one band,
 * its two ends with their minutes and arrows; dragged from an end it moves that end, and a press
 * on any of its hours removes it. The list shows 9 hours, opens at 9:00 and scrolls the rest
 * under ︿ ﹀; given less `room` it shows the hours that fit, 4 at least. With the keyboard the
 * column is one Tab stop: ↑ ↓ go along the hours, Enter or Space mark, ← → move the time a
 * quarter; Shift+Enter holds an hour as an end of a range, drawn to the hour the focus goes to,
 * Enter there makes it and Escape lets go, and a tip over the hour held, heard by screen readers
 * too, asks for the last hour. While a range is being made no time is pressed or moved, and the
 * arrows are greyed. The page names the day (`role="group"` and a label on the host).
 *
 * A marked time is saved with the "+" on the corner of its last hour: its hours are free again,
 * with a pale band, and the time waits in a pill under the list (`SavedPills`), so that times
 * that share hours can be told apart. A mouse shows the "+" of the time it comes to, never of the
 * one it has just changed until it comes back; the Tab key goes from a time to its "+"; and the
 * page shows them all at once (`saving`) where there is no mouse. A "+" that is not shown still
 * takes a pointer's press, which does nothing: a press on its place never unmarks the time. The
 * mouse over a pill frames its time on the hours. A press on a pill edits its time: its hours
 * show it as a band with its arrows, which move it by quarters, as ← → do on those hours and on
 * the pill of a time of its own, while the pill reads it; nothing is saved until the edit ends,
 * with another press on the pill, which leaves the focus on the pill of the time as it is then
 * saved, a press on another hour, arrow or pill, a click anywhere off the column, or the focus
 * going elsewhere, and Escape undoes it. A pill's "−" deletes its time.
 *
 * While the day has a time, marked or saved, a trash under the column asks "¿Borrar?" before it
 * clears them all (`ClearButton`).
 */
/**
 * The height of the trash's place under the column, as its stylesheet draws it: the trash
 * (`--q-space-11`) and the room above it (`--q-space-3`).
 */
const PLACE_PX = 45;

@Component({
  selector: 'app-hour-column',
  imports: [
    ClearButton,
    HoldRepeat,
    HoldRing,
    LongPress,
    RowDrag,
    SavedPills,
    ScrollFold,
    Tooltip,
    TranslocoPipe,
  ],
  templateUrl: './hour-column.html',
  styleUrl: './hour-column.scss',
  host: {
    '[class.saving]': 'saving()',
    '(focusout)': 'left($event)',
    '(document:keydown.escape)': 'edit.set(null)',
  },
})
export class HourColumn {
  /** The times of the day, marked and saved. */
  readonly times = model.required<DayTimes>();
  /**
   * Whether the event takes no more options: then nothing that would add one is marked, moved
   * nor saved from an edit. The page gives the question, and the column asks it at each change:
   * the answer told before a press would be an old one once the edit that press ends is an
   * option more, or once another column has taken the last one and the page is not drawn again
   * yet.
   */
  readonly full = input.required<Signal<boolean>>();
  /** The most the list may measure, in pixels; `null` sets no limit. */
  readonly room = input<number | null>(null);
  /** The device has no mouse: a pill is pressed to find its "−". */
  readonly touch = input(false);
  /** The "+" of every marked time is shown. */
  readonly saving = input(false);
  /**
   * A saved time of another column of the page is being edited: until that edit ends, no pill
   * here has its "−" and the mouse over a pill outlines nothing, as in the column of the edit.
   */
  readonly elsewhere = input(false);
  /** The edit of a saved time begins (`true`) or ends (`false`), for the page to tell the others. */
  readonly editingSaved = output<boolean>();

  protected readonly shown = 9;
  protected readonly least = 4;
  protected readonly opening = 9;

  /** The hour the Tab key reaches: the last one that had the focus. */
  protected readonly tabStop = signal(this.opening);
  /** The hour held with the keyboard as an end of a range whose other end is not chosen yet. */
  protected readonly held = signal<number | null>(null);
  /** The list has scrolled since the hour was held: the tip no longer points at it. */
  protected readonly tipLost = signal(false);
  /** The drag of a mouse or a finger going on, by its two hours. */
  private readonly drag = signal<RowDragSpan | null>(null);

  /**
   * The range being made, by a drag or from the hour held to the hour with the focus; `null`
   * without one, and when it draws nothing.
   */
  private readonly drawing = computed<HourDrag | null>(() => {
    const held = this.held();
    const span = this.drag() ?? (held === null ? null : { from: held, to: this.tabStop() });
    return span && dragHours(this.times(), span.from, span.to, this.isFull());
  });

  /**
   * A range is being made, by a drag or from an hour held: until it is made or let go, what is
   * on screen is not the day's times yet, and none of them is pressed or moved.
   */
  private readonly making = computed<boolean>(() => this.drag() !== null || this.held() !== null);

  /** The edit of a saved time, as it was begun and moved. */
  protected readonly edit = signal<SavedEdit | null>(null);
  /** The edit going on: none once its saved time is no longer one of the day's. */
  protected readonly editing = computed<SavedEdit | null>(() => {
    const edit = this.edit();
    return edit && this.times().saved.includes(edit.saved) ? edit : null;
  });
  /** The saved time whose pill the mouse is over. */
  protected readonly previewed = signal<DayTime | null>(null);
  /** A saved time is being edited. */
  private readonly inEditing = computed<boolean>(() => this.editing() !== null);

  /** The hour the mouse is over. */
  private readonly hovered = signal<number | null>(null);
  /** The hour the mouse was on when the times last changed, until it leaves it. */
  private readonly rested = signal<number | null>(null);
  /** The marked time whose "+" the mouse shows: the one it is over, once it has come back to it. */
  private readonly offered = computed<DayTime | null>(() => {
    const hovered = this.hovered();
    if (hovered === null || hovered === this.rested()) return null;
    return markAt(this.times().marked, hovered).time;
  });

  protected readonly rows = computed<readonly HourRow[]>(() => {
    const drawing = this.drawing();
    const making = this.making();
    const day = this.times();
    const full = this.isFull();
    const edit = this.editing();
    const times = (drawing?.times ?? day).marked;
    // No "+" while what is on screen is not the day's marked times.
    const saves = !making && edit === null;
    const offered = this.offered();
    const showAll = this.saving();
    const reachable = markAt(day.marked, this.tabStop()).time;
    const framed = edit || this.elsewhere() ? [] : hoursOf(this.previewed());
    return Array.from({ length: 24 }, (_, hour) => {
      const edited = markAt(edit ? [edit.now] : [], hour);
      const own = edit !== null && edited.part !== 'free';
      const { part, time, minutes } = own ? edited : markAt(times, hour);
      const live = time !== null && time === drawing?.drawn;
      const saved = day.saved.map((each) => markAt([each], hour).part);
      const markedTime = own ? null : time;
      // A time at its stop is not moved: the same list, or the same edit, comes back.
      const stops = (by: -1 | 1): boolean =>
        edit && own
          ? shiftEdited(day, edit, hour, by, full) === edit
          : making || shiftQuarter(day, hour, by, full) === day;
      return {
        hour,
        part,
        time: markedTime,
        classes: classesOf(part, live, own, saved),
        minutes: part === 'between' ? '' : minutes,
        label: `${String(hour)}${minutes}`,
        range: time?.kind === 'range' ? { start: read(time.start), end: read(time.end) } : null,
        marked: part !== 'free' && !own,
        moves: part !== 'free' && part !== 'between',
        atFirstQuarter: stops(-1),
        atLastQuarter: stops(1),
        savable: saves && (part === 'single' || part === 'end'),
        offered: markedTime !== null && (showAll || markedTime === offered),
        reachable: markedTime !== null && markedTime === reachable,
        framed: framed[0] === hour ? framed.length : 0,
      };
    });
  });

  /** The day has no time, marked or saved, nor one being drawn. */
  protected readonly empty = computed<boolean>(
    () => this.times().saved.length === 0 && this.rows().every((row) => !row.marked),
  );

  /**
   * The trash's place is kept while the day has no time: without a limit to the room of the
   * list, or where that room spares the place's height under the list, so it costs no hour. The
   * page leaves the place out of the room it measures, so keeping it never changes the room.
   */
  protected readonly kept = computed<boolean>(() => {
    const spare = this.scroller().spare();
    return spare === null || spare >= PLACE_PX;
  });

  /** The day has a time, marked or saved: its trash is under the column. */
  protected readonly clearable = computed<boolean>(
    () => this.times().marked.length > 0 || this.times().saved.length > 0,
  );

  private readonly transloco = inject(TranslocoService);
  /** The saved times as their pills read them, the one being edited as the edit has left it. */
  protected readonly pills = computed<readonly TimePill[]>(() => {
    const edit = this.editing();
    return this.times().saved.map((saved) => {
      const time = saved === edit?.saved ? edit.now : saved;
      const ends = (time.kind === 'single' ? [time.at] : [time.start, time.end]).map(read);
      const [start = '', end = start] = ends;
      const kind = time.kind === 'single' ? '' : 'Range';
      return {
        item: saved,
        ends: ends.map((each) => ({ hour: each.slice(0, -3), minutes: each.slice(-3) })),
        heard:
          time.kind === 'single'
            ? start
            : this.transloco.translate('create.times.savedRange', { start, end }),
        removeTitle: this.transloco.translate(`create.times.remove${kind}Title`),
        removeName: this.transloco.translate(`create.times.remove${kind}Name`, {
          time: start,
          start,
          end,
        }),
      };
    });
  });

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly scroller = viewChild.required(ScrollFold);
  /** The pills of the saved times: there whenever one of them is pressed. */
  private readonly savedPills = viewChild.required<SavedPills<DayTime>>(SavedPills);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('time');
  private readonly rests = viewChildren(LongPress);

  constructor() {
    // Heard on its way down, before what was pressed hears it: by then the edit has ended, so
    // what the press does counts the day as the edit left it, and is not undone by its end.
    const clicked = (event: Event): void => {
      this.clicked(event);
    };
    document.addEventListener('click', clicked, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('click', clicked, { capture: true });
    });

    // The page hears each turn once: an edit that goes from one pill to another is still one.
    let told = false;
    effect(() => {
      const editing = this.inEditing();
      if (editing === told) return;
      told = editing;
      this.editingSaved.emit(editing);
    });
  }

  /** The hour the tip points at: the one held, while the focus is on it and the list is still. */
  protected readonly tipHour = computed<HTMLButtonElement | null>(() => {
    const held = this.held();
    if (held === null || held !== this.tabStop() || this.tipLost()) return null;
    return this.buttons()[held]?.nativeElement ?? null;
  });

  /**
   * The row a finger rests on, where its ring closes: over the whole page, since the list and the
   * window on the columns cut what leaves them. An hour between the ends of a range is not held,
   * and has no ring.
   */
  protected readonly ring = computed<HTMLElement | null>(() => {
    const hour = this.rests().findIndex((rest) => rest.holding());
    const row = this.buttons()[hour]?.nativeElement.parentElement;
    if (!row || this.rows()[hour]?.part === 'between') return null;
    return row;
  });

  /**
   * A press on an hour: the last hour of the range from the hour held, or a press of its own.
   * During a drag it is nothing: the drag ends where the pointer is released.
   */
  protected press(hour: number): void {
    if (this.inEdit(hour)) return;
    this.endEditing();
    const held = this.held();
    if (held !== null) this.make({ from: held, to: hour });
    else if (!this.making()) this.change(pressHour(this.times(), hour, this.isFull()));
  }

  /**
   * The time of an hour moves a quarter, unless a range is being made: the saved time being
   * edited on its own hours, the marked time on any other, where the edit ends.
   */
  protected move(hour: number, by: -1 | 1): void {
    const edit = this.editing();
    if (edit && this.inEdit(hour)) {
      this.edit.set(shiftEdited(this.times(), edit, hour, by, this.isFull()));
      return;
    }
    this.endEditing();
    if (!this.making()) this.change(shiftQuarter(this.times(), hour, by, this.isFull()));
  }

  /**
   * The hour is held as an end of a range, and the edit of a saved time ends; between the ends
   * of a range nothing is, nor during a drag.
   */
  protected hold(hour: number): void {
    if (this.making() || this.inEdit(hour)) return;
    this.endEditing();
    if (markAt(this.times().marked, hour).part === 'between') return;
    this.tipLost.set(false);
    this.held.set(hour);
  }

  /**
   * A drag goes on, or is given up (`null`); it takes the place of an hour held and ends the
   * edit of a saved time, unless it begins on one of its hours: there it draws nothing.
   */
  protected dragged(span: RowDragSpan | null): void {
    this.held.set(null);
    const drawn = span && !this.inEdit(span.from) ? span : null;
    if (drawn) this.endEditing();
    this.drag.set(drawn);
  }

  /** The range of a drag or of the hour held is made, if it draws one, and nothing is held. */
  protected make(span: RowDragSpan): void {
    const drag = this.inEdit(span.from)
      ? null
      : dragHours(this.times(), span.from, span.to, this.isFull());
    // A drag leaves the mouse on the hour it reached.
    const under = this.drag() ? span.to : this.hovered();
    this.drag.set(null);
    this.held.set(null);
    if (drag) this.change(drag.times, under);
  }

  /** The mouse comes over an hour; a finger's touch is not a mouse resting. */
  protected over(event: PointerEvent, hour: number): void {
    if (event.pointerType === 'touch') return;
    this.hovered.set(hour);
    if (hour !== this.rested()) this.rested.set(null);
  }

  /** The mouse leaves an hour. */
  protected out(): void {
    this.hovered.set(null);
    this.rested.set(null);
  }

  /**
   * The "+" of a marked time: the time is saved, and its hour takes the focus the "+" had. A
   * pointer's press counts only on a "+" that is shown; the keyboard has it in sight with the
   * focus, and its press comes with no count of clicks.
   */
  protected save(row: HourRow, event: MouseEvent): void {
    if (row.time === null || (event.detail > 0 && !row.offered)) return;
    this.change(saveTime(this.times(), row.time));
    this.focus(row.hour);
  }

  /**
   * A press on a pill: its saved time is edited, its hours brought into sight with the hour
   * before them, and the edit that was going on ends; on the pill of that one (`null`), it only
   * ends, and the focus goes to the pill of its time as it is then saved. An hour held for a
   * range is let go.
   */
  protected edits(time: DayTime | null): void {
    const ended = this.editing();
    this.endEditing();
    this.held.set(null);
    this.edit.set(time && { saved: time, now: time });
    const hours = hoursOf(time);
    const [first, last = first] = [hours[0], hours.at(-1)];
    if (first !== undefined && last !== undefined) this.scroller().reveal(first - 1, last);
    // The pill pressed to end its edit is another once its time has changed, or is gone into the
    // pill of the saved time it joined: the focus stays with its time.
    const now = ended && savedLike(this.times(), ended.now);
    if (time === null && now) this.savedPills().focus(now);
  }

  /** ← → on the pill of the time being edited: a time of its own moves, as on its hour. */
  protected nudge(event: Event, by: -1 | 1): void {
    const edit = this.editing();
    const [hour] = hoursOf(edit?.now ?? null);
    const onItsPill = (event.target as Element).getAttribute('aria-pressed') === 'true';
    if (edit?.now.kind !== 'single' || hour === undefined || !onItsPill) return;
    event.preventDefault();
    this.move(hour, by);
  }

  /**
   * The "−" of a pill: its time is no longer saved. The pills pass the focus on among
   * themselves; with none left it goes back to the hours.
   */
  protected remove(time: DayTime): void {
    this.times.update((times) => removeSavedTime(times, time));
    if (this.times().saved.length > 0) return;
    afterNextRender(
      () => {
        this.focus(this.tabStop());
      },
      { injector: this.injector },
    );
  }

  /**
   * The trash's "Sí": the day has no time, marked nor saved, and an hour held for a range is let
   * go; an edit going on ends with its saved time. The focus goes back to the hours.
   */
  protected clear(): void {
    this.held.set(null);
    this.times.set(NO_TIMES);
    afterNextRender(
      () => {
        this.focus(this.tabStop());
      },
      { injector: this.injector },
    );
  }

  /**
   * A click anywhere off the column ends the edit; whatever was pressed does what it does. On
   * the column, its hours, arrows and pills say what a press does to the edit, and ︿ ﹀ only
   * bring its hours into sight.
   */
  private clicked(event: Event): void {
    if (!this.host.contains(event.target as Node | null)) this.endEditing();
  }

  /**
   * The focus leaves the column: the range drawn from the hour held is made, and the edit ends,
   * unless the focus goes nowhere, as after a press on what takes none: the press says.
   */
  protected left(event: FocusEvent): void {
    const to = event.relatedTarget as Node | null;
    if (this.host.contains(to)) return;
    if (to !== null) this.endEditing();
    const held = this.held();
    if (held !== null) this.make({ from: held, to: this.tabStop() });
  }

  /** The focus goes to another hour, if the day has it. */
  protected focus(hour: number): void {
    this.buttons()[hour]?.nativeElement.focus();
  }

  /** The hour is one of the saved time being edited, as the edit has left it. */
  private inEdit(hour: number): boolean {
    const edit = this.editing();
    return edit !== null && markAt([edit.now], hour).part !== 'free';
  }

  /** The edit ends: its saved time is as the edit left it. */
  private endEditing(): void {
    const edit = this.editing();
    this.edit.set(null);
    if (edit) this.times.update((times) => endEdit(times, edit, this.isFull()));
  }

  /** The event takes no more options, as it is at this moment. */
  private isFull(): boolean {
    return this.full()();
  }

  /**
   * The day's times change, with the mouse on the hour `under`: its "+" is not shown until the
   * mouse comes back.
   */
  private change(times: DayTimes, under: number | null = this.hovered()): void {
    this.times.set(times);
    this.rested.set(under);
  }
}

/** The hours of the day a time takes, in order; none for no time. */
function hoursOf(time: DayTime | null): readonly number[] {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return time ? hours.filter((hour) => markAt([time], hour).part !== 'free') : [];
}

/** The classes of an hour's row, from its part, what is on it and the saved times that take it. */
function classesOf(
  part: HourMark['part'],
  live: boolean,
  edited: boolean,
  saved: readonly HourMark['part'][],
): string {
  if (part !== 'free') return `${part} marked${live ? ' live' : ''}${edited ? ' edited' : ''}`;
  if (saved.every((each) => each === 'free')) return '';
  const joined = saved.some((each) => each === 'start' || each === 'between');
  return `saved${joined ? ' joined' : ''}`;
}

/** `09:30` → "9:30". */
function read(time: string): string {
  return `${String(Number(time.slice(0, 2)))}${time.slice(2)}`;
}
