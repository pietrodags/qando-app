import type { LayerShape } from './wave-field';
import { WaveField } from './wave-field';
import type { WaveComposition, WaveLayer } from './wave-compositions';
import { contourPath, ribbonPath } from './wave-geometry';

const FRAME = 1000 / 60;

function ribbon(y: number, fill: string | null): WaveLayer {
  return {
    fill,
    pad: 10,
    lines: 2,
    lineColour: 'black',
    lineWidth: 1,
    top: [
      [0, y],
      [200, y],
      [400, y],
    ],
    bottom: [
      [0, y + 100],
      [200, y + 100],
      [400, y + 100],
    ],
  };
}

// A ribbon near the top, where the pointer moves, and one far below it.
const composition: WaveComposition = {
  width: 400,
  height: 6000,
  reach: 100,
  layers: [ribbon(100, 'near'), ribbon(5000, null)],
};

/** The pointer seen at one point and then moved across the near ribbon. */
function rippled(): WaveField {
  const field = new WaveField(composition);
  field.pointerAt({ x: 170, y: 150 });
  field.pointerAt({ x: 230, y: 150 });
  return field;
}

function frames(field: WaveField, count: number, length = FRAME): readonly LayerShape[] {
  let changed: readonly LayerShape[] = [];
  for (let frame = 0; frame < count; frame++) changed = field.advance(length);
  return changed;
}

/** How far the most moved point of the drawing is from where it rests. */
function largestShift(field: WaveField): number {
  const numbers = (shapes: readonly LayerShape[]): number[] =>
    shapes
      .flatMap((shape) => [shape.ribbon ?? '', ...shape.lines].join(' ').match(/-?\d+\.\d/g) ?? [])
      .map(Number);
  const rest = numbers(new WaveField(composition).shapes());
  return Math.max(
    ...numbers(field.shapes()).map((value, index) => Math.abs(value - (rest[index] ?? 0))),
  );
}

describe('WaveField', () => {
  it('draws every ribbon at rest with its contour lines spread evenly between its curves', () => {
    const [near, far] = new WaveField(composition).shapes();
    const { top, bottom } = ribbon(100, 'near');

    expect(near).toEqual({
      layer: 0,
      ribbon: ribbonPath(top, bottom, 10),
      lines: [contourPath(top, bottom, 1 / 3), contourPath(top, bottom, 2 / 3)],
    });
    expect(far?.layer).toBe(1);
    expect(far?.ribbon).toBeNull();
    expect(far?.lines).toHaveLength(2);
  });

  it('stays still until the pointer moves', () => {
    const field = new WaveField(composition);

    expect(field.still).toBe(true);
    expect(frames(field, 60)).toEqual([]);
    expect(field.still).toBe(true);
  });

  it('moves nothing at the first point the pointer is seen at', () => {
    const field = new WaveField(composition);

    field.pointerAt({ x: 200, y: 150 });

    expect(field.still).toBe(true);
    expect(field.advance(FRAME)).toEqual([]);
  });

  it('ripples the ribbons near a moving pointer and redraws only those', () => {
    const field = rippled();

    const changed = frames(field, 6);

    expect(field.still).toBe(false);
    expect(changed.map((shape) => shape.layer)).toEqual([0]);
    expect(changed[0]).toEqual(field.shapes()[0]);
    expect(changed[0]?.ribbon).not.toBe(new WaveField(composition).shapes()[0]?.ribbon);
  });

  it('settles back to rest about a second and a half after the pointer stops', () => {
    const field = rippled();

    frames(field, 70);
    expect(field.still).toBe(false);

    const last = frames(field, 80);

    expect(field.still).toBe(true);
    expect(field.shapes()).toEqual(new WaveField(composition).shapes());
    expect(last).toEqual([]);
  });

  it('redraws once more the ribbons that were still off their rest when the waves settle', () => {
    const field = rippled();
    let settling: readonly LayerShape[] = [];

    for (let frame = 0; frame < 200 && !field.still; frame++) settling = field.advance(FRAME);

    expect(settling.map((shape) => shape.layer)).toEqual([0]);
    expect(settling[0]).toEqual(new WaveField(composition).shapes()[0]);
  });

  it('moves the same on a screen that draws twice as many frames a second', () => {
    const sixty = rippled();
    const hundredTwenty = rippled();

    frames(sixty, 30);
    frames(hundredTwenty, 60, FRAME / 2);

    expect(hundredTwenty.shapes()).toEqual(sixty.shapes());
  });

  it('draws nothing new on a frame shorter than the motion advances by', () => {
    const field = rippled();
    frames(field, 3);

    expect(field.advance(FRAME / 2)).toEqual([]);
  });

  it('after a long pause in the frames (a hidden tab), moves on by a tenth of a second at most', () => {
    const late = rippled();
    const tenth = rippled();

    late.advance(5000);
    tenth.advance(100);

    expect(late.shapes()).toEqual(tenth.shapes());
  });

  it('when the pointer comes back after it was gone, does not read it as a jump', () => {
    const field = new WaveField(composition);
    field.pointerAt({ x: 200, y: 150 });

    field.pointerGone();
    field.pointerAt({ x: 380, y: 120 });

    expect(field.still).toBe(true);
    expect(frames(field, 30)).toEqual([]);
  });

  it('lets what moves settle when the pointer goes', () => {
    const field = rippled();
    frames(field, 6);

    field.pointerGone();
    frames(field, 150);

    expect(field.still).toBe(true);
  });

  it('leaves the waves still when the pointer is seen again at the same point', () => {
    const field = new WaveField(composition);
    field.pointerAt({ x: 200, y: 150 });

    field.pointerAt({ x: 200, y: 150 });

    expect(field.still).toBe(true);
  });

  it('raises the waves higher the farther the pointer moves', () => {
    const shift = (to: number): number => {
      const field = new WaveField(composition);
      field.pointerAt({ x: 200, y: 150 });
      field.pointerAt({ x: to, y: 150 });
      frames(field, 12);
      return largestShift(field);
    };

    expect(shift(204)).toBeGreaterThan(0);
    expect(shift(204)).toBeLessThan(shift(240) / 2);
  });

  it('ripples the waves around a point at once, with no pointer moving, and lets them settle', () => {
    const field = new WaveField(composition);

    field.ripple({ x: 200, y: 150 });

    expect(field.still).toBe(false);
    expect(frames(field, 6).map((shape) => shape.layer)).toEqual([0]);
    frames(field, 150);
    expect(field.still).toBe(true);
    expect(field.shapes()).toEqual(new WaveField(composition).shapes());
  });

  it('stirs the waves with a ripple as a quick pass of the pointer a hundred units long would', () => {
    const rippled = new WaveField(composition);
    const passed = new WaveField(composition);

    rippled.ripple({ x: 200, y: 150 });
    passed.pointerAt({ x: 100, y: 150 });
    passed.pointerAt({ x: 200, y: 150 });
    frames(rippled, 20);
    frames(passed, 20);

    expect(rippled.shapes()).toEqual(passed.shapes());
  });

  it('skips the frames whose change the paths would not show', () => {
    const field = rippled();
    let skipped = 0;

    while (!field.still) {
      if (field.advance(FRAME).length === 0 && !field.still) skipped++;
    }

    expect(skipped).toBeGreaterThan(0);
  });

  it('after a ripple, does not read the pointer seen before it as a jump', () => {
    const field = new WaveField(composition);
    field.pointerAt({ x: 380, y: 120 });
    field.ripple({ x: 20, y: 180 });
    frames(field, 200);

    field.pointerAt({ x: 380, y: 120 });

    expect(field.still).toBe(true);
  });

  it('however fast the pointer moves, the waves rise and fall a few units only', () => {
    const across = new WaveField(composition);
    across.pointerAt({ x: -100_000, y: 150 });
    across.pointerAt({ x: 200, y: 150 });
    const down = new WaveField(composition);
    down.pointerAt({ x: 200, y: -100_000 });
    down.pointerAt({ x: 200, y: 150 });

    for (const field of [across, down]) {
      let largest = 0;
      for (let frame = 0; frame < 60; frame++) {
        field.advance(FRAME);
        largest = Math.max(largest, largestShift(field));
      }
      expect(largest).toBeGreaterThan(5);
      expect(largest).toBeLessThan(45);
    }
  });
});
