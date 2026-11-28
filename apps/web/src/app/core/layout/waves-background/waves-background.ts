import {
  type ElementRef,
  Component,
  DestroyRef,
  afterEveryRender,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TOUCH_QUERY, screenMatches } from '../../../shared/ui/screen-matches';
import { wideWaves } from './wave-compositions';
import { type LayerShape, WaveField } from './wave-field';
import { toScene } from './wave-geometry';

const SVG = 'http://www.w3.org/2000/svg';
// Where this device remembers that its person started the waves.
const PLAYING_KEY = 'qando.backgroundPlaying';
// The most between two points of the button's edge looked at for a card under them: less than
// the inside of a card's rounded corner, which crosses the edge, could hide in.
const EDGE_STEP_PX = 4;
// The points looked at lie this far inside the button's box: a card that only meets it from
// outside does not touch it.
const EDGE_INSET_PX = 0.5;

interface DrawnLayer {
  readonly ribbon: SVGPathElement | null;
  readonly lines: readonly SVGPathElement[];
}

/**
 * The drawing behind every page: cream and green ribbons with contour lines on a paper grain, one
 * wide drawing on every screen, scaled to cover it and cropped at the sides that overflow, so it
 * follows a resized or turned screen smoothly. It stays still until the mouse or a finger moves
 * over the bare page; the waves then ripple around it and settle about a second and a half after
 * it stops. Over a card, a dialog or anything else that paints its own background they do not
 * react. With a mouse they start paused: a button in the corner starts them, rippling the waves
 * around it at once, and pauses them again, remembered on the device. The button is not shown
 * while it would touch a card, or anything else that paints its own background (a narrow window,
 * a scrolled page), and is back once it has room: looked at again once a frame at most after the
 * page is drawn (a toast or a dialog that goes) and when the window changes size, anything
 * scrolls, the page changes size or a transition or an animation ends. A touch screen has no
 * button, as its waves move only under a finger; a device that asks for reduced motion keeps them
 * still.
 *
 * Frames are drawn only while something moves, and only the ribbons that changed; nothing here
 * runs change detection but the button's going or coming back.
 */
@Component({
  selector: 'app-waves-background',
  imports: [TranslocoPipe],
  templateUrl: './waves-background.html',
  styleUrl: './waves-background.scss',
})
export class WavesBackground {
  private readonly reducedMotion = screenMatches('(prefers-reduced-motion: reduce)');
  private readonly touch = screenMatches(TOUCH_QUERY);
  private readonly drawing = viewChild.required<ElementRef<HTMLElement>>('drawing');
  private readonly waves = viewChild.required<ElementRef<SVGGElement>>('waves');
  private readonly motion = viewChild<ElementRef<HTMLElement>>('motion');

  protected readonly playing = signal(remembered());
  protected readonly hasButton = computed(() => !this.touch() && !this.reducedMotion());
  /** The button would touch a card: it is not shown. */
  protected readonly crowded = signal(false);
  protected readonly viewBox = `0 0 ${wideWaves.width} ${wideWaves.height}`;
  private readonly moving = computed(
    () => !this.reducedMotion() && (this.touch() || this.playing()),
  );

  private readonly field = new WaveField(wideWaves);
  private layers: readonly DrawnLayer[] = [];
  private frame: number | null = null;
  // The frame in which the button's room is looked at, once asked for; 0 while none is.
  private roomCheck = 0;
  private lastFrame: number | null = null;
  private screen: DOMRect | null = null;
  // The element last under the pointer and whether it paints its own background.
  private lastTarget: EventTarget | null = null;
  private overSurface = false;

  constructor() {
    afterNextRender(() => {
      this.drawAtRest();
    });
    effect(() => {
      if (!this.moving()) this.field.pointerGone();
    });
    // After anything on the page is drawn: the button coming, a toast or a dialog going.
    afterEveryRender(() => {
      if (this.motion()) this.lookForRoom();
    });

    const onPointerMove = (event: PointerEvent): void => {
      // A finger is followed by the touch events, which keep coming while the page scrolls.
      if (event.pointerType !== 'touch') this.pointerAt(event.clientX, event.clientY, event.target);
    };
    // A touch's target is where it began; what matters is what is under the finger now.
    const onTouchMove = (event: TouchEvent): void => {
      const [touch] = event.touches;
      if (!touch) return;
      const { clientX, clientY } = touch;
      this.pointerAt(clientX, clientY, document.elementFromPoint(clientX, clientY));
    };
    const onGone = (): void => {
      this.field.pointerGone();
    };
    const onResize = (): void => {
      this.screen = null;
      this.lookForRoom();
    };
    const onLayout = (): void => {
      this.lookForRoom();
    };
    const listening = new AbortController();
    const options = { passive: true, signal: listening.signal };
    window.addEventListener('pointermove', onPointerMove, options);
    window.addEventListener('touchmove', onTouchMove, options);
    window.addEventListener('touchend', onGone, options);
    window.addEventListener('touchcancel', onGone, options);
    window.addEventListener('resize', onResize, options);
    document.addEventListener('pointerleave', onGone, options);
    // A scroll does not bubble: heard on its way down, from anything that scrolls.
    document.addEventListener('scroll', onLayout, { ...options, capture: true });
    document.addEventListener('transitionend', onLayout, options);
    document.addEventListener('animationend', onLayout, options);
    // Older browsers without it look again on the other changes only.
    const pageSize = 'ResizeObserver' in window ? new ResizeObserver(onLayout) : undefined;
    pageSize?.observe(document.body);
    inject(DestroyRef).onDestroy(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      cancelAnimationFrame(this.roomCheck);
      listening.abort();
      pageSize?.disconnect();
    });
  }

  /** Starts the waves, rippling them around the button at once, or pauses them. */
  protected toggle(button: HTMLElement): void {
    const playing = !this.playing();
    this.playing.set(playing);
    remember(playing);
    if (!playing) return;
    const { x, y, width, height } = button.getBoundingClientRect();
    this.field.ripple(this.inDrawing(x + width / 2, y + height / 2));
    this.wake();
  }

  /** In the next frame, unless asked already: whether the button would touch a card. */
  private lookForRoom(): void {
    if (this.roomCheck !== 0) return;
    this.roomCheck = requestAnimationFrame(() => {
      this.roomCheck = 0;
      const button = this.motion()?.nativeElement;
      if (button) this.crowded.set(touchesSurface(button));
    });
  }

  /** Creates the drawing's paths and draws them at rest. */
  private drawAtRest(): void {
    const groups: SVGGElement[] = [];
    this.layers = wideWaves.layers.map((layer) => {
      const ribbon = layer.fill === null ? null : path({ fill: `url(#${layer.fill})` });
      const lines = Array.from({ length: layer.lines }, () =>
        path({ fill: 'none', stroke: layer.lineColour, strokeWidth: String(layer.lineWidth) }),
      );
      const group = document.createElementNS(SVG, 'g');
      group.append(...(ribbon ? [ribbon] : []), ...lines);
      groups.push(group);
      return { ribbon, lines };
    });
    this.waves().nativeElement.replaceChildren(...groups);
    for (const shape of this.field.shapes()) this.draw(shape);
  }

  private pointerAt(clientX: number, clientY: number, target: EventTarget | null): void {
    if (!this.moving() || this.paintsUnder(target)) {
      this.field.pointerGone();
      return;
    }
    this.field.pointerAt(this.inDrawing(clientX, clientY));
    this.wake();
  }

  /** Where a point of the screen falls in the drawing. */
  private inDrawing(x: number, y: number): { x: number; y: number } {
    this.screen ??= this.drawing().nativeElement.getBoundingClientRect();
    return toScene({ x, y }, this.screen, wideWaves);
  }

  /** Runs the frames while the waves move. */
  private wake(): void {
    if (!this.field.still && this.frame === null) this.frame = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (now: number): void => {
    const elapsed = this.lastFrame === null ? 0 : now - this.lastFrame;
    this.lastFrame = now;
    for (const shape of this.field.advance(elapsed)) this.draw(shape);
    if (this.field.still) {
      this.frame = null;
      this.lastFrame = null;
      return;
    }
    this.frame = requestAnimationFrame(this.onFrame);
  };

  private draw({ layer, ribbon, lines }: LayerShape): void {
    const drawn = this.layers[layer];
    if (ribbon !== null) drawn?.ribbon?.setAttribute('d', ribbon);
    lines.forEach((line, index) => drawn?.lines[index]?.setAttribute('d', line));
  }

  /** Whether the element under the pointer, or one around it, paints its own background. */
  private paintsUnder(target: EventTarget | null): boolean {
    if (target === this.lastTarget) return this.overSurface;
    this.lastTarget = target;
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body && element !== document.documentElement) {
      if (paints(element)) {
        this.overSurface = true;
        return true;
      }
      element = element.parentElement;
    }
    this.overSurface = false;
    return false;
  }
}

/**
 * Whether anything that paints its own background, but the button, what is in it and the page
 * itself, is under some point of the button's edge.
 */
function touchesSurface(button: HTMLElement): boolean {
  return edgePoints(button.getBoundingClientRect()).some(([x, y]) =>
    document
      .elementsFromPoint(x, y)
      .some(
        (element) =>
          !button.contains(element) &&
          element !== document.body &&
          element !== document.documentElement &&
          paints(element),
      ),
  );
}

/**
 * Points along the edge of `box`, just inside it, at most `EDGE_STEP_PX` apart: once around it,
 * each edge from its corner to the next one, which the next edge starts from.
 */
function edgePoints(box: DOMRect): [number, number][] {
  const left = box.left + EDGE_INSET_PX;
  const top = box.top + EDGE_INSET_PX;
  const right = box.right - EDGE_INSET_PX;
  const bottom = box.bottom - EDGE_INSET_PX;
  const points: [number, number][] = [];
  for (let x = left; x < right; x += EDGE_STEP_PX) points.push([x, top]);
  for (let y = top; y < bottom; y += EDGE_STEP_PX) points.push([right, y]);
  for (let x = right; x > left; x -= EDGE_STEP_PX) points.push([x, bottom]);
  for (let y = bottom; y > top; y -= EDGE_STEP_PX) points.push([left, y]);
  return points;
}

// Computed, a clear background always reads `none` and `rgba(0, 0, 0, 0)` (also `transparent`).
function paints(element: Element): boolean {
  const { backgroundColor, backgroundImage } = getComputedStyle(element);
  return backgroundImage !== 'none' || backgroundColor !== 'rgba(0, 0, 0, 0)';
}

function path(style: { fill: string; stroke?: string; strokeWidth?: string }): SVGPathElement {
  const element = document.createElementNS(SVG, 'path');
  element.style.fill = style.fill;
  if (style.stroke) element.style.stroke = style.stroke;
  if (style.strokeWidth) element.style.strokeWidth = style.strokeWidth;
  return element;
}

// Storage may be refused (a private window, blocked site data): the waves then start paused.
function remembered(): boolean {
  try {
    return localStorage.getItem(PLAYING_KEY) === 'true';
  } catch {
    return false;
  }
}

function remember(playing: boolean): void {
  try {
    if (playing) localStorage.setItem(PLAYING_KEY, 'true');
    else localStorage.removeItem(PLAYING_KEY);
  } catch {
    // Not remembered: the choice still holds until the page is left.
  }
}
