import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HoverTip, TIP_LINGER_MS } from './hover-tip';
import { Tooltip } from './tooltip';

@Component({
  imports: [HoverTip, Tooltip],
  template: `
    @if (present()) {
      <button #anchor type="button" appHoverTip #tip="appHoverTip">
        <svg><path /></svg>
      </button>
      @if (tip.shown()) {
        <app-tooltip [anchor]="anchor">Generar fechas con IA</app-tooltip>
      }
    }
    <p class="elsewhere">Lo demás de la página</p>
  `,
})
class Host {
  readonly present = signal(true);
}

describe('HoverTip', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function anchor(): HTMLButtonElement {
    return element().querySelector('button')!;
  }

  function tip(): HTMLElement | null {
    return element().querySelector('app-tooltip');
  }

  function elsewhere(): HTMLElement {
    return element().querySelector('.elsewhere')!;
  }

  /** The pointer leaves `from` for `to` (`null`: out of the window), as the browser tells it. */
  function out(from: Element, to: Element | null, pointerType = 'mouse'): void {
    const event = new MouseEvent('pointerout', { bubbles: true, relatedTarget: to });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    from.dispatchEvent(event);
    fixture.detectChanges();
  }

  /** The pointer comes over `target`, bubbling up as the browser tells it. */
  function over(target: Element): void {
    const event = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    target.dispatchEvent(event);
    fixture.detectChanges();
  }

  function wait(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  function enter(target: Element, pointerType = 'mouse'): void {
    const event = new MouseEvent('pointerenter');
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    target.dispatchEvent(event);
    fixture.detectChanges();
  }

  function key(name: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    fixture.detectChanges();
  }

  it('shows nothing until the mouse comes over the element', () => {
    expect(tip()).toBeNull();
  });

  it('shows the tip while the mouse is over the element, and hides it a moment after it leaves', () => {
    enter(anchor());
    expect(tip()?.textContent.trim()).toBe('Generar fechas con IA');

    out(anchor(), elsewhere());
    wait(TIP_LINGER_MS - 1);
    expect(tip()).not.toBeNull();
    wait(1);
    expect(tip()).toBeNull();
  });

  it('keeps the tip when the mouse, leaving the round element’s corner, reaches the tip in that moment', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    wait(TIP_LINGER_MS - 1);

    over(tip()!);
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('keeps the tip when the mouse comes back over the element in that moment', () => {
    enter(anchor());
    out(anchor(), elsewhere());

    over(anchor().querySelector('path')!);
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('hides the tip a moment after the mouse, back for a while, leaves again', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    over(anchor());
    wait(TIP_LINGER_MS);

    out(anchor(), elsewhere());
    wait(TIP_LINGER_MS);

    expect(tip()).toBeNull();
  });

  it('counts the moment from the first leaving: crossing more of the page does not lengthen it', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    over(elsewhere());
    wait(TIP_LINGER_MS - 1);
    out(elsewhere(), element());
    over(element());

    wait(1);

    expect(tip()).toBeNull();
  });

  it('keeps the tip when the mouse, having crossed more of the page, comes back over the element in that moment', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    wait(TIP_LINGER_MS - 2);
    out(elsewhere(), element());

    over(anchor().querySelector('path')!);
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('keeps the tip when the mouse passes over the rest of the page while it is over the element', () => {
    enter(anchor());

    over(elsewhere());
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('shows nothing when a finger or a pen touches the element', () => {
    enter(anchor(), 'touch');
    expect(tip()).toBeNull();

    enter(anchor(), 'pen');
    expect(tip()).toBeNull();
  });

  it('keeps the tip while the mouse moves between the element’s own parts', () => {
    enter(anchor());
    out(anchor().querySelector('path')!, anchor().querySelector('svg'));
    out(anchor().querySelector('svg')!, anchor());
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('keeps the tip while the mouse moves onto it to read it, and back onto the element', () => {
    enter(anchor());
    out(anchor(), tip());
    wait(TIP_LINGER_MS);
    expect(tip()).not.toBeNull();

    out(tip()!, anchor().querySelector('path'));
    wait(TIP_LINGER_MS);
    expect(tip()).not.toBeNull();
  });

  it('hides the tip once the mouse leaves it for the rest of the page', () => {
    enter(anchor());
    out(anchor(), tip());

    out(tip()!, elsewhere());
    wait(TIP_LINGER_MS);

    expect(tip()).toBeNull();
  });

  it('hides the tip when the mouse leaves the window', () => {
    enter(anchor());

    out(anchor(), null);
    wait(TIP_LINGER_MS);

    expect(tip()).toBeNull();
  });

  it('hides the tip at once when the element is pressed, until the mouse comes over it again', () => {
    enter(anchor());

    anchor().click();
    fixture.detectChanges();
    expect(tip()).toBeNull();

    enter(anchor());
    expect(tip()).not.toBeNull();
  });

  it('shows the tip again when the mouse is back over the element after it was gone', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    wait(TIP_LINGER_MS);

    enter(anchor());
    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('forgets a leaving when the tip is taken away meanwhile and shown again', () => {
    enter(anchor());
    out(anchor(), elsewhere());
    key('Escape');
    enter(anchor());

    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('pays no heed to the mouse leaving things before the tip is shown', () => {
    out(elsewhere(), element());
    enter(anchor());

    wait(TIP_LINGER_MS);

    expect(tip()).not.toBeNull();
  });

  it('hides the tip with Escape, and with no other key', () => {
    enter(anchor());

    key('Enter');
    expect(tip()).not.toBeNull();

    key('Escape');
    expect(tip()).toBeNull();
  });

  it('stops listening to the page once the element is gone', () => {
    enter(anchor());
    const directive = fixture.debugElement.children[0]!.injector.get(HoverTip);
    fixture.componentInstance.present.set(false);
    fixture.detectChanges();

    out(elsewhere(), null);
    key('Escape');
    wait(TIP_LINGER_MS);

    // Hidden by neither: the gone element's directive no longer hears the page.
    expect(directive.shown()).toBe(true);
  });
});
