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

  function ring(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.ring');
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

  describe('where the browser has a top layer', () => {
    beforeEach(() => {
      raised = [];
      // jsdom has no popovers: the browser's part, standing in.
      HTMLElement.prototype.showPopover = function (this: HTMLElement) {
        raised.push(this);
      };
    });

    it('draws its element in the top layer once it is in the page, and nothing else', async () => {
      await render();

      expect(raised).toEqual([ring()]);
      expect(ring()?.getAttribute('popover')).toBe('manual');
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

  it('leaves its element where it is in a browser without a top layer', async () => {
    await render();

    expect(ring()).not.toBeNull();
  });
});
