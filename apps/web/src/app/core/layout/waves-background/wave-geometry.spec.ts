import type { Point } from './wave-compositions';
import { contourPath, ribbonPath, toScene } from './wave-geometry';

describe('ribbonPath', () => {
  it('draws the top curve left to right, then the bottom curve back, lowered by the pad', () => {
    const path = ribbonPath(
      [
        [0, 0],
        [60, 0],
      ],
      [
        [0, 30],
        [60, 30],
      ],
      10,
    );

    expect(path).toBe(
      'M 0.0 0.0 C 10.0 0.0, 50.0 0.0, 60.0 0.0 L 60.0 40.0 C 50.0 40.0, 10.0 40.0, 0.0 40.0 Z',
    );
  });

  it('bends each segment towards the points around it, as a smooth curve through every point', () => {
    const path = ribbonPath(
      [
        [0, 0],
        [10, 10],
        [20, 0],
      ],
      [
        [0, 30],
        [10, 30],
        [20, 30],
      ],
      0,
    );

    expect(path).toBe(
      'M 0.0 0.0 C 1.7 1.7, 6.7 10.0, 10.0 10.0 C 13.3 10.0, 18.3 1.7, 20.0 0.0' +
        ' L 20.0 30.0 C 18.3 30.0, 13.3 30.0, 10.0 30.0 C 6.7 30.0, 1.7 30.0, 0.0 30.0 Z',
    );
  });
});

describe('contourPath', () => {
  const top = [
    [0, 0],
    [60, 0],
  ] as const;
  const bottom = [
    [0, 30],
    [60, 60],
  ] as const;

  it('runs between the two curves, at the given share of the way down', () => {
    expect(contourPath(top, bottom, 0.5)).toBe('M 0.0 15.0 C 10.0 17.5, 50.0 27.5, 60.0 30.0');
  });

  it('also runs between the two curves across, when their points are not one above the other', () => {
    const upper: Point[] = [
      [0, 0],
      [100, 0],
    ];
    const lower: Point[] = [
      [20, 100],
      [120, 100],
    ];
    const halfway: Point[] = [
      [10, 50],
      [110, 50],
    ];

    expect(contourPath(upper, lower, 0.5)).toBe(contourPath(halfway, halfway, 0));
  });

  it('lies on the top curve at 0 and on the bottom curve at 1', () => {
    expect(contourPath(top, bottom, 0)).toBe('M 0.0 0.0 C 10.0 0.0, 50.0 0.0, 60.0 0.0');
    expect(contourPath(top, bottom, 1)).toBe('M 0.0 30.0 C 10.0 35.0, 50.0 55.0, 60.0 60.0');
  });
});

describe('toScene', () => {
  const scene = { width: 1600, height: 900 };

  it('on a screen narrower than the drawing, finds the point in the drawing cropped at both sides', () => {
    const screen = { left: 0, top: 0, width: 800, height: 900 };

    expect(toScene({ x: 0, y: 0 }, screen, scene)).toEqual({ x: 400, y: 0 });
    expect(toScene({ x: 400, y: 450 }, screen, scene)).toEqual({ x: 800, y: 450 });
  });

  it('on a screen wider than the drawing, finds the point in the drawing enlarged and cropped above and below', () => {
    const screen = { left: 0, top: 0, width: 3200, height: 900 };

    expect(toScene({ x: 0, y: 0 }, screen, scene)).toEqual({ x: 0, y: 225 });
    expect(toScene({ x: 1600, y: 450 }, screen, scene)).toEqual({ x: 800, y: 450 });
  });

  it('counts from the corner of the drawing where it lies inside a frame, as the room of the scrollbars', () => {
    const framed = { left: 15, top: 10, width: 800, height: 900 };

    expect(toScene({ x: 15, y: 10 }, framed, scene)).toEqual({ x: 400, y: 0 });
    expect(toScene({ x: 415, y: 460 }, framed, scene)).toEqual({ x: 800, y: 450 });
  });
});
