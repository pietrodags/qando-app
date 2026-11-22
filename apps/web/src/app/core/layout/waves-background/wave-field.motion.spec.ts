import type { LayerShape } from './wave-field';
import { WaveField } from './wave-field';
import type { Point, WaveComposition } from './wave-compositions';
import { contourPath, ribbonPath } from './wave-geometry';

const FRAME = 1000 / 60;

// A filled ribbon and, overlapping it, a ribbon of lines only, both within the pointer's reach.
const composition: WaveComposition = {
  width: 400,
  height: 600,
  reach: 100,
  layers: [
    {
      fill: 'a',
      pad: 10,
      lines: 2,
      lineColour: 'black',
      lineWidth: 1,
      top: [
        [0, 100],
        [200, 100],
        [400, 100],
      ],
      bottom: [
        [0, 200],
        [200, 200],
        [400, 200],
      ],
    },
    {
      fill: null,
      pad: 0,
      lines: 3,
      lineColour: 'black',
      lineWidth: 1,
      top: [
        [0, 140],
        [150, 135],
        [300, 150],
        [400, 145],
      ],
      bottom: [
        [0, 260],
        [150, 255],
        [300, 270],
        [400, 265],
      ],
    },
  ],
};

/** A ribbon's top and bottom curves as drawn at one moment. */
type Curves = readonly [top: readonly Point[], bottom: readonly Point[]];

// The points were computed from the motion the owner approved, before it was ported: the pointer
// seen and moved before the first frame, moved again after the third and the sixth, then still.
const afterFrame2: readonly Curves[] = [
  [
    [
      [0, 100.017],
      [200, 100.969],
      [400, 99.882],
    ],
    [
      [0, 200.0383],
      [200, 200.8203],
      [400, 199.8206],
    ],
  ],
  [
    [
      [0, 140.0674],
      [150, 135.7338],
      [300, 149.6879],
      [400, 144.735],
    ],
    [
      [0, 260.0451],
      [150, 255.3009],
      [300, 269.7025],
      [400, 264.8512],
    ],
  ],
];

const afterFrame8: readonly Curves[] = [
  [
    [
      [0, 100.027],
      [200, 107.5828],
      [400, 99.0587],
    ],
    [
      [0, 200.1683],
      [200, 207.2579],
      [400, 198.6261],
    ],
  ],
  [
    [
      [0, 140.3185],
      [150, 140.5677],
      [300, 148.9129],
      [400, 142.3621],
    ],
    [
      [0, 260.2574],
      [150, 257.9737],
      [300, 268.5526],
      [400, 263.5973],
    ],
  ],
];

const afterFrame20: readonly Curves[] = [
  [
    [
      [0, 99.8805],
      [200, 106.9521],
      [400, 101.4742],
    ],
    [
      [0, 199.9523],
      [200, 212.0237],
      [400, 200.9601],
    ],
  ],
  [
    [
      [0, 140.1044],
      [150, 141.8096],
      [300, 156.5482],
      [400, 144.7406],
    ],
    [
      [0, 260.2491],
      [150, 261.8516],
      [300, 272.3987],
      [400, 263.6944],
    ],
  ],
];

const afterFrame45: readonly Curves[] = [
  [
    [
      [0, 99.9597],
      [200, 99.6523],
      [400, 100.3949],
    ],
    [
      [0, 199.9311],
      [200, 199.9463],
      [400, 200.6066],
    ],
  ],
  [
    [
      [0, 139.9369],
      [150, 134.8965],
      [300, 151.4057],
      [400, 145.5129],
    ],
    [
      [0, 259.9514],
      [150, 255.2203],
      [300, 271.1974],
      [400, 265.3379],
    ],
  ],
];

/** Every ribbon of the composition drawn through these curves, one pair per ribbon. */
function drawnThrough(curves: readonly Curves[]): LayerShape[] {
  return composition.layers.map(({ fill, pad, lines }, layer) => {
    const [top, bottom] = curves[layer] ?? [[], []];
    return {
      layer,
      ribbon: fill === null ? null : ribbonPath(top, bottom, pad),
      lines: Array.from({ length: lines }, (_, line) =>
        contourPath(top, bottom, (line + 1) / (lines + 1)),
      ),
    };
  });
}

function frames(field: WaveField, count: number): void {
  for (let frame = 0; frame < count; frame++) field.advance(FRAME);
}

describe('WaveField', () => {
  it('moves exactly as the approved motion', () => {
    const field = new WaveField(composition);

    field.pointerAt({ x: 170, y: 150 });
    field.pointerAt({ x: 230, y: 150 });
    frames(field, 2);
    expect(field.shapes()).toEqual(drawnThrough(afterFrame2));

    frames(field, 1);
    field.pointerAt({ x: 260, y: 120 });
    frames(field, 3);
    field.pointerAt({ x: 250, y: 190 });
    frames(field, 2);
    expect(field.shapes()).toEqual(drawnThrough(afterFrame8));

    frames(field, 12);
    expect(field.shapes()).toEqual(drawnThrough(afterFrame20));

    frames(field, 25);
    expect(field.shapes()).toEqual(drawnThrough(afterFrame45));

    // The frame the waves come back to rest at follows the port's own rule, measured from it.
    let frame = 45;
    while (!field.still && frame < 1000) {
      field.advance(FRAME);
      frame++;
    }
    expect(frame).toBe(109);
  });
});
