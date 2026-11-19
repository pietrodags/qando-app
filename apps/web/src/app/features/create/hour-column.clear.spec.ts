import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import { type DayTime, type DayTimes, NO_TIMES } from './day-times';
import { HourColumn } from './hour-column';

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

function range(start: string, end: string): DayTime {
  return { kind: 'range', start, end };
}

@Component({
  imports: [HourColumn],
  template: `
    <app-hour-column [(times)]="times" [full]="full" (editingSaved)="editing.push($event)" />
  `,
})
class Host {
  readonly times = signal<DayTimes>(NO_TIMES);
  readonly full = signal(false);
  /** What the column has said about an edit of its own: it begins, it ends. */
  readonly editing: boolean[] = [];
}

describe('HourColumn, its trash', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    installTestScreen();
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  async function render(times: Partial<DayTimes> = {}): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.times.set({ ...NO_TIMES, ...times });
    // In the page: the focus is followed, and a click reaches the document.
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('app-hour-column')!;
  }

  function times(): DayTimes {
    return fixture.componentInstance.times();
  }

  /** The hour that shows a time, as "18:00". */
  function hour(time: string): HTMLButtonElement {
    const found = [...host().querySelectorAll<HTMLButtonElement>('button.time')].find(
      (each) => each.textContent.trim() === time,
    );
    if (!found) throw new Error(`No hour shows ${time}`);
    return found;
  }

  function trash(): HTMLButtonElement | null {
    return host().querySelector<HTMLButtonElement>('button[aria-label="Limpiar horarios"]');
  }

  function question(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[role="group"][aria-label="¿Borrar?"]');
  }

  function answer(name: string): HTMLButtonElement {
    const found = [...(question()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (each) => each.textContent.trim() === name,
    );
    if (!found) throw new Error(`No answer ${name}`);
    return found;
  }

  async function click(target: HTMLElement | null): Promise<void> {
    if (!target) throw new Error('Nothing to press');
    target.click();
    await fixture.whenStable();
  }

  /** The trash is pressed and its question answered "Sí". */
  async function clear(): Promise<void> {
    await click(trash());
    await click(answer('Sí'));
  }

  it('is not there while the day has no time, but its place is', async () => {
    await render();

    expect(trash()).toBeNull();
    expect(host().querySelector('.clear-place')).not.toBeNull();
  });

  it('is there while the day has a marked time, under the hours', async () => {
    await render();

    await click(hour('10:00'));

    expect(host().querySelector('.clear-place')?.contains(trash())).toBe(true);
    // After the list and its ﹀: the trash is the column's last button.
    expect([...host().querySelectorAll('button')].at(-1)).toBe(trash());
  });

  it('is there while the day has only saved times, under their pills', async () => {
    await render({ saved: [at('18:00')] });

    const pills = host().querySelector('app-saved-pills');
    expect(trash()).not.toBeNull();
    expect(pills?.compareDocumentPosition(trash()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('asks "¿Borrar?" in its place, and "No" leaves the times as they are', async () => {
    await render({ marked: [at('10:00')], saved: [at('18:00')] });

    await click(trash());
    expect(question()).not.toBeNull();
    expect(trash()).toBeNull();

    await click(answer('No'));
    expect(times()).toEqual({ marked: [at('10:00')], saved: [at('18:00')] });
    expect(trash()).not.toBeNull();
  });

  it('clears the marked and the saved times with "Sí", and goes, the focus back on the hours', async () => {
    await render({ marked: [at('10:00'), range('12:00', '14:00')], saved: [at('18:00')] });

    await clear();

    expect(times()).toEqual(NO_TIMES);
    expect(trash()).toBeNull();
    expect(document.activeElement).toBe(hour('9:00'));
  });

  it('lets go of an hour held for a range with the keyboard', async () => {
    await render({ marked: [at('18:00')] });
    hour('10:00').focus();
    hour('10:00').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    await fixture.whenStable();

    await clear();
    await click(hour('12:00'));

    expect(times()).toEqual({ marked: [at('12:00')], saved: [] });
  });

  it('ends the edit of a saved time with its time', async () => {
    await render({ saved: [at('18:00')] });
    await click(host().querySelector<HTMLElement>('app-saved-pills button.pill-view'));
    expect(fixture.componentInstance.editing).toEqual([true]);

    await clear();

    expect(times()).toEqual(NO_TIMES);
    expect(fixture.componentInstance.editing).toEqual([true, false]);
  });
});
