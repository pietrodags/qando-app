import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { literalValues } from '../../../../styles/token-usage';
import { installTestScreen, type TestScreen } from '../../../../test/media-queries';
import { TOUCH_QUERY } from '../../../shared/ui/screen-matches';
import { provideI18n } from '../../i18n/provide-i18n';
import { uprightWaves, wideWaves, type WaveComposition } from './wave-compositions';
import { WaveField } from './wave-field';
import { WavesBackground } from './waves-background';
import styles from './waves-background.scss' with { loader: 'text' };

const UPRIGHT = '(orientation: portrait)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// Where a device remembers that its person started the waves.
const PLAYING_KEY = 'qando.backgroundPlaying';
// The fake frames come every 16 ms.
const FAKE_FRAME = 16;

describe('WavesBackground', () => {
  let screen: TestScreen;
  let fixture: ComponentFixture<WavesBackground>;
  let card: HTMLElement;
  // What the screen shows at a point, as `document.elementFromPoint` answers (jsdom has none).
  let under: (x: number, y: number) => Element;

  function pathCount(composition: WaveComposition): number {
    return composition.layers.reduce(
      (count, layer) => count + layer.lines + (layer.fill ? 1 : 0),
      0,
    );
  }

  async function start(matching: Record<string, boolean> = {}): Promise<void> {
    screen = installTestScreen(matching);
    TestBed.configureTestingModule({ imports: [WavesBackground], providers: [provideI18n()] });
    fixture = TestBed.createComponent(WavesBackground);
    await fixture.whenStable();
    // The drawing covers a laptop's window, the wide drawing's own size.
    coverScreen(1600, 900);
  }

  /** Starts on a device whose person started the waves on an earlier visit. */
  async function startMoving(matching: Record<string, boolean> = {}): Promise<void> {
    localStorage.setItem(PLAYING_KEY, 'true');
    await start(matching);
  }

  async function reopen(): Promise<void> {
    fixture.destroy();
    TestBed.resetTestingModule();
    await start();
  }

  function coverScreen(width: number, height: number): void {
    element('.drawing').getBoundingClientRect = () => DOMRect.fromRect({ width, height });
  }

  function element(selector: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  }

  function paths(): Element[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.scene g path')];
  }

  function drawn(): string[] {
    return paths().map((path) => path.getAttribute('d') ?? '');
  }

  function toggle(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  async function press(): Promise<void> {
    toggle()?.click();
    await fixture.whenStable();
  }

  function pointer(type: string, x: number, y: number, on: EventTarget = document.body): void {
    on.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  }

  function finger(type: string, x = 0, y = 0, on: EventTarget = document.body): void {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', {
      value: type === 'touchmove' ? [{ clientX: x, clientY: y }] : [],
    });
    on.dispatchEvent(event);
  }

  /** The mouse seen at one point and moved twice across the waves near the top. */
  function stir(on: EventTarget = document.body): void {
    pointer('pointermove', 700, 250, on);
    pointer('pointermove', 800, 260, on);
    pointer('pointermove', 900, 270, on);
  }

  function frames(count: number): void {
    for (let frame = 0; frame < count; frame++) vi.advanceTimersToNextFrame();
  }

  /**
   * What the page shows after `count` frames of a field moved as the page moves its own: the
   * first frame of a motion moves nothing, and each frame draws the ribbons it changed.
   */
  function shownAfter(field: WaveField, count: number): string[] {
    const shown = [...field.shapes()];
    for (let frame = 0; frame < count; frame++) {
      for (const shape of field.advance(frame === 0 ? 0 : FAKE_FRAME)) shown[shape.layer] = shape;
    }
    return shown.flatMap((shape) => [
      ...(shape.ribbon === null ? [] : [shape.ribbon]),
      ...shape.lines,
    ]);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    localStorage.clear();
    card = document.createElement('div');
    card.style.backgroundColor = 'white';
    card.append(document.createElement('span'));
    document.body.append(card);
    under = () => document.body;
    Object.defineProperty(Document.prototype, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) => under(x, y),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    card.remove();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
    localStorage.clear();
    Reflect.deleteProperty(Document.prototype, 'elementFromPoint');
  });

  it('styles itself with the design tokens only', () => {
    expect(literalValues(styles)).toEqual([]);
  });

  it('draws the wide drawing on a screen wider than tall', async () => {
    await start();

    expect(element('.scene').getAttribute('viewBox')).toBe('0 0 1600 900');
    expect(drawn()).toHaveLength(pathCount(wideWaves));
    expect(drawn().every((path) => path.startsWith('M '))).toBe(true);
  });

  it('fills each ribbon with its gradient and draws its contour lines unfilled, in their colour and width', async () => {
    await start();
    const [layer] = wideWaves.layers.filter((each) => each.fill !== null);
    const index = wideWaves.layers.findIndex((each) => each === layer);
    const group = element('.scene g').children[index];
    const [ribbon, line] = [...(group?.children ?? [])] as SVGPathElement[];

    expect(ribbon?.style.fill).toBe(`url("#${layer?.fill ?? ''}")`);
    expect(ribbon?.style.stroke).toBe('');
    expect(line?.style.fill).toBe('none');
    expect(line?.style.stroke).toBe(layer?.lineColour);
    expect(line?.style.strokeWidth).toBe(String(layer?.lineWidth));
  });

  it('draws the upright drawing on an upright screen, and the wide one once the screen turns', async () => {
    await start({ [UPRIGHT]: true });

    expect(element('.scene').getAttribute('viewBox')).toBe('0 0 900 1600');
    expect(drawn()).toHaveLength(pathCount(uprightWaves));

    screen.set(UPRIGHT, false);
    await fixture.whenStable();

    expect(element('.scene').getAttribute('viewBox')).toBe('0 0 1600 900');
    expect(drawn()).toHaveLength(pathCount(wideWaves));
  });

  it('leaves the drawing out of what screen readers read', async () => {
    await start();

    expect(element('.drawing').getAttribute('aria-hidden')).toBe('true');
  });

  it('ripples the waves while the mouse moves over the bare page, frame by frame, and stops drawing once they settle', async () => {
    await startMoving();
    const rest = drawn();
    const field = new WaveField(wideWaves);

    pointer('pointermove', 700, 250);
    frames(1);
    pointer('pointermove', 800, 260);
    pointer('pointermove', 900, 270);
    frames(10);
    for (const [x, y] of [
      [700, 250],
      [800, 260],
      [900, 270],
    ] as const) {
      field.pointerAt({ x, y });
    }

    expect(drawn()).not.toEqual(rest);
    expect(drawn()).toEqual(shownAfter(field, 10));

    frames(200);

    expect(drawn()).toEqual(rest);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not react while the mouse is over anything that paints its own background', async () => {
    await startMoving();
    const rest = drawn();

    stir(card.firstElementChild ?? card);
    frames(10);

    expect(drawn()).toEqual(rest);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not react over a background image either', async () => {
    await startMoving();
    const rest = drawn();
    card.style.backgroundColor = 'transparent';
    card.style.backgroundImage = 'url(paper.png)';

    stir(card.firstElementChild ?? card);
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('reacts over what paints nothing: a clear background, no image, and the page itself', async () => {
    await startMoving();
    const rest = drawn();
    document.documentElement.style.backgroundColor = 'white';
    document.body.style.backgroundColor = 'white';
    card.style.backgroundColor = 'transparent';
    card.style.backgroundImage = 'none';
    const inner = card.firstElementChild as HTMLElement;
    inner.style.backgroundColor = 'rgba(0, 0, 0, 0)';

    stir(inner);
    frames(10);

    expect(drawn()).not.toEqual(rest);
  });

  it('does not read the mouse coming back from a card, or into the window, as a jump', async () => {
    await startMoving();
    const rest = drawn();

    pointer('pointermove', 100, 100);
    pointer('pointermove', 900, 300, card);
    pointer('pointermove', 1500, 800);
    document.dispatchEvent(new MouseEvent('pointerleave'));
    pointer('pointermove', 200, 300);
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('follows the mouse where the drawing is after the window is resized', async () => {
    const resizedThenStirred = async (resize: boolean): Promise<string[]> => {
      await startMoving();
      // The corner falls on the drawing's corner at any size, so the first point is the same.
      if (resize) {
        pointer('pointermove', 0, 0);
        coverScreen(800, 450);
        window.dispatchEvent(new Event('resize'));
      } else {
        coverScreen(800, 450);
        pointer('pointermove', 0, 0);
      }
      stir();
      frames(10);
      const shown = drawn();
      fixture.destroy();
      TestBed.resetTestingModule();
      return shown;
    };

    expect(await resizedThenStirred(true)).toEqual(await resizedThenStirred(false));
  });

  it('ripples under a moving finger, and a lifted or cancelled finger ends the gesture', async () => {
    await start({ [TOUCH_QUERY]: true });
    const rest = drawn();

    finger('touchmove', 700, 250);
    finger('touchmove', 800, 260);
    frames(10);
    expect(drawn()).not.toEqual(rest);
    finger('touchend');
    frames(200);

    for (const end of ['touchend', 'touchcancel']) {
      finger('touchmove', 100, 100);
      finger(end);
      finger('touchmove', 1500, 800);
      frames(10);
      expect(drawn()).toEqual(rest);
      finger('touchend');
    }
  });

  it('with a finger, reacts to what is under it now, not to where the touch began', async () => {
    await start({ [TOUCH_QUERY]: true });
    const rest = drawn();
    under = (x) => (x >= 1000 ? card : document.body);

    for (const x of [1100, 1200, 1300]) finger('touchmove', x, 250);
    frames(10);

    expect(drawn()).toEqual(rest);

    for (const x of [700, 800, 900]) finger('touchmove', x, 250, card);
    frames(10);

    expect(drawn()).not.toEqual(rest);
  });

  it('leaves the touches to the touch events, so a finger is not read twice', async () => {
    await startMoving();
    const rest = drawn();
    const touchPointer = (x: number) => {
      const event = new MouseEvent('pointermove', { clientX: x, clientY: 250, bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      document.body.dispatchEvent(event);
    };

    touchPointer(700);
    touchPointer(800);
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('stays still when the device asks for reduced motion, with no button', async () => {
    await startMoving({ [REDUCED_MOTION]: true });
    const rest = drawn();

    stir();
    frames(10);

    expect(drawn()).toEqual(rest);
    expect(toggle()).toBeNull();
  });

  it('stays still from the moment the device asks for reduced motion', async () => {
    await startMoving();
    const rest = drawn();

    screen.set(REDUCED_MOTION, true);
    await fixture.whenStable();
    stir();
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('on a computer, starts with the waves paused and a button to animate them', async () => {
    await start();
    const rest = drawn();

    stir();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Animar el fondo');
    expect(drawn()).toEqual(rest);
  });

  it('pressing play ripples the waves around the button at once, and the mouse moves them from then on', async () => {
    await start();
    const rest = drawn();
    const button = toggle();
    if (button)
      button.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: 8, y: 852, width: 40, height: 40 });
    const field = new WaveField(wideWaves);
    field.ripple({ x: 28, y: 872 });

    await press();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');
    expect(drawn()).toEqual(shownAfter(field, 10));

    frames(200);
    expect(drawn()).toEqual(rest);
    stir();
    frames(10);
    expect(drawn()).not.toEqual(rest);
  });

  it('once the device stops asking for reduced motion, does not read the mouse moved meanwhile as a jump', async () => {
    await startMoving();
    const rest = drawn();
    pointer('pointermove', 100, 100);

    screen.set(REDUCED_MOTION, true);
    await fixture.whenStable();
    screen.set(REDUCED_MOTION, false);
    await fixture.whenStable();
    pointer('pointermove', 1500, 800);
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('pressed again, pauses the waves: the mouse moves them no more', async () => {
    await startMoving();
    const rest = drawn();

    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');

    await press();
    stir();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Animar el fondo');
    expect(drawn()).toEqual(rest);
  });

  it('remembers on this device that the waves were started, and that they were paused again', async () => {
    await start();
    await press();

    await reopen();
    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');
    const rest = drawn();
    stir();
    frames(10);
    expect(drawn()).not.toEqual(rest);

    await press();
    await reopen();
    expect(toggle()?.getAttribute('aria-label')).toBe('Animar el fondo');
  });

  it('when the device keeps nothing, starts paused and still plays when asked', async () => {
    const refused = (): never => {
      throw new DOMException('Site data is blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refused);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refused);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refused);
    await start();
    const rest = drawn();

    expect(toggle()?.getAttribute('aria-label')).toBe('Animar el fondo');

    await press();
    stir();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');
    expect(drawn()).not.toEqual(rest);

    await press();
    expect(toggle()?.getAttribute('aria-label')).toBe('Animar el fondo');
  });

  it('shows no button on a touch screen, whose waves follow the finger from the start', async () => {
    await start({ [TOUCH_QUERY]: true });
    const rest = drawn();

    finger('touchmove', 700, 250);
    finger('touchmove', 800, 260);
    frames(10);

    expect(toggle()).toBeNull();
    expect(drawn()).not.toEqual(rest);
  });

  it('once gone, stops drawing and listening', async () => {
    await startMoving();
    const shown = paths();
    const left = () => shown.map((path) => path.getAttribute('d'));
    stir();
    frames(2);

    fixture.destroy();
    const last = left();
    frames(10);

    expect(left()).toEqual(last);
    stir();
    finger('touchmove', 700, 250);
    finger('touchmove', 800, 260);
    frames(10);
    expect(left()).toEqual(last);
  });

  it('once gone while still, starts no motion', async () => {
    await startMoving();
    const shown = paths();
    const left = () => shown.map((path) => path.getAttribute('d'));
    const rest = left();

    fixture.destroy();
    stir();
    finger('touchmove', 700, 250);
    finger('touchmove', 800, 260);
    frames(10);

    expect(left()).toEqual(rest);
  });
});
