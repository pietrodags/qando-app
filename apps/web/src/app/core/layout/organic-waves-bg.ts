import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  NgZone,
  viewChild,
} from '@angular/core';

type Point = readonly [number, number];

interface WaveLayerDef {
  fill: string;
  padY: number;
  lines: number;
  stroke: string;
  strokeWidth: number;
  top: Point[];
  bottom: Point[];
}

interface WaveNode {
  bx: number;
  by: number;
  oy: number;
  vy: number;
}

interface SceneLayer {
  padY: number;
  fillPath: SVGPathElement | null;
  linePaths: { el: SVGPathElement; t: number }[];
  topNodes: WaveNode[];
  bottomNodes: WaveNode[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const WAVE_LAYERS: readonly WaveLayerDef[] = [
  {
    fill: 'none',
    padY: 0,
    lines: 18,
    stroke: 'rgba(160, 152, 134, 0.14)',
    strokeWidth: 0.9,
    top: [[-40, -30], [160, -20], [380, -35], [600, -15], [840, -30], [1080, -25], [1320, -40], [1640, -50]],
    bottom: [[-40, 210], [160, 245], [380, 218], [600, 228], [840, 255], [1080, 195], [1320, 178], [1640, 92]],
  },
  {
    fill: 'url(#owb-grad-pale-sage)',
    padY: 55,
    lines: 20,
    stroke: 'rgba(95, 135, 95, 0.09)',
    strokeWidth: 0.9,
    top: [[-40, 210], [120, 232], [260, 260], [460, 198], [640, 238], [800, 268], [1000, 204], [1190, 178], [1380, 174], [1510, 118], [1640, 92]],
    bottom: [[-40, 340], [120, 345], [280, 420], [460, 370], [640, 345], [820, 385], [1020, 305], [1220, 285], [1400, 275], [1530, 225], [1640, 190]],
  },
  {
    fill: 'url(#owb-grad-upper-green)',
    padY: 65,
    lines: 24,
    stroke: 'rgba(42, 102, 58, 0.13)',
    strokeWidth: 0.95,
    top: [[-40, 305], [115, 298], [255, 365], [390, 408], [580, 316], [760, 352], [925, 332], [1080, 272], [1265, 278], [1445, 212], [1640, 152]],
    bottom: [[-40, 470], [140, 435], [290, 495], [450, 505], [640, 400], [820, 435], [1000, 415], [1180, 355], [1360, 372], [1500, 325], [1640, 290]],
  },
  {
    fill: 'url(#owb-grad-right-mist)',
    padY: 35,
    lines: 20,
    stroke: 'rgba(65, 115, 76, 0.10)',
    strokeWidth: 0.85,
    top: [[660, 415], [830, 410], [985, 332], [1150, 292], [1310, 342], [1470, 312], [1640, 222]],
    bottom: [[660, 515], [830, 495], [985, 485], [1150, 455], [1310, 425], [1470, 410], [1640, 355]],
  },
  {
    fill: 'url(#owb-grad-deep-emerald)',
    padY: 75,
    lines: 26,
    stroke: 'rgba(18, 62, 36, 0.18)',
    strokeWidth: 1.0,
    top: [[-40, 452], [130, 416], [260, 446], [415, 505], [570, 442], [712, 360], [870, 414], [1035, 442], [1220, 364], [1410, 382], [1640, 286]],
    bottom: [[-40, 575], [145, 595], [285, 655], [455, 618], [625, 570], [785, 500], [960, 525], [1125, 515], [1300, 450], [1485, 445], [1640, 400]],
  },
  {
    fill: 'url(#owb-grad-left-lobe)',
    padY: 55,
    lines: 22,
    stroke: 'rgba(32, 92, 50, 0.14)',
    strokeWidth: 0.95,
    top: [[-40, 466], [78, 462], [176, 526], [248, 596], [362, 594], [500, 546], [642, 542], [790, 520]],
    bottom: [[-40, 640], [96, 680], [218, 728], [338, 704], [462, 648], [588, 612], [705, 592], [825, 562]],
  },
  {
    fill: 'url(#owb-grad-left-mint)',
    padY: 60,
    lines: 18,
    stroke: 'rgba(72, 118, 82, 0.11)',
    strokeWidth: 0.9,
    top: [[-40, 626], [110, 696], [238, 745], [378, 676], [522, 624], [672, 584], [825, 530]],
    bottom: [[-40, 865], [122, 840], [282, 828], [442, 755], [602, 694], [742, 630], [885, 568]],
  },
  {
    fill: 'url(#owb-grad-cream)',
    padY: 50,
    lines: 14,
    stroke: 'rgba(155, 145, 126, 0.13)',
    strokeWidth: 0.85,
    top: [[-40, 620], [92, 668], [202, 722], [322, 746], [435, 726]],
    bottom: [[-40, 860], [102, 825], [222, 798], [342, 788], [455, 762]],
  },
  {
    fill: 'url(#owb-grad-cream)',
    padY: 65,
    lines: 20,
    stroke: 'rgba(155, 145, 126, 0.13)',
    strokeWidth: 0.9,
    top: [[-40, 845], [142, 785], [312, 774], [480, 694], [642, 588], [766, 484], [886, 456], [1072, 495], [1262, 424], [1452, 395], [1640, 392]],
    bottom: [[-40, 945], [162, 875], [342, 864], [522, 778], [686, 672], [832, 564], [972, 542], [1142, 548], [1332, 478], [1502, 458], [1640, 452]],
  },
  {
    fill: 'url(#owb-grad-mid-mint)',
    padY: 65,
    lines: 20,
    stroke: 'rgba(62, 116, 78, 0.11)',
    strokeWidth: 0.9,
    top: [[-40, 882], [150, 826], [342, 820], [522, 746], [702, 636], [876, 536], [1052, 538], [1232, 486], [1422, 448], [1640, 445]],
    bottom: [[-40, 965], [172, 930], [382, 914], [578, 854], [762, 724], [942, 658], [1122, 634], [1302, 558], [1482, 524], [1640, 518]],
  },
  {
    fill: 'url(#owb-grad-cream)',
    padY: 75,
    lines: 22,
    stroke: 'rgba(150, 142, 125, 0.13)',
    strokeWidth: 0.9,
    top: [[-40, 920], [182, 836], [382, 865], [562, 804], [742, 694], [922, 644], [1102, 624], [1282, 534], [1462, 484], [1640, 480]],
    bottom: [[-40, 995], [220, 980], [460, 970], [685, 945], [885, 830], [1085, 755], [1245, 680], [1415, 620], [1545, 610], [1640, 570]],
  },
  {
    fill: 'url(#owb-grad-bottom-mid)',
    padY: 85,
    lines: 24,
    stroke: 'rgba(28, 86, 46, 0.15)',
    strokeWidth: 0.95,
    top: [[670, 925], [790, 885], [882, 774], [992, 716], [1126, 706], [1236, 638], [1356, 586], [1496, 594], [1640, 535]],
    bottom: [[670, 970], [820, 965], [960, 960], [1100, 950], [1240, 930], [1380, 870], [1500, 830], [1580, 790], [1640, 750]],
  },
  {
    fill: 'url(#owb-grad-bottom-deep)',
    padY: 95,
    lines: 24,
    stroke: 'rgba(18, 60, 34, 0.18)',
    strokeWidth: 1.0,
    top: [[1022, 925], [1034, 830], [1120, 780], [1230, 760], [1346, 698], [1472, 680], [1640, 598]],
    bottom: [[1022, 975], [1150, 975], [1270, 975], [1390, 975], [1510, 975], [1580, 975], [1640, 975]],
  },
];

@Component({
  selector: 'app-organic-waves-bg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
  },
  template: `
    <svg
      #scene
      class="wave-svg"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="owb-grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f4f1e8" />
          <stop offset="55%" stop-color="#f1eee4" />
          <stop offset="100%" stop-color="#eae6da" />
        </linearGradient>

        <linearGradient id="owb-grad-pale-sage" x1="0%" y1="0%" x2="100%" y2="30%">
          <stop offset="0%" stop-color="#e3ecd9" />
          <stop offset="45%" stop-color="#e7efe0" />
          <stop offset="80%" stop-color="#d8e7d3" />
          <stop offset="100%" stop-color="#dcead7" />
        </linearGradient>

        <linearGradient id="owb-grad-upper-green" x1="0%" y1="20%" x2="100%" y2="50%">
          <stop offset="0%" stop-color="#a2cfa0" />
          <stop offset="35%" stop-color="#87c08e" />
          <stop offset="68%" stop-color="#b7d9b6" />
          <stop offset="100%" stop-color="#76b581" />
        </linearGradient>

        <linearGradient id="owb-grad-right-mist" x1="0%" y1="0%" x2="100%" y2="20%">
          <stop offset="0%" stop-color="#dde9d6" />
          <stop offset="60%" stop-color="#cfe2ca" />
          <stop offset="100%" stop-color="#a9d2a8" />
        </linearGradient>

        <linearGradient id="owb-grad-deep-emerald" x1="0%" y1="10%" x2="100%" y2="70%">
          <stop offset="0%" stop-color="#4e9d68" />
          <stop offset="22%" stop-color="#378556" />
          <stop offset="48%" stop-color="#58a570" />
          <stop offset="72%" stop-color="#499864" />
          <stop offset="100%" stop-color="#61ab75" />
        </linearGradient>

        <linearGradient id="owb-grad-left-lobe" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#98cc9d" />
          <stop offset="55%" stop-color="#78b683" />
          <stop offset="100%" stop-color="#62a773" />
        </linearGradient>

        <linearGradient id="owb-grad-left-mint" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#dce9d7" />
          <stop offset="55%" stop-color="#c3dfc3" />
          <stop offset="100%" stop-color="#afd4b4" />
        </linearGradient>

        <linearGradient id="owb-grad-cream" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f3f0e7" />
          <stop offset="60%" stop-color="#efece2" />
          <stop offset="100%" stop-color="#e8e5da" />
        </linearGradient>

        <linearGradient id="owb-grad-mid-mint" x1="0%" y1="80%" x2="100%" y2="10%">
          <stop offset="0%" stop-color="#d8e8d6" />
          <stop offset="42%" stop-color="#bfe0c7" />
          <stop offset="75%" stop-color="#cde4cf" />
          <stop offset="100%" stop-color="#d9ead8" />
        </linearGradient>

        <linearGradient id="owb-grad-bottom-mid" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stop-color="#92c696" />
          <stop offset="48%" stop-color="#6fb07c" />
          <stop offset="100%" stop-color="#4e9866" />
        </linearGradient>

        <linearGradient id="owb-grad-bottom-deep" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#489361" />
          <stop offset="50%" stop-color="#3c8858" />
          <stop offset="100%" stop-color="#4c9766" />
        </linearGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#owb-grad-bg)" />
      <g #wavesLayer></g>
    </svg>

    <div class="paper-grain" [style.opacity]="grainOpacity()"></div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: -1;
      display: block;
      width: 100vw;
      height: 100dvh;
      overflow: hidden;
      pointer-events: none;
      user-select: none;
      background-color: #f2efe6;
    }

    .wave-svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .paper-grain {
      position: absolute;
      inset: 0;
      pointer-events: none;
      mix-blend-mode: multiply;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)'/%3E%3C/svg%3E");
      background-repeat: repeat;
    }
  `,
})
export class OrganicWavesBgComponent {
  /** Activa o desactiva la reacción al ratón */
  readonly interactive = input<boolean>(true);

  /** Intensidad de la textura de papel (0 a 1) */
  readonly grainOpacity = input<number>(0.14);

  /** Intensidad de la ondulación (1 = normal, 0.5 = más sutil, 1.5 = más viva) */
  readonly intensity = input<number>(1);

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('scene');
  private readonly wavesLayerRef = viewChild.required<ElementRef<SVGGElement>>('wavesLayer');
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private readonly config = {
    radius: 240,
    waveFreq: 0.0085,
    waveSpeed: 3.4,
    hoverAmp: 0,
    moveBoost: 18,
    pushFactor: 0.42,
    stiffness: 0.075,
    damping: 0.80,
  };

  constructor() {
    afterNextRender(() => {
      // Ejecutamos el bucle fuera de la zona de Angular para mantener 60fps
      // tanto en apps zoneless como en apps con Zone.js
      this.ngZone.runOutsideAngular(() => this.initScene());
    });
  }

  private initScene(): void {
    const svg = this.svgRef().nativeElement;
    const container = this.wavesLayerRef().nativeElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const sceneLayers: SceneLayer[] = WAVE_LAYERS.map((layer) => {
      const group = this.createSvgEl('g');
      let fillPath: SVGPathElement | null = null;

      if (layer.fill !== 'none') {
        fillPath = this.createSvgEl('path', { fill: layer.fill });
        group.appendChild(fillPath);
      }

      const linePaths: { el: SVGPathElement; t: number }[] = [];
      for (let k = 1; k <= layer.lines; k++) {
        const lineEl = this.createSvgEl('path', {
          fill: 'none',
          stroke: layer.stroke,
          'stroke-width': String(layer.strokeWidth),
        });
        group.appendChild(lineEl);
        linePaths.push({ el: lineEl, t: k / (layer.lines + 1) });
      }

      container.appendChild(group);

      return {
        padY: layer.padY,
        fillPath,
        linePaths,
        topNodes: layer.top.map(([x, y]) => ({ bx: x, by: y, oy: 0, vy: 0 })),
        bottomNodes: layer.bottom.map(([x, y]) => ({ bx: x, by: y, oy: 0, vy: 0 })),
      };
    });

    const renderAll = () => {
      for (const layer of sceneLayers) {
        const topPts: Point[] = layer.topNodes.map((n) => [n.bx, n.by + n.oy]);
        const bottomPts: Point[] = layer.bottomNodes.map((n) => [n.bx, n.by + n.oy]);

        if (layer.fillPath) {
          layer.fillPath.setAttribute('d', this.buildRibbonPath(topPts, bottomPts, layer.padY));
        }

        for (const line of layer.linePaths) {
          const t = line.t;
          const interpPts: Point[] = topPts.map((pt, idx) => {
            const bottom = bottomPts[idx] ?? pt;
            return [pt[0] + (bottom[0] - pt[0]) * t, pt[1] + (bottom[1] - pt[1]) * t];
          });
          line.el.setAttribute('d', this.catmullRomPath(interpPts));
        }
      }
    };

    // Dibujo inicial estático
    renderAll();

    if (prefersReducedMotion) return;

    const pointer = {
      x: 800,
      y: 450,
      vy: 0,
      active: false,
      energy: 0,
      hoverStrength: 0,
    };

    let rafId: number | null = null;
    const twoRadiusSq = 2 * this.config.radius * this.config.radius;

    const clientToSvg = (clientX: number, clientY: number) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 800, y: 450 };
      const mapped = pt.matrixTransform(ctm.inverse());
      return { x: mapped.x, y: mapped.y };
    };

    const updateNode = (
      node: WaveNode,
      layerIdx: number,
      time: number,
      amp: number,
      push: number,
    ): number => {
      const dx = node.bx - pointer.x;
      const dy = node.by - pointer.y;
      const distSq = dx * dx + dy * dy;

      let targetY = 0;
      if (distSq < twoRadiusSq * 4.5 && (amp > 0.01 || Math.abs(push) > 0.01)) {
        const influence = Math.exp(-distSq / twoRadiusSq);
        const wave = Math.sin(
          node.bx * this.config.waveFreq -
            time * this.config.waveSpeed +
            layerIdx * 0.55 +
            node.by * 0.003,
        );
        targetY = (wave * amp + push) * influence;
      }

      node.vy += (targetY - node.oy) * this.config.stiffness;
      node.vy *= this.config.damping;
      node.oy += node.vy;

      return Math.max(Math.abs(node.oy), Math.abs(node.vy));
    };

    const animate = (now: number) => {
      const time = now * 0.001;
      const scale = this.intensity();

      pointer.hoverStrength += ((pointer.active ? 1 : 0) - pointer.hoverStrength) * 0.06;
      pointer.energy *= 0.94;
      pointer.vy *= 0.88;

      const amp =
        (pointer.hoverStrength * this.config.hoverAmp +
          pointer.energy * this.config.moveBoost) *
        scale;
      const push =
        Math.max(-22, Math.min(22, pointer.vy * this.config.pushFactor)) *
        pointer.energy *
        scale;

      let maxMotion = 0;

      for (const [li, layer] of sceneLayers.entries()) {
        for (const node of layer.topNodes) {
          maxMotion = Math.max(maxMotion, updateNode(node, li, time, amp, push));
        }
        for (const node of layer.bottomNodes) {
          maxMotion = Math.max(maxMotion, updateNode(node, li, time, amp, push));
        }
      }

      renderAll();

      // Spike fix: with hoverAmp at 0 the hover alone moves nothing, so the loop stops once the
      // motion settles, even with the mouse still over the window (it used to run every frame).
      const hoverSettled =
        this.config.hoverAmp === 0 || (!pointer.active && pointer.hoverStrength < 0.002);
      if (hoverSettled && pointer.energy < 0.002 && maxMotion < 0.02) {
        for (const layer of sceneLayers) {
          layer.topNodes.forEach((n) => ((n.oy = 0), (n.vy = 0)));
          layer.bottomNodes.forEach((n) => ((n.oy = 0), (n.vy = 0)));
        }
        renderAll();
        rafId = null;
        return;
      }

      rafId = requestAnimationFrame(animate);
    };

    const startLoop = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(animate);
      }
    };

    // Spike (owner, 2026-11-22): the waves react only over the bare page, never over a card,
    // a dialog or anything else that paints its own background. The answer for the element
    // under the pointer is kept until the pointer moves onto another one.
    let lastTarget: EventTarget | null = null;
    let lastOverSurface = false;
    const paints = (el: Element): boolean => {
      const style = getComputedStyle(el);
      const color = style.backgroundColor;
      return (
        style.backgroundImage !== 'none' || (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)')
      );
    };
    const overSurface = (target: EventTarget | null): boolean => {
      if (target === lastTarget) return lastOverSurface;
      lastTarget = target;
      lastOverSurface = false;
      let el = target instanceof Element ? target : null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (paints(el)) {
          lastOverSurface = true;
          break;
        }
        el = el.parentElement;
      }
      return lastOverSurface;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.interactive()) return;
      if (overSurface(e.target)) {
        // Like leaving the window: what moves settles, and coming back is not read as a jump.
        pointer.active = false;
        return;
      }
      const pos = clientToSvg(e.clientX, e.clientY);
      if (pointer.active) {
        const dx = pos.x - pointer.x;
        const dy = pos.y - pointer.y;
        const speed = Math.hypot(dx, dy);
        pointer.energy = Math.min(1, pointer.energy + speed * 0.0075);
        pointer.vy = pointer.vy * 0.6 + dy * 0.4;
      }
      pointer.x = pos.x;
      pointer.y = pos.y;
      pointer.active = true;
      startLoop();
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerup', onPointerLeave, { passive: true });
    window.addEventListener('pointercancel', onPointerLeave, { passive: true });

    this.destroyRef.onDestroy(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerLeave);
      window.removeEventListener('pointercancel', onPointerLeave);
    });
  }

  private createSvgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>,
  ): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
    }
    return el;
  }

  private catmullRomPath(pts: readonly Point[]): string {
    if (pts.length < 2) return '';
    const at = (i: number): Point => pts[Math.min(Math.max(i, 0), pts.length - 1)] ?? [0, 0];
    let d = `M ${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }

  private buildRibbonPath(
    topPts: readonly Point[],
    bottomPts: readonly Point[],
    padY = 0,
  ): string {
    const topD = this.catmullRomPath(topPts);
    const paddedBottom: Point[] = padY
      ? bottomPts.map(([x, y]) => [x, y + padY])
      : [...bottomPts];
    const revBottom = [...paddedBottom].reverse();
    const bottomD = this.catmullRomPath(revBottom).replace(/^M\s+[-\d.]+\s+[-\d.]+/, '');
    const lastBottom = paddedBottom.at(-1) ?? [0, 0];
    return `${topD} L ${lastBottom[0].toFixed(1)} ${lastBottom[1].toFixed(1)}${bottomD} Z`;
  }
}
