import {
  type ElementRef,
  Component,
  DestroyRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TOUCH_QUERY, screenMatches } from '../../../shared/ui/screen-matches';
import { type WaveComposition, uprightWaves, wideWaves } from './wave-compositions';
import { type LayerShape, WaveField } from './wave-field';
import { toScene } from './wave-geometry';

const SVG = 'http://www.w3.org/2000/svg';
// Where this device remembers that its person paused the waves.
const PAUSED_KEY = 'qando.backgroundPaused';

interface DrawnLayer {
  readonly ribbon: SVGPathElement | null;
  readonly lines: readonly SVGPathElement[];
}

/**
 * The drawing behind every page: cream and green ribbons with contour lines on a paper grain,
 * upright on an upright screen and wide on one on its side. It stays still until the mouse or a
 * finger moves over the bare page; the waves then ripple around it and settle about a second and
 * a half after it stops. Over a card, a dialog or anything else that paints its own background
 * they do not react. With a mouse, a button in the corner pauses them, remembered on the device;
 * a device that asks for reduced motion keeps them still.
 *
 * Frames are drawn only while something moves, and only the ribbons that changed; nothing here
 * runs change detection.
 */
@Component({
  selector: 'app-waves-background',
  imports: [TranslocoPipe],
  templateUrl: './waves-background.html',
  styleUrl: './waves-background.scss',
})
export class WavesBackground {
  private readonly upright = screenMatches('(orientation: portrait)');
  private readonly reducedMotion = screenMatches('(prefers-reduced-motion: reduce)');
  private readonly touch = screenMatches(TOUCH_QUERY);
  private readonly drawing = viewChild.required<ElementRef<HTMLElement>>('drawing');
  private readonly waves = viewChild.required<ElementRef<SVGGElement>>('waves');

  protected readonly paused = signal(remembered());
  protected readonly canPause = computed(() => !this.touch() && !this.reducedMotion());
  private readonly composition = computed<WaveComposition>(() =>
    this.upright() ? uprightWaves : wideWaves,
  );
  protected readonly viewBox = computed(() => {
    const { width, height } = this.composition();
    return `0 0 ${width} ${height}`;
  });
  private readonly moving = computed(() => !this.reducedMotion() && !this.paused());

  private field = new WaveField(wideWaves);
  private layers: readonly DrawnLayer[] = [];
  private frame: number | null = null;
  private lastFrame: number | null = null;
  private screen: DOMRect | null = null;
  // The element last under the pointer and whether it paints its own background.
  private lastTarget: EventTarget | null = null;
  private overSurface = false;

  constructor() {
    afterRenderEffect(() => {
      this.build(this.composition());
    });
    effect(() => {
      if (!this.moving()) this.field.pointerGone();
    });

    const onPointerMove = (event: PointerEvent): void => {
      // A finger is followed by the touch events, which keep coming while the page scrolls.
      if (event.pointerType !== 'touch') this.pointerAt(event.clientX, event.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent): void => {
      const [touch] = event.touches;
      if (touch) this.pointerAt(touch.clientX, touch.clientY, event.target);
    };
    const onGone = (): void => {
      this.field.pointerGone();
    };
    const onResize = (): void => {
      this.screen = null;
    };
    const passive = { passive: true };
    window.addEventListener('pointermove', onPointerMove, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('touchend', onGone, passive);
    window.addEventListener('touchcancel', onGone, passive);
    window.addEventListener('resize', onResize, passive);
    document.addEventListener('pointerleave', onGone);
    inject(DestroyRef).onDestroy(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onGone);
      window.removeEventListener('touchcancel', onGone);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerleave', onGone);
    });
  }

  protected togglePause(): void {
    const paused = !this.paused();
    this.paused.set(paused);
    remember(paused);
  }

  /** Draws a composition at rest, with fresh paths and a fresh motion. */
  private build(composition: WaveComposition): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastFrame = null;
    this.field = new WaveField(composition);
    const groups: SVGGElement[] = [];
    this.layers = composition.layers.map((layer) => {
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
    this.screen ??= this.drawing().nativeElement.getBoundingClientRect();
    this.field.pointerAt(toScene({ x: clientX, y: clientY }, this.screen, this.composition()));
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

function paints(element: Element): boolean {
  const { backgroundColor, backgroundImage } = getComputedStyle(element);
  return (
    (backgroundImage !== '' && backgroundImage !== 'none') ||
    (backgroundColor !== '' &&
      backgroundColor !== 'transparent' &&
      backgroundColor !== 'rgba(0, 0, 0, 0)')
  );
}

function path(style: { fill: string; stroke?: string; strokeWidth?: string }): SVGPathElement {
  const element = document.createElementNS(SVG, 'path');
  element.style.fill = style.fill;
  if (style.stroke) element.style.stroke = style.stroke;
  if (style.strokeWidth) element.style.strokeWidth = style.strokeWidth;
  return element;
}

// Storage may be refused (a private window, blocked site data): the waves then just move.
function remembered(): boolean {
  try {
    return localStorage.getItem(PAUSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function remember(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(PAUSED_KEY, 'true');
    else localStorage.removeItem(PAUSED_KEY);
  } catch {
    // Not remembered: the pause still holds until the page is left.
  }
}
