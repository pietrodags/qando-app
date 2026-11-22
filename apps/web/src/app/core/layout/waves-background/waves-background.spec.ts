import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { literalValues } from '../../../../styles/token-usage';
import { installTestScreen, type TestScreen } from '../../../../test/media-queries';
import { TOUCH_QUERY } from '../../../shared/ui/screen-matches';
import { provideI18n } from '../../i18n/provide-i18n';
import { uprightWaves, wideWaves, type WaveComposition } from './wave-compositions';
import { WavesBackground } from './waves-background';
import styles from './waves-background.scss' with { loader: 'text' };

const UPRIGHT = '(orientation: portrait)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

describe('WavesBackground', () => {
  let screen: TestScreen;
  let fixture: ComponentFixture<WavesBackground>;
  let card: HTMLElement;

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
    const drawing = element('.drawing');
    drawing.getBoundingClientRect = () => DOMRect.fromRect({ width: 1600, height: 900 });
  }

  function element(selector: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  }

  function drawn(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.scene g path')].map(
      (path) => path.getAttribute('d') ?? '',
    );
  }

  function toggle(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  function pointer(type: string, x: number, y: number, on: EventTarget = document.body): void {
    on.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  }

  function finger(type: string, x = 0, y = 0): void {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', {
      value: type === 'touchmove' ? [{ clientX: x, clientY: y }] : [],
    });
    document.body.dispatchEvent(event);
  }

  /** The mouse seen at one point of the bare page and moved across the waves near the top. */
  function stir(on: EventTarget = document.body): void {
    pointer('pointermove', 700, 250, on);
    pointer('pointermove', 800, 260, on);
  }

  function frames(count: number): void {
    for (let frame = 0; frame < count; frame++) vi.advanceTimersToNextFrame();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    localStorage.clear();
    card = document.createElement('div');
    card.style.backgroundColor = 'white';
    card.append(document.createElement('span'));
    document.body.append(card);
  });

  afterEach(() => {
    vi.useRealTimers();
    card.remove();
    localStorage.clear();
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

  it('ripples the waves while the mouse moves over the bare page, and stops drawing once they settle', async () => {
    await start();
    const rest = drawn();

    stir();
    frames(10);

    expect(drawn()).not.toEqual(rest);

    frames(200);

    expect(drawn()).toEqual(rest);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not react while the mouse is over anything that paints its own background', async () => {
    await start();
    const rest = drawn();

    stir(card.firstElementChild ?? card);
    frames(10);

    expect(drawn()).toEqual(rest);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not read the mouse coming back from a card, or into the window, as a jump', async () => {
    await start();
    const rest = drawn();

    pointer('pointermove', 100, 100);
    pointer('pointermove', 900, 300, card);
    pointer('pointermove', 1500, 800);
    document.dispatchEvent(new MouseEvent('pointerleave'));
    pointer('pointermove', 200, 300);
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('ripples under a moving finger, and a lifted or cancelled finger ends the gesture', async () => {
    await start();
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

  it('leaves the touches to the touch events, so a finger is not read twice', async () => {
    await start();
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

  it('stays still when the device asks for reduced motion, with no button to pause it', async () => {
    await start({ [REDUCED_MOTION]: true });
    const rest = drawn();

    stir();
    frames(10);

    expect(drawn()).toEqual(rest);
    expect(toggle()).toBeNull();
  });

  it('stays still from the moment the device asks for reduced motion', async () => {
    await start();
    const rest = drawn();

    screen.set(REDUCED_MOTION, true);
    await fixture.whenStable();
    stir();
    frames(10);

    expect(drawn()).toEqual(rest);
  });

  it('with a mouse, shows a button to pause the waves; paused, the mouse moves them no more', async () => {
    await start();
    const rest = drawn();
    const button = toggle();

    expect(button?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');

    button?.click();
    await fixture.whenStable();
    stir();
    frames(10);

    expect(button?.getAttribute('aria-label')).toBe('Reanudar la animación del fondo');
    expect(drawn()).toEqual(rest);
  });

  it('moves the waves again once resumed', async () => {
    await start();
    const rest = drawn();
    toggle()?.click();
    await fixture.whenStable();

    toggle()?.click();
    await fixture.whenStable();
    stir();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar la animación del fondo');
    expect(drawn()).not.toEqual(rest);
  });

  it('remembers a pause on this device the next time the app opens', async () => {
    await start();
    toggle()?.click();
    await fixture.whenStable();
    fixture.destroy();
    TestBed.resetTestingModule();

    await start();
    const rest = drawn();
    stir();
    frames(10);

    expect(toggle()?.getAttribute('aria-label')).toBe('Reanudar la animación del fondo');
    expect(drawn()).toEqual(rest);
  });

  it('shows no pause button on a touch screen', async () => {
    await start({ [TOUCH_QUERY]: true });

    expect(toggle()).toBeNull();
  });

  it('once gone, stops drawing and listening', async () => {
    await start();
    const paths = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.scene g path')];
    const shown = () => paths.map((path) => path.getAttribute('d'));
    stir();
    frames(2);

    fixture.destroy();
    const left = shown();
    frames(10);

    expect(shown()).toEqual(left);
    stir();
    frames(10);
    expect(shown()).toEqual(left);
  });
});
