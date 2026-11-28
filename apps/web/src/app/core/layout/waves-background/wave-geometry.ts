import type { Point } from './wave-compositions';

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

/** Where something lies on the screen. */
interface Box extends Size {
  readonly left: number;
  readonly top: number;
}

/**
 * A ribbon's outline as an SVG path: its top curve left to right, then its bottom curve back,
 * lowered by `pad` so the ribbon in front overlaps it with no gap.
 */
export function ribbonPath(top: readonly Point[], bottom: readonly Point[], pad: number): string {
  const back = bottom.map(([x, y]): Point => [x, y + pad]).reverse();
  const [start] = back;
  return `${smoothCurve(top)} L ${at(start)}${segments(back)} Z`;
}

/** A contour line between a ribbon's two curves, `share` of the way down (0 on top, 1 at the bottom). */
export function contourPath(
  top: readonly Point[],
  bottom: readonly Point[],
  share: number,
): string {
  return smoothCurve(
    top.map(([x, y], index): Point => {
      const [toX, toY] = bottom[index] ?? [x, y];
      return [x + (toX - x) * share, y + (toY - y) * share];
    }),
  );
}

/**
 * Where a point of the screen falls in the drawing, which lies in `screen` (inside the room the
 * page keeps for its scrollbars, where they take room) and covers it as
 * `preserveAspectRatio="xMidYMid slice"` draws it: scaled to fill it and cropped evenly at the
 * two sides that overflow.
 */
export function toScene(point: Position, screen: Box, scene: Size): Position {
  const scale = Math.max(screen.width / scene.width, screen.height / scene.height);
  return {
    x: (point.x - screen.left - (screen.width - scene.width * scale) / 2) / scale,
    y: (point.y - screen.top - (screen.height - scene.height * scale) / 2) / scale,
  };
}

/** A smooth curve through every point (Catmull-Rom, drawn as cubic Béziers). */
function smoothCurve(points: readonly Point[]): string {
  const [start] = points;
  return `M ${at(start)}${segments(points)}`;
}

/** The Béziers from the first point to the last: each bends towards the points around it. */
function segments(points: readonly Point[]): string {
  const point = (index: number): Point =>
    points[Math.min(Math.max(index, 0), points.length - 1)] ?? [0, 0];
  let path = '';
  for (let index = 1; index < points.length; index++) {
    const [beforeX, beforeY] = point(index - 2);
    const [fromX, fromY] = point(index - 1);
    const [toX, toY] = point(index);
    const [afterX, afterY] = point(index + 1);
    const first: Point = [fromX + (toX - beforeX) / 6, fromY + (toY - beforeY) / 6];
    const second: Point = [toX - (afterX - fromX) / 6, toY - (afterY - fromY) / 6];
    path += ` C ${at(first)}, ${at(second)}, ${at([toX, toY])}`;
  }
  return path;
}

function at(point: Point | undefined): string {
  const [x, y] = point ?? [0, 0];
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}
