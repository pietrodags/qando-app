import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HoldRing } from './hold-ring';

@Component({
  imports: [HoldRing],
  template: `<button #nine type="button">9</button>
    <button #ten type="button">10</button>
    @if (shown()) {
      <app-hold-ring [anchor]="onTen() ? ten : nine" />
    }`,
})
class Host {
  readonly shown = signal(true);
  readonly onTen = signal(false);
}

describe('HoldRing', () => {
  let fixture: ComponentFixture<Host>;
  /** The elements the browser was asked to draw in its top layer, in order. */
  let raised: Element[];

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The ring, wherever it is in the page: it is drawn from the page's body (`TopLayer`). */
  function ring(): HTMLElement | null {
    return document.querySelector('app-hold-ring');
  }

  /** The button `name`, placed on screen at `box`. */
  function place(name: string, box: Partial<DOMRect>): void {
    const button = [...element().querySelectorAll('button')].find(
      (each) => each.textContent.trim() === name,
    );
    if (!button) throw new Error(`No button ${name}`);
    button.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 0, height: 0, ...box }) as DOMRect;
  }

  beforeEach(async () => {
    raised = [];
    // jsdom has no popovers: the browser's part, standing in.
    HTMLElement.prototype.showPopover = function (this: HTMLElement) {
      raised.push(this);
    };
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    place('9', { top: 120, left: 30, width: 50, height: 46 });
    place('10', { top: 120, left: 82, width: 48, height: 44 });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    Reflect.deleteProperty(document.documentElement, 'getBoundingClientRect');
  });

  async function show(): Promise<void> {
    fixture.componentInstance.shown.set(true);
    await fixture.whenStable();
  }

  it('is drawn over the whole page, where nothing around its anchor cuts it', async () => {
    await show();

    expect(raised).toEqual([ring()]);
  });

  it('is as large as its anchor and where it is on screen', async () => {
    await show();

    expect(ring()?.style.insetBlockStart).toBe('120px');
    expect(ring()?.style.insetInlineStart).toBe('30px');
    expect(ring()?.style.inlineSize).toBe('50px');
    expect(ring()?.style.blockSize).toBe('46px');
  });

  it('is where its anchor is on screen also inside the room the page keeps for its scrollbars, from where what is drawn over the page starts', async () => {
    // The page 15 px in from each side of the window and scrolled 300 px down.
    document.documentElement.getBoundingClientRect = () =>
      ({ top: -300, left: 15, width: 1250, height: 2000 }) as DOMRect;
    await show();

    expect(ring()?.style.insetBlockStart).toBe('120px');
    expect(ring()?.style.insetInlineStart).toBe('15px');
  });

  it('goes to another anchor', async () => {
    await show();
    fixture.componentInstance.onTen.set(true);
    await fixture.whenStable();

    expect(ring()?.style.insetInlineStart).toBe('82px');
    expect(ring()?.style.inlineSize).toBe('48px');
    expect(ring()?.style.blockSize).toBe('44px');
  });

  it('closes in the time a finger rests for a long-press', async () => {
    await show();

    expect(ring()?.style.getPropertyValue('--hold-duration')).toBe('500ms');
  });

  it('is for the eyes only', async () => {
    await show();

    expect(ring()?.getAttribute('aria-hidden')).toBe('true');
  });
});
