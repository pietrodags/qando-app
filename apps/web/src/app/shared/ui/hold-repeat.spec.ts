import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HoldRepeat, REPEAT_DELAY_MS, REPEAT_EVERY_MS } from './hold-repeat';

@Component({
  imports: [HoldRepeat],
  template: `<button type="button" (appHoldRepeat)="fired = fired + 1" [repeatWhile]="asked">
    ›
  </button>`,
})
class Host {
  fired = 0;
  /** A plain field: nothing tells the page to draw itself again when it changes. */
  repeating = true;
  readonly asked = (): boolean => this.repeating;
}

@Component({
  imports: [HoldRepeat],
  template: `<button type="button" (appHoldRepeat)="fired = fired + 1">›</button>`,
})
class PlainHost {
  fired = 0;
}

describe('HoldRepeat', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.componentInstance;
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fire(type: string, init: MouseEventInit = {}, target: EventTarget = button): void {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  }

  it('fires as soon as a pointer presses the element', () => {
    fire('pointerdown');

    expect(host.fired).toBe(1);
  });

  it('fires again after 400 ms held, and then every 200 ms', () => {
    fire('pointerdown');
    vi.advanceTimersByTime(REPEAT_DELAY_MS - 1);
    expect(host.fired).toBe(1);

    vi.advanceTimersByTime(1);
    expect(host.fired).toBe(2);

    vi.advanceTimersByTime(REPEAT_EVERY_MS - 1);
    expect(host.fired).toBe(2);

    vi.advanceTimersByTime(1 + REPEAT_EVERY_MS * 2);
    expect(host.fired).toBe(5);
  });

  it.each([
    [
      'the pointer lifts',
      () => {
        fire('pointerup');
      },
    ],
    [
      'the browser cancels the pointer',
      () => {
        fire('pointercancel');
      },
    ],
    [
      'the pointer leaves the element',
      () => {
        fire('pointerleave', { bubbles: false });
      },
    ],
    [
      'the window loses the focus',
      () => {
        fire('blur', { bubbles: false }, window);
      },
    ],
    [
      'the element is removed',
      () => {
        fixture.destroy();
      },
    ],
  ])('stops when %s, before the first repeat and between repeats', (_, stop) => {
    fire('pointerdown');
    vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS);
    expect(host.fired).toBe(3);
    stop();
    vi.advanceTimersByTime(REPEAT_EVERY_MS * 5);
    expect(host.fired).toBe(3);
  });

  it.each([
    [
      'the pointer lifts',
      () => {
        fire('pointerup');
      },
    ],
    [
      'the element is removed',
      () => {
        fixture.destroy();
      },
    ],
  ])('never repeats when %s before the delay', (_, stop) => {
    fire('pointerdown');
    vi.advanceTimersByTime(REPEAT_DELAY_MS - 1);
    stop();
    vi.advanceTimersByTime(REPEAT_DELAY_MS * 3);

    expect(host.fired).toBe(1);
  });

  it('does not count the click the browser sends after a pointer press', () => {
    fire('pointerdown');
    fire('pointerup');
    fire('click', { detail: 1 });

    expect(host.fired).toBe(1);
  });

  it('fires once per press with the keyboard, whose click comes without a pointer', () => {
    fire('click', { detail: 0 });
    fire('click', { detail: 0 });
    vi.advanceTimersByTime(REPEAT_DELAY_MS * 3);

    expect(host.fired).toBe(2);
  });

  it('ignores the secondary button', () => {
    fire('pointerdown', { button: 2 });
    vi.advanceTimersByTime(REPEAT_DELAY_MS);

    expect(host.fired).toBe(0);
  });

  it('starts over at each press: a second press does not repeat twice as fast', () => {
    fire('pointerdown');
    vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS);
    fire('pointerdown');
    expect(host.fired).toBe(4);

    vi.advanceTimersByTime(REPEAT_DELAY_MS - 1);
    expect(host.fired).toBe(4);
    vi.advanceTimersByTime(1 + REPEAT_EVERY_MS);
    expect(host.fired).toBe(6);
  });

  it('repeats while held when it is not told whether to', () => {
    const plain = TestBed.createComponent(PlainHost);
    plain.detectChanges();

    fire('pointerdown', {}, (plain.nativeElement as HTMLElement).querySelector('button')!);
    vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS);

    expect(plain.componentInstance.fired).toBe(3);
  });

  describe('while it is not to repeat', () => {
    /** The answer changes as the action itself would change it: the page is not drawn again. */
    function repeat(repeating: boolean): void {
      host.repeating = repeating;
    }

    it('is a plain button: it fires when a press ends on it, not before, however long held', () => {
      repeat(false);

      fire('pointerdown');
      vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS * 3);
      expect(host.fired).toBe(0);

      fire('pointerup');
      fire('click', { detail: 1 });
      expect(host.fired).toBe(1);
    });

    it('fires once per press with the keyboard all the same', () => {
      repeat(false);

      fire('click', { detail: 0 });

      expect(host.fired).toBe(1);
    });

    it('ends a hold under way, whose press does not fire again when it lifts', () => {
      fire('pointerdown');
      vi.advanceTimersByTime(REPEAT_DELAY_MS);
      expect(host.fired).toBe(2);

      repeat(false);
      vi.advanceTimersByTime(REPEAT_EVERY_MS * 3);
      fire('pointerup');
      fire('click', { detail: 1 });
      expect(host.fired).toBe(2);

      fire('pointerdown');
      fire('pointerup');
      fire('click', { detail: 1 });
      expect(host.fired).toBe(3);
    });

    it('ends a hold before its first repeat too', () => {
      fire('pointerdown');
      repeat(false);
      vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS * 3);

      expect(host.fired).toBe(1);
    });

    it('leaves the hold ended when it is to repeat again before the pointer lifts', () => {
      fire('pointerdown');
      vi.advanceTimersByTime(REPEAT_DELAY_MS);
      repeat(false);
      vi.advanceTimersByTime(REPEAT_EVERY_MS);

      repeat(true);
      vi.advanceTimersByTime(REPEAT_EVERY_MS * 3);

      expect(host.fired).toBe(2);
    });
  });
});
