import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { installTestScreen } from '../../../test/media-queries';
import { type DayTime, type DayTimes, NO_TIMES } from './day-times';
import { HourColumn } from './hour-column';

// As the stylesheet lays the hours out: rows of 35 px, 6 px apart.
const ROW = 35;
const GAP = 6;

function at(time: string): DayTime {
  return { kind: 'single', at: time };
}

function range(start: string, end: string): DayTime {
  return { kind: 'range', start, end };
}

@Component({
  imports: [HourColumn],
  template: `
    <button type="button" class="elsewhere">Elsewhere</button>
    <app-hour-column [(times)]="times" [full]="full" [touch]="touch()" [saving]="saving()" />
  `,
})
class Host {
  readonly times = signal<DayTimes>(NO_TIMES);
  readonly full = signal(false);
  readonly touch = signal(false);
  readonly saving = signal(false);
}

describe('HourColumn, its saved times', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    installTestScreen();
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  /** A button of the page, off the column. */
  function elsewhere(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.elsewhere')!;
  }

  function hours(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('button.time')];
  }

  /** The hour that shows a time, as "18:00"; an hour between the ends of a range shows "11". */
  function hour(time: string): HTMLButtonElement {
    const found = hours().find((each) => each.textContent.trim() === time);
    if (!found) throw new Error(`No hour shows ${time}`);
    return found;
  }

  function rowOf(time: string): HTMLElement {
    return hour(time).parentElement!;
  }

  /** The hours whose row has a class, as they show. */
  function rowsWith(name: string): string[] {
    return hours()
      .filter((each) => each.parentElement?.classList.contains(name))
      .map((each) => each.textContent.trim());
  }

  function pressed(): string[] {
    return hours()
      .filter((each) => each.getAttribute('aria-pressed') === 'true')
      .map((each) => each.textContent.trim());
  }

  function plus(time: string): HTMLButtonElement {
    const found = rowOf(time).querySelector<HTMLButtonElement>('button.save');
    if (!found) throw new Error(`The hour ${time} has no "+"`);
    return found;
  }

  function pluses(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('button.save')];
  }

  function arrow(name: string): HTMLButtonElement {
    const found = [...host().querySelectorAll<HTMLButtonElement>('button.quarter')].find(
      (each) => each.getAttribute('aria-label') === name,
    );
    if (!found) throw new Error(`No arrow is named ${name}`);
    return found;
  }

  function pills(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('app-saved-pills button.pill-view')];
  }

  /** What the pills read, a range as "10:00→13:15". */
  function read(): string[] {
    return pills().map((each) => each.querySelector('.label')!.textContent.trim());
  }

  function pill(reading: string): HTMLButtonElement {
    const found = pills()[read().indexOf(reading)];
    if (!found) throw new Error(`No pill reads ${reading}`);
    return found;
  }

  function minus(reading: string): HTMLButtonElement | null {
    return pill(reading).parentElement!.querySelector<HTMLButtonElement>('button.remove');
  }

  function model(): DayTimes {
    return fixture.componentInstance.times();
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  /** The press of a mouse or of a finger, which a "+" tells from the keyboard's. */
  async function pointerClick(target: HTMLElement): Promise<void> {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  }

  /** A pointer comes over an element, or leaves it. */
  async function pointer(target: Element, type: string, pointerType = 'mouse'): Promise<void> {
    const event = new MouseEvent(type);
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    target.dispatchEvent(event);
    await fixture.whenStable();
  }

  async function over(time: string, pointerType = 'mouse'): Promise<void> {
    await pointer(rowOf(time), 'pointerenter', pointerType);
  }

  /** A key pressed on what has the focus; answers whether the browser was kept from acting on it. */
  async function key(
    name: string,
    target: Element | null = document.activeElement,
  ): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target?.dispatchEvent(event);
    await fixture.whenStable();
    return event.defaultPrevented;
  }

  /** Shift+Enter on an hour, which holds it as an end of a range. */
  async function shiftEnter(time: string): Promise<void> {
    hour(time).focus();
    hour(time).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    await fixture.whenStable();
  }

  /** What screen readers hear while an hour is held. */
  function heard(): string {
    return host().querySelector('[role="status"]')!.textContent.trim();
  }

  describe('on its hours', () => {
    it('shows a saved time as a pale band on its free hours, one band along a range', async () => {
      await render({ marked: [at('11:00')], saved: [range('10:00', '12:15'), at('12:00')] });

      expect(rowsWith('saved')).toEqual(['10:00', '12:00']);
      expect(rowsWith('joined')).toEqual(['10:00']);
      expect(pressed()).toEqual(['11:00']);
    });

    it('joins the hours of each saved range, and not two saved times that only touch', async () => {
      await render({ saved: [range('09:00', '10:00'), range('10:00', '11:00'), at('12:00')] });

      expect(rowsWith('saved')).toEqual(['9:00', '10:00', '11:00', '12:00']);
      expect(rowsWith('joined')).toEqual(['9:00', '10:00']);
    });

    it('carries the band of a saved range through the free hours between its ends', async () => {
      await render({ saved: [range('10:00', '13:00')] });

      expect(rowsWith('saved')).toEqual(['10:00', '11:00', '12:00', '13:00']);
      expect(rowsWith('joined')).toEqual(['10:00', '11:00', '12:00']);
    });

    it('is not grey with a saved time and no marked one', async () => {
      await render({ saved: [at('18:00')] });

      expect(host().querySelector('.hours')!.classList).not.toContain('empty');
    });
  });

  describe('the "+" of a marked time', () => {
    it('is on its hour, or on the last hour of its range, named after what it saves', async () => {
      await render({ marked: [range('10:00', '13:15'), at('18:15')] });

      expect(pluses()).toEqual([plus('13:15'), plus('18:15')]);
      expect(plus('13:15').getAttribute('aria-label')).toBe('Guardar el rango de 10:00 a 13:15');
      expect(plus('13:15').title).toBe('Guardar este rango de horas');
      expect(plus('18:15').getAttribute('aria-label')).toBe('Guardar la hora 18:15');
      expect(plus('18:15').title).toBe('Guardar esta hora');
    });

    it('is not shown under the mouse that has just marked its time, whose press does nothing', async () => {
      await render();

      await over('18:00');
      await click(hour('18:00'));
      expect(plus('18:00').classList).not.toContain('offered');
      await pointerClick(plus('18:00'));

      expect(pressed()).toEqual(['18:00']);
      expect(model().saved).toEqual([]);
    });

    it('is shown once the mouse comes back to its time, and its press saves the time', async () => {
      await render({ saved: [at('20:00')] });
      await over('18:00');
      await click(hour('18:00'));

      await pointer(rowOf('18:00'), 'pointerleave');
      await over('18:00');
      expect(plus('18:00').classList).toContain('offered');
      await pointerClick(plus('18:00'));

      expect(model()).toEqual({ marked: [], saved: [at('18:00'), at('20:00')] });
      expect(read()).toEqual(['18:00', '20:00']);
      expect(document.activeElement).toBe(hour('18:00'));
    });

    it('is hidden again once the mouse leaves its time', async () => {
      await render({ marked: [at('18:00')] });
      await over('18:00');
      expect(plus('18:00').classList).toContain('offered');

      await pointer(rowOf('18:00'), 'pointerleave');

      expect(plus('18:00').classList).not.toContain('offered');
    });

    it('is shown from any hour of its range, and from another hour of the range just changed', async () => {
      await render({ marked: [range('10:00', '12:00'), at('18:00')] });

      await over('11');
      expect(pluses().map((each) => each.classList.contains('offered'))).toEqual([true, false]);

      await over('12:00');
      await click(arrow('12:00, quince minutos después'));
      expect(plus('12:15').classList).not.toContain('offered');
      await over('10:00');
      expect(plus('12:15').classList).toContain('offered');
    });

    it('is not shown by a finger that touches its time', async () => {
      await render({ marked: [at('18:00')] });

      await over('18:00', 'touch');

      expect(plus('18:00').classList).not.toContain('offered');
    });

    it('is shown on every marked time while the page says so, and a press saves', async () => {
      await render({ marked: [range('10:00', '12:00'), at('18:00')] });

      fixture.componentInstance.saving.set(true);
      await fixture.whenStable();
      expect(pluses().every((each) => each.classList.contains('offered'))).toBe(true);
      expect(host().classList).toContain('saving');
      await pointerClick(plus('12:00'));

      expect(model()).toEqual({ marked: [at('18:00')], saved: [range('10:00', '12:00')] });
    });

    it('is reached with Tab from its time only, and the keyboard’s press always saves', async () => {
      await render({ marked: [range('10:00', '12:00'), at('18:00')] });
      expect(pluses().map((each) => each.tabIndex)).toEqual([-1, -1]);

      hour('10:00').focus();
      await fixture.whenStable();
      expect(pluses().map((each) => each.tabIndex)).toEqual([0, -1]);
      expect(plus('12:00').classList).toContain('reachable');
      plus('12:00').focus();
      await click(plus('12:00'));

      expect(model()).toEqual({ marked: [at('18:00')], saved: [range('10:00', '12:00')] });
      expect(document.activeElement).toBe(hour('12:00'));
    });

    it('is not there while a range is being made, nor while a saved time is edited', async () => {
      await render({ marked: [at('18:00')], saved: [at('20:00')] });

      hour('18:00').focus();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      await fixture.whenStable();
      expect(pluses()).toEqual([]);

      await key('Escape');
      expect(pluses()).toHaveLength(1);
      await click(pill('20:00'));
      expect(pluses()).toEqual([]);
    });
  });

  describe('its pills', () => {
    it('are not there without a saved time', async () => {
      await render({ marked: [at('18:00')] });

      expect(host().querySelector('app-saved-pills')).toBeNull();
    });

    it('read each saved time under the list, and screen readers hear a range in words', async () => {
      await render({ saved: [at('09:15'), range('10:00', '13:15')] });

      expect(read()).toEqual(['9:15', '10:00→13:15']);
      expect(pills().map((each) => each.querySelector('.visually-hidden')!.textContent)).toEqual([
        '9:15',
        'de 10:00 a 13:15',
      ]);
      expect(pills().every((each) => each.querySelector('.label[aria-hidden="true"]'))).toBe(true);
      expect(host().querySelector('app-saved-pills')!.classList).toContain('stacked');
    });

    it('have a "−" each, named after the time it deletes', async () => {
      await render({ saved: [at('09:15'), range('10:00', '13:15')] });

      expect(minus('9:15')!.title).toBe('Eliminar esta hora');
      expect(minus('9:15')!.getAttribute('aria-label')).toBe('Eliminar la hora 9:15');
      expect(minus('10:00→13:15')!.title).toBe('Eliminar este rango de horas');
      expect(minus('10:00→13:15')!.getAttribute('aria-label')).toBe(
        'Eliminar el rango de 10:00 a 13:15',
      );
    });

    it('delete a saved time with its "−", what is marked on its hours staying', async () => {
      await render({ marked: [at('10:00')], saved: [at('09:15'), range('10:00', '13:15')] });

      await click(minus('10:00→13:15')!);

      expect(model()).toEqual({ marked: [at('10:00')], saved: [at('09:15')] });
      expect(read()).toEqual(['9:15']);
    });

    it('give the focus back to the hours when the last one is deleted', async () => {
      await render({ saved: [at('09:15')] });
      hour('14:00').focus();
      minus('9:15')!.focus();

      await click(minus('9:15')!);

      expect(model().saved).toEqual([]);
      expect(document.activeElement).toBe(hour('14:00'));
    });

    it('keep the focus among themselves when one of several is deleted, never through the hours', async () => {
      await render({ saved: [at('09:15'), at('18:00')] });
      let onTheHours = 0;
      host()
        .querySelector('.hours')!
        .addEventListener('focusin', () => {
          onTheHours += 1;
        });
      minus('9:15')!.focus();

      await click(minus('9:15')!);

      expect(document.activeElement).toBe(pill('18:00'));
      expect(onTheHours).toBe(0);
    });

    it('are told a device has no mouse: the "−" is only on the pill pressed, and deletes it', async () => {
      await render({ saved: [at('09:15'), at('18:00')] });
      fixture.componentInstance.touch.set(true);
      await fixture.whenStable();
      expect(minus('9:15')).toBeNull();

      await click(pill('9:15'));
      expect(minus('18:00')).toBeNull();
      await click(minus('9:15')!);

      expect(model().saved).toEqual([at('18:00')]);
      expect(rowsWith('edited')).toEqual([]);
    });

    it('outline a saved time on its hours while the mouse is over its pill', async () => {
      await render({ saved: [at('09:15'), range('10:00', '13:15')] });
      const frames = (): HTMLElement[] => [...host().querySelectorAll<HTMLElement>('.frame')];
      expect(frames()).toEqual([]);

      await pointer(pill('10:00→13:15').parentElement!, 'pointerenter');
      expect(frames()).toHaveLength(1);
      expect(frames()[0]!.parentElement).toBe(rowOf('10:00'));
      expect(frames()[0]!.style.getPropertyValue('--n')).toBe('4');

      await pointer(pill('10:00→13:15').parentElement!, 'pointerleave');
      expect(frames()).toEqual([]);
    });

    it('outline no saved time while one is edited', async () => {
      await render({ saved: [at('09:15'), at('18:00')] });

      await click(pill('9:15'));
      await pointer(pill('18:00').parentElement!, 'pointerenter');

      expect(host().querySelector('.frame')).toBeNull();
    });
  });

  describe('a saved time being edited', () => {
    const SAVED: DayTimes = { marked: [], saved: [range('10:00', '12:00'), at('18:00')] };

    it('starts with a press on its pill: its hours show it with its minutes and arrows', async () => {
      await render({ marked: [at('11:00')], saved: [range('10:00', '12:15')] });

      await click(pill('10:00→12:15'));

      expect(pill('10:00→12:15').getAttribute('aria-pressed')).toBe('true');
      expect(rowsWith('edited')).toEqual(['10:00', '11', '12:15']);
      expect([...rowOf('10:00').classList].sort()).toEqual(['edited', 'marked', 'row', 'start']);
      expect([...rowOf('12:15').classList].sort()).toEqual(['edited', 'end', 'marked', 'row']);
      expect(hour('12:15').getAttribute('aria-label')).toBe('12:15, rango de 10:00 a 12:15');
      // What is marked under it is not shown meanwhile, nor counted as pressed.
      expect(pressed()).toEqual([]);
      expect(arrow('12:15, quince minutos antes')).toBeTruthy();
    });

    it('moves by quarters with its arrows: its pill reads it at once, the day’s times wait', async () => {
      await render(SAVED);
      await click(pill('10:00→12:00'));

      await click(arrow('12:00, quince minutos después'));
      await click(arrow('10:00, quince minutos después'));

      expect(read()).toEqual(['10:15→12:15', '18:00']);
      expect(hour('10:15')).toBeTruthy();
      expect(model()).toEqual(SAVED);
    });

    it('ends with another press on its pill: the time is saved as edited, in its place', async () => {
      await render({ marked: [], saved: [at('10:00'), at('10:45'), at('18:00')] });
      await click(pill('10:00'));
      await click(arrow('10:00, quince minutos después'));
      await click(arrow('10:15, quince minutos después'));
      await click(arrow('10:30, quince minutos después'));
      expect(read()).toEqual(['10:45', '10:45', '18:00']);

      await click(pill('10:45'));

      expect(model().saved).toEqual([at('10:45'), at('18:00')]);
      expect(rowsWith('edited')).toEqual([]);
      expect(pills().some((each) => each.getAttribute('aria-pressed') === 'true')).toBe(false);
    });

    it('greys an arrow where its hour ends, and its press leaves the edit', async () => {
      await render(SAVED);
      await click(pill('18:00'));

      const earlier = arrow('18:00, quince minutos antes');
      expect(earlier.getAttribute('aria-disabled')).toBe('true');
      expect(arrow('18:00, quince minutos después').getAttribute('aria-disabled')).toBe('false');
      await click(earlier);

      expect(read()).toEqual(['10:00→12:00', '18:00']);
      expect(rowsWith('edited')).toEqual(['18:00']);
    });

    it('greys the arrows that would make one option more when the event takes no more', async () => {
      await render({ marked: [at('18:00')], saved: [at('18:00')] });
      fixture.componentInstance.full.set(true);
      await click(pill('18:00'));

      expect(arrow('18:00, quince minutos después').getAttribute('aria-disabled')).toBe('true');
    });

    it('leaves the arrows of the marked times as they were', async () => {
      await render({ marked: [at('09:00')], saved: [at('18:00')] });

      await click(pill('18:00'));

      expect(arrow('9:00, quince minutos antes').getAttribute('aria-disabled')).toBe('true');
      expect(arrow('9:00, quince minutos después').getAttribute('aria-disabled')).toBe('false');
    });

    it('is not touched by a press on one of its hours', async () => {
      await render(SAVED);
      await click(pill('10:00→12:00'));

      await click(hour('11'));

      expect(rowsWith('edited')).toEqual(['10:00', '11', '12:00']);
      expect(model()).toEqual(SAVED);
    });

    it('is not touched by Shift+Enter on one of its hours, which is not held', async () => {
      await render(SAVED);
      await click(pill('10:00→12:00'));
      await click(arrow('12:00, quince minutos después'));

      await shiftEnter('10:00');

      expect(heard()).toBe('');
      expect(rowsWith('edited')).toEqual(['10:00', '11', '12:15']);
      expect(model()).toEqual(SAVED);
    });

    it('ends with Shift+Enter on another hour, which is held all the same', async () => {
      await render(SAVED);
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      await shiftEnter('9:00');

      expect(model().saved).toEqual([range('10:00', '12:00'), at('18:15')]);
      expect(rowsWith('edited')).toEqual([]);
      expect(heard()).toBe('Elige la última hora del rango.');
    });

    it('ends with a press on another hour, which is marked all the same', async () => {
      await render({ marked: [], saved: [at('18:00'), at('18:15')] });
      await click(pill('18:15'));
      await click(arrow('18:15, quince minutos antes'));

      await click(hour('9:00'));

      expect(model()).toEqual({ marked: [at('09:00')], saved: [at('18:00')] });
      expect(rowsWith('edited')).toEqual([]);
    });

    it('ends with the arrow of a marked time, which moves all the same', async () => {
      await render({ marked: [at('09:00')], saved: [at('18:00')] });
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      await click(arrow('9:00, quince minutos después'));

      expect(model()).toEqual({ marked: [at('09:15')], saved: [at('18:15')] });
    });

    it('gives way to the edit of another saved time', async () => {
      await render(SAVED);
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      await click(pill('10:00→12:00'));

      expect(model().saved).toEqual([range('10:00', '12:00'), at('18:15')]);
      expect(rowsWith('edited')).toEqual(['10:00', '11', '12:00']);
    });

    it('is undone by Escape, wherever the focus is', async () => {
      await render(SAVED);
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      await key('Escape', document.body);

      expect(model()).toEqual(SAVED);
      expect(read()).toEqual(['10:00→12:00', '18:00']);
      expect(rowsWith('edited')).toEqual([]);
    });

    it('ends with a click anywhere else on the page, and not on what scrolls its hours', async () => {
      await render(SAVED);
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      await click(host().querySelector<HTMLButtonElement>('button.fold')!);
      expect(rowsWith('edited')).toEqual(['18:15']);
      await click(elsewhere());

      expect(model().saved).toEqual([range('10:00', '12:00'), at('18:15')]);
      expect(rowsWith('edited')).toEqual([]);
    });

    it('ends as it was saved when it has not moved: its pill is pressed no more', async () => {
      await render(SAVED);
      await click(pill('18:00'));

      await click(elsewhere());

      expect(rowsWith('edited')).toEqual([]);
      expect(pills().some((each) => each.getAttribute('aria-pressed') === 'true')).toBe(false);
      expect(model()).toEqual(SAVED);
    });

    it('ends when the focus leaves the column, and not when it goes nowhere', async () => {
      await render(SAVED);
      pill('18:00').focus();
      await click(pill('18:00'));
      await click(arrow('18:00, quince minutos después'));

      pill('18:15').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await fixture.whenStable();
      expect(rowsWith('edited')).toEqual(['18:15']);
      elsewhere().focus();
      await fixture.whenStable();

      expect(model().saved).toEqual([range('10:00', '12:00'), at('18:15')]);
      expect(rowsWith('edited')).toEqual([]);
    });

    it('moves with → and ← on an hour that is one of its ends', async () => {
      await render(SAVED);
      await click(pill('10:00→12:00'));

      hour('12:00').focus();
      await key('ArrowRight');
      await key('ArrowRight');
      await key('ArrowLeft');

      expect(read()).toEqual(['10:00→12:15', '18:00']);
      expect(model()).toEqual(SAVED);
    });

    it('moves with → and ← on its pill when it is a time of its own', async () => {
      await render(SAVED);
      pill('18:00').focus();
      await click(pill('18:00'));

      await key('ArrowRight');
      await key('ArrowRight');
      await key('ArrowLeft');
      expect(read()).toEqual(['10:00→12:00', '18:15']);

      // A range has two ends: each is moved on its hour, and another pill moves nothing.
      pill('10:00→12:00').focus();
      await key('ArrowRight');
      expect(read()).toEqual(['10:00→12:00', '18:15']);
    });

    it('keeps → and ← from the browser on its pill, and only while it is being edited', async () => {
      await render(SAVED);
      pill('18:00').focus();
      expect(await key('ArrowRight')).toBe(false);
      expect(read()).toEqual(['10:00→12:00', '18:00']);

      await click(pill('18:00'));

      expect(await key('ArrowRight')).toBe(true);
      expect(await key('ArrowLeft')).toBe(true);
    });

    it('leaves → and ← to the browser on its pill when it is a range, and moves neither end', async () => {
      await render(SAVED);
      pill('10:00→12:00').focus();
      await click(pill('10:00→12:00'));

      expect(await key('ArrowRight')).toBe(false);
      expect(await key('ArrowLeft')).toBe(false);

      expect(read()).toEqual(['10:00→12:00', '18:00']);
    });

    it('leaves the focus on its pill, with its "−", when a press on the pill ends it', async () => {
      await render({ marked: [], saved: [at('09:00'), at('09:15')] });
      pill('9:00').focus();
      await click(pill('9:00'));
      await key('ArrowRight');
      await key('ArrowRight');
      // Past the other saved time, and still in the place it had while it is edited.
      expect(read()).toEqual(['9:30', '9:15']);

      await click(pill('9:30'));

      expect(read()).toEqual(['9:15', '9:30']);
      expect(document.activeElement).toBe(pill('9:30'));
      expect(minus('9:30')).not.toBeNull();
    });

    it('leaves the focus on the pill of the saved time it has become like', async () => {
      await render({ marked: [], saved: [at('09:00'), at('09:15'), at('09:30')] });
      pill('9:00').focus();
      await click(pill('9:00'));
      await key('ArrowRight');
      await key('ArrowRight');
      expect(read()).toEqual(['9:30', '9:15', '9:30']);

      await click(pills()[0]!);

      expect(read()).toEqual(['9:15', '9:30']);
      expect(document.activeElement).toBe(pill('9:30'));
      expect(minus('9:30')).not.toBeNull();
    });

    it('leaves the focus on another pill when the press on that one ends it', async () => {
      await render({ marked: [], saved: [at('09:00'), at('18:00')] });
      pill('9:00').focus();
      await click(pill('9:00'));
      await key('ArrowRight');

      pill('18:00').focus();
      await click(pill('18:00'));

      expect(read()).toEqual(['9:15', '18:00']);
      expect(document.activeElement).toBe(pill('18:00'));
    });

    describe('under a drag of the mouse', () => {
      function drag(target: EventTarget, type: string, hourOfDay: number): void {
        const event = new MouseEvent(type, {
          bubbles: true,
          clientX: 140,
          clientY: 100 + hourOfDay * (ROW + GAP) + ROW / 2,
          buttons: type === 'pointerup' ? 0 : 1,
        });
        Object.defineProperty(event, 'pointerType', { value: 'mouse' });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        target.dispatchEvent(event);
      }

      /** The rows where a browser would lay them out, the list at its top. */
      function layOut(): void {
        const list = host().querySelector<HTMLElement>('.hours')!;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
          this: HTMLElement,
        ) {
          if (this === list) return { top: 100, bottom: 100 + 24 * (ROW + GAP) } as DOMRect;
          const index = Math.max(Array.from(list.children).indexOf(this), 0);
          const start = 100 + index * (ROW + GAP);
          return { top: start, bottom: start + ROW, left: 110, width: 70, height: ROW } as DOMRect;
        });
      }

      async function dragged(from: string, fromHour: number, to: number): Promise<void> {
        layOut();
        drag(hour(from), 'pointerdown', fromHour);
        drag(document, 'pointermove', to);
        await fixture.whenStable();
        drag(document, 'pointerup', to);
        await fixture.whenStable();
      }

      it('leaves no "+" shown on the range it makes until the mouse goes to another hour', async () => {
        await render();

        await dragged('14:00', 14, 16);
        await over('16:00');
        expect(plus('16:00').classList).not.toContain('offered');
        await over('15');

        expect(plus('16:00').classList).toContain('offered');
      });

      it('ends from another hour, where the range is made all the same', async () => {
        await render(SAVED);
        await click(pill('18:00'));
        await click(arrow('18:00, quince minutos después'));

        await dragged('14:00', 14, 16);

        expect(model()).toEqual({
          marked: [range('14:00', '16:00')],
          saved: [range('10:00', '12:00'), at('18:15')],
        });
        expect(rowsWith('edited')).toEqual([]);
      });

      it('goes on from one of its hours, where nothing is drawn', async () => {
        await render(SAVED);
        await click(pill('10:00→12:00'));

        await dragged('12:00', 12, 14);

        expect(model()).toEqual(SAVED);
        expect(rowsWith('edited')).toEqual(['10:00', '11', '12:00']);
        expect(rowsWith('live')).toEqual([]);
      });
    });

    it('lets go of the hour held for a range', async () => {
      await render({ marked: [], saved: [at('18:00')] });
      hour('9:00').focus();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      await fixture.whenStable();

      await click(pill('18:00'));
      await click(hour('11:00'));

      expect(model().marked).toEqual([at('11:00')]);
    });

    it('is over when its saved time is no longer one of the day’s', async () => {
      await render(SAVED);
      await click(pill('18:00'));

      fixture.componentInstance.times.set({ marked: [], saved: [at('18:00')] });
      await fixture.whenStable();

      expect(rowsWith('edited')).toEqual([]);
      expect(pills().some((each) => each.getAttribute('aria-pressed') === 'true')).toBe(false);
    });

    describe('brought into sight', () => {
      /** The list as a browser would lay it out, 9 hours in sight; answers the scrolls asked of it. */
      function laidOut(): { list: HTMLElement; scrolls: ScrollToOptions[] } {
        const list = host().querySelector<HTMLElement>('.hours')!;
        const top = 100;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
          this: HTMLElement,
        ) {
          if (this === list) return { top, bottom: top + list.clientHeight } as DOMRect;
          const index = Array.from(list.children).indexOf(this);
          const start = top + Math.max(index, 0) * (ROW + GAP) - list.scrollTop;
          return { top: start, bottom: start + ROW } as DOMRect;
        });
        Object.defineProperty(list, 'scrollHeight', { value: 24 * ROW + 23 * GAP });
        Object.defineProperty(list, 'clientHeight', { value: 9 * ROW + 8 * GAP });
        const scrolls: ScrollToOptions[] = [];
        list.scrollTo = ((options: ScrollToOptions) => {
          scrolls.push(options);
        }) as HTMLElement['scrollTo'];
        return { list, scrolls };
      }

      it('has its hours in sight, with the hour before them', async () => {
        await render(SAVED);
        const { scrolls } = laidOut();

        await click(pill('18:00'));

        // No further than it takes: 18:00 at the bottom of the list, 17:00 over it.
        expect(scrolls.map((each) => each.top)).toEqual([
          18 * (ROW + GAP) + ROW - (9 * ROW + 8 * GAP),
        ]);
      });

      it('has the last hour of a range at the bottom of the list when it is below', async () => {
        await render({ saved: [range('17:00', '19:15')] });
        const { scrolls } = laidOut();

        await click(pill('17:00→19:15'));

        expect(scrolls.map((each) => each.top)).toEqual([
          19 * (ROW + GAP) + ROW - (9 * ROW + 8 * GAP),
        ]);
      });

      it('has the hour before its first one at the top of the list when it is above', async () => {
        await render(SAVED);
        const { list, scrolls } = laidOut();
        list.scrollTop = 14 * (ROW + GAP);

        await click(pill('10:00→12:00'));

        expect(scrolls.map((each) => each.top)).toEqual([9 * (ROW + GAP)]);
      });
    });
  });
});
