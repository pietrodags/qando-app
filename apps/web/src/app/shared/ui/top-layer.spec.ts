import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TopLayer } from './top-layer';

@Component({
  imports: [TopLayer],
  template: `<div class="window">
    @if (shown()) {
      <i class="ring" appTopLayer></i>
    }
  </div>`,
})
class Host {
  readonly shown = signal(true);
}

describe('TopLayer', () => {
  let fixture: ComponentFixture<Host>;
  /** The elements the browser was asked to draw in its top layer, in order. */
  let raised: Element[];
  /** What each of them was a child of when the browser was asked. */
  let raisedFrom: (Element | null)[];

  /** The element, wherever it is in the page. */
  function ring(): HTMLElement | null {
    return document.querySelector('.ring');
  }

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    (fixture.nativeElement as HTMLElement).remove();
  });

  beforeEach(() => {
    raised = [];
    raisedFrom = [];
    // jsdom has no popovers: the browser's part, standing in.
    HTMLElement.prototype.showPopover = function (this: HTMLElement) {
      raised.push(this);
      raisedFrom.push(this.parentElement);
    };
  });

  it('draws its element in the top layer once it is in the page, and nothing else', async () => {
    await render();

    expect(raised).toEqual([ring()]);
    expect(ring()?.getAttribute('popover')).toBe('manual');
  });

  it('draws it from the body of the page, so that nothing it was written in holds it', async () => {
    await render();

    expect(ring()?.parentElement).toBe(document.body);
    // A box moved once it is in the top layer leaves the top layer.
    expect(raisedFrom).toEqual([document.body]);
  });

  it('leaves the page when what it was written in no longer shows it', async () => {
    await render();
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(ring()).toBeNull();
  });

  it('draws it again each time it comes back into the page', async () => {
    await render();
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    fixture.componentInstance.shown.set(true);
    await fixture.whenStable();

    expect(raised).toHaveLength(2);
    expect(raised[1]).toBe(ring());
  });
});
