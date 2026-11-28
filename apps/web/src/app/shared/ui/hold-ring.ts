import { Component, computed, input } from '@angular/core';
import { HOLD_MS } from './long-press';
import { TopLayer } from './top-layer';

/**
 * The ring of a finger resting on `anchor` for a long-press (`LongPress`), there while the finger
 * rests: nothing shows for the first half of the rest, a plain press being over by then, and then
 * a ring closes on the anchor from outside the finger, closed when the long-press fires; with
 * reduced motion it shows without the motion. It is drawn over the whole page, where nothing
 * around the anchor cuts it, as large as the anchor and where it is on screen when the ring
 * comes, also where the page keeps the room of its scrollbars, which moves in the corner from
 * where what is drawn over the page is placed; its corners are as round as `--hold-ring-radius` says, a little by default.
 */
@Component({
  selector: 'app-hold-ring',
  hostDirectives: [TopLayer],
  host: {
    'aria-hidden': 'true',
    '[style.--hold-duration]': 'duration',
    '[style.inset-block-start.px]': 'box().top',
    '[style.inset-inline-start.px]': 'box().left',
    '[style.inline-size.px]': 'box().width',
    '[style.block-size.px]': 'box().height',
  },
  template: '',
  styleUrl: './hold-ring.scss',
})
export class HoldRing {
  /** What the finger rests on. */
  readonly anchor = input.required<Element>();

  protected readonly duration = `${String(HOLD_MS)}ms`;
  protected readonly box = computed<DOMRect>(() => {
    const anchor = this.anchor();
    const { left, top, width, height } = anchor.getBoundingClientRect();
    const page = anchor.ownerDocument.documentElement.getBoundingClientRect();
    return new DOMRect(left - page.left, top, width, height);
  });
}
