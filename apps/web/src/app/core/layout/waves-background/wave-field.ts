import type { Point, WaveComposition, WaveLayer } from './wave-compositions';
import { contourPath, ribbonPath } from './wave-geometry';

/** One ribbon as it is drawn now: its filled outline (none for lines only) and its contour lines. */
export interface LayerShape {
  readonly layer: number;
  readonly ribbon: string | null;
  readonly lines: readonly string[];
}

interface Position {
  readonly x: number;
  readonly y: number;
}

/** A point of a ribbon's curve: where it rests, how far off it is now and how fast it goes. */
interface WaveNode {
  readonly x: number;
  readonly y: number;
  offset: number;
  speed: number;
  /** The offset it had when its ribbon was last drawn. */
  drawn: number;
}

interface Ribbon {
  readonly layer: WaveLayer;
  readonly top: WaveNode[];
  readonly bottom: WaveNode[];
}

// The motion runs in fixed steps of a 60 Hz frame, whatever the screen's rate, as it was tuned.
const STEP = 1000 / 60;
// A late frame (a hidden tab) moves the waves on by this much at most, never by the whole gap.
const LONGEST_FRAME = 100;

// The approved motion, per step: the pointer's speed builds an energy that fades, the waves around
// the pointer follow a travelling sine pushed along the pointer's vertical drift, and each point
// springs towards its target.
const ENERGY_PER_UNIT = 0.0075;
const ENERGY_FADE = 0.94;
const DRIFT_KEPT = 0.6;
const DRIFT_FADE = 0.88;
const WAVE_HEIGHT = 18;
const PUSH_PER_DRIFT = 0.42;
const LARGEST_PUSH = 22;
const WAVE_FREQUENCY = 0.0085;
// Per second of motion.
const WAVE_SPEED = 3.4;
const LAYER_PHASE = 0.55;
const DEPTH_PHASE = 0.003;
const STIFFNESS = 0.075;
const DAMPING = 0.8;
// Past three reaches the pointer's pull is too faint to show.
const PULL_AREA = 4.5;
const FAINTEST_PULL = 0.01;

// A ripple with no pointer stirs the waves as a pass of the pointer this long would.
const RIPPLE_TRAVEL = 100;

// Below these the waves are at rest: they are put back exactly and the motion stops.
const RESTING_ENERGY = 0.002;
const RESTING_MOTION = 0.02;
// Half the paths' precision: a smaller change draws the same path.
const VISIBLE_CHANGE = 0.05;

/**
 * The waves' motion for one drawing: where the pointer is, how each ribbon's curves ripple around
 * it, and the paths to draw. Pure state, no screen: the caller tells it where the pointer is, in
 * the drawing's own units, and how much time went by; it answers only the ribbons that changed.
 */
export class WaveField {
  private readonly ribbons: readonly Ribbon[];
  private readonly pullWidth: number;
  private readonly pointer = { x: 0, y: 0, here: false, energy: 0, drift: 0 };
  private seconds = 0;
  private pending = 0;
  private resting = true;

  constructor(composition: WaveComposition) {
    const node = ([x, y]: Point): WaveNode => ({ x, y, offset: 0, speed: 0, drawn: 0 });
    this.ribbons = composition.layers.map((layer) => ({
      layer,
      top: layer.top.map(node),
      bottom: layer.bottom.map(node),
    }));
    this.pullWidth = 2 * composition.reach * composition.reach;
  }

  /** Whether nothing moves until the pointer does. */
  get still(): boolean {
    return this.resting;
  }

  /** Every ribbon as it is now. */
  shapes(): readonly LayerShape[] {
    return this.ribbons.map((ribbon, index) => this.shape(ribbon, index));
  }

  /** The pointer is at this point of the drawing. Only a move from where it was seen stirs the waves. */
  pointerAt({ x, y }: Position): void {
    const pointer = this.pointer;
    if (pointer.here) {
      const travel = Math.hypot(x - pointer.x, y - pointer.y);
      pointer.energy = Math.min(1, pointer.energy + travel * ENERGY_PER_UNIT);
      pointer.drift = pointer.drift * DRIFT_KEPT + (y - pointer.y) * (1 - DRIFT_KEPT);
      if (travel > 0) this.resting = false;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.here = true;
  }

  /**
   * Ripples the waves around this point of the drawing at once, as a quick pass of the pointer
   * there would, with no pointer moving. The pointer is then seen afresh, so where it was before
   * is not read as a jump.
   */
  ripple({ x, y }: Position): void {
    const pointer = this.pointer;
    pointer.energy = Math.min(1, pointer.energy + RIPPLE_TRAVEL * ENERGY_PER_UNIT);
    pointer.x = x;
    pointer.y = y;
    pointer.here = false;
    this.resting = false;
  }

  /** The pointer has gone (out of the window, over a card, a lifted finger): the waves settle. */
  pointerGone(): void {
    this.pointer.here = false;
  }

  /** Moves the waves on by `ms` of time and answers the ribbons whose shape changed. */
  advance(ms: number): readonly LayerShape[] {
    if (this.resting) return [];
    this.pending += Math.min(ms, LONGEST_FRAME);
    if (this.pending < STEP) return [];
    let motion = 0;
    while (this.pending >= STEP) {
      this.pending -= STEP;
      motion = this.step();
    }
    if (this.pointer.energy < RESTING_ENERGY && motion < RESTING_MOTION) {
      this.settle();
      // Every ribbon drawn off its rest is drawn again, so the drawing ends exactly at rest.
      return this.changed(0);
    }
    return this.changed(VISIBLE_CHANGE);
  }

  /** One step of the motion; answers how far or fast the most moving point goes. */
  private step(): number {
    const pointer = this.pointer;
    this.seconds += STEP / 1000;
    pointer.energy *= ENERGY_FADE;
    pointer.drift *= DRIFT_FADE;
    const height = pointer.energy * WAVE_HEIGHT;
    const push =
      Math.max(-LARGEST_PUSH, Math.min(LARGEST_PUSH, pointer.drift * PUSH_PER_DRIFT)) *
      pointer.energy;
    const pulling = height > FAINTEST_PULL || Math.abs(push) > FAINTEST_PULL;
    let motion = 0;
    this.ribbons.forEach((ribbon, layer) => {
      for (const node of [...ribbon.top, ...ribbon.bottom]) {
        const distance = (node.x - pointer.x) ** 2 + (node.y - pointer.y) ** 2;
        let target = 0;
        if (pulling && distance < this.pullWidth * PULL_AREA) {
          const wave = Math.sin(
            node.x * WAVE_FREQUENCY -
              this.seconds * WAVE_SPEED +
              layer * LAYER_PHASE +
              node.y * DEPTH_PHASE,
          );
          target = (wave * height + push) * Math.exp(-distance / this.pullWidth);
        }
        node.speed = (node.speed + (target - node.offset) * STIFFNESS) * DAMPING;
        node.offset += node.speed;
        motion = Math.max(motion, Math.abs(node.offset), Math.abs(node.speed));
      }
    });
    return motion;
  }

  private settle(): void {
    for (const ribbon of this.ribbons) {
      for (const node of [...ribbon.top, ...ribbon.bottom]) {
        node.offset = 0;
        node.speed = 0;
      }
    }
    this.pointer.energy = 0;
    this.pointer.drift = 0;
    this.pending = 0;
    this.resting = true;
  }

  /** The ribbons drawn more than `margin` off where they are now, drawn again. */
  private changed(margin: number): readonly LayerShape[] {
    const shapes: LayerShape[] = [];
    this.ribbons.forEach((ribbon, index) => {
      const nodes = [...ribbon.top, ...ribbon.bottom];
      if (!nodes.some((node) => Math.abs(node.offset - node.drawn) > margin)) return;
      for (const node of nodes) node.drawn = node.offset;
      shapes.push(this.shape(ribbon, index));
    });
    return shapes;
  }

  private shape(ribbon: Ribbon, index: number): LayerShape {
    const curve = (nodes: readonly WaveNode[]): Point[] =>
      nodes.map((node): Point => [node.x, node.y + node.offset]);
    const top = curve(ribbon.top);
    const bottom = curve(ribbon.bottom);
    const { fill, pad, lines } = ribbon.layer;
    return {
      layer: index,
      ribbon: fill === null ? null : ribbonPath(top, bottom, pad),
      lines: Array.from({ length: lines }, (_, line) =>
        contourPath(top, bottom, (line + 1) / (lines + 1)),
      ),
    };
  }
}
