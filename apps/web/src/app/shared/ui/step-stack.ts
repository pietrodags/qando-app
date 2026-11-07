import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  Component,
  Directive,
  TemplateRef,
  afterRenderEffect,
  computed,
  contentChildren,
  inject,
  input,
  linkedSignal,
  model,
  untracked,
  viewChildren,
} from '@angular/core';

/** The identity colour of a step, shown as the dot beside its label. */
export type StepAccent = 'slate' | 'blue' | 'teal' | 'amber' | 'salmon';

/** One step of a `StepStack`: `<ng-template appStep="paso 1" accent="slate">…</ng-template>`. */
@Directive({ selector: 'ng-template[appStep]' })
export class Step {
  /** The step's label, already translated (named as the selector, so no alias is needed). */
  readonly appStep = input.required<string>();
  readonly accent = input<StepAccent>('slate');
  readonly template = inject(TemplateRef);
}

/**
 * What a step is doing while the stack moves: `folding` into its tab (or a tab staying one),
 * `returning` from a tab or a fade back into the card, `leaving` (fading out, after the current
 * step). `content` keeps its content on screen while it moves: only a step that was the card has it.
 */
interface Motion {
  readonly kind: 'folding' | 'returning' | 'leaving';
  readonly content: boolean;
}

/** Where the stack is: the current step, how many steps are on screen and which ones are moving. */
interface Stack {
  readonly current: number;
  readonly shown: number;
  readonly motions: ReadonlyMap<number, Motion>;
}

function still(current: number): Stack {
  return { current, shown: current, motions: new Map() };
}

function shownWith(current: number, motions: ReadonlyMap<number, Motion>): number {
  const leaving = [...motions].filter(([, motion]) => motion.kind === 'leaving').map(([n]) => n);
  return Math.max(current, ...leaving);
}

/**
 * The stack after a change of step, taken from where it is: a step already moving keeps its
 * element and turns towards its new place, so a change during a motion never shows two cards.
 */
function moved(stack: Stack, to: number): Stack {
  const from = stack.current;
  const motions = new Map(stack.motions);
  for (let n = 1; n <= stack.shown; n++) {
    const before = stack.motions.get(n);
    const content = n === from || before?.content === true;
    if (n === to) {
      motions.set(n, { kind: 'returning', content: true });
    } else if (n > to) {
      motions.set(n, { kind: 'leaving', content });
    } else if (n === from || before?.kind === 'leaving') {
      motions.set(n, { kind: 'folding', content });
    }
  }
  return { current: to, shown: shownWith(to, motions), motions };
}

function settled(stack: Stack, n: number, motion: Motion): Stack {
  // A later change gave the step a new motion: that one settles on its own.
  if (stack.motions.get(n) !== motion) return stack;
  const motions = new Map(stack.motions);
  motions.delete(n);
  return { current: stack.current, shown: shownWith(stack.current, motions), motions };
}

/**
 * Steps shown as a stack of cards (ADR 0010): the current step is a card with its label; the
 * steps before it fold into tabs above it, each one a little smaller the further back it is, and
 * pressing a tab goes back to that step; the steps after it are not shown. `current` counts from
 * 1, as the labels do; a page only sets it.
 *
 * The stack moves on its own: going forward, the card folds into its tab while the next card comes
 * in; going back, the tab grows back into the card while the steps after it fade out. A change
 * during a motion takes it from where it is. Every step keeps one element while it is on screen,
 * so the motion is CSS transitions between its places; a step leaves the screen, or a tab drops
 * its content, once its element has no animation left. Motion comes from the step tokens, which
 * reduced motion sets to zero, and then everything settles at once. When the step changes, the
 * focus moves to the new card, which its label names: the control that changed it is gone.
 */
@Component({
  selector: 'app-step-stack',
  imports: [NgTemplateOutlet],
  templateUrl: './step-stack.html',
  styleUrl: './step-stack.scss',
})
export class StepStack {
  readonly current = model.required<number>();
  /** The current step cannot be left by its tabs (e.g. while what it holds is being sent). */
  readonly locked = input(false);

  private readonly steps = contentChildren(Step);

  private readonly stack = linkedSignal<number, Stack>({
    source: this.current,
    computation: (to, previous) => (previous ? moved(previous.value, to) : still(to)),
  });

  /** Every step on screen, in order, with its place in the stack. */
  protected readonly shown = computed(() => {
    const { current, shown, motions } = this.stack();
    return this.steps()
      .slice(0, shown)
      .map((step, index) => {
        const n = index + 1;
        const motion = motions.get(n);
        return {
          step,
          n,
          place: n < current ? 'tab' : n === current ? 'card' : 'leaving',
          returning: motion?.kind === 'returning',
          content: n === current || motion?.content === true,
          depth: current - n,
        };
      });
  });

  private readonly elements = viewChildren<ElementRef<HTMLElement>>('step');

  constructor() {
    // Each moving step settles once its element (and the body that folds) stops animating.
    afterRenderEffect(() => {
      const elements = this.elements();
      for (const [n, motion] of this.stack().motions) {
        const element = elements[n - 1]?.nativeElement;
        if (element) this.settleWhenStill(element, n, motion);
      }
    });

    let first = true;
    afterRenderEffect(() => {
      const current = this.current();
      // Only a change of step moves the focus, not a step leaving the screen.
      const card = untracked(() => this.elements()[current - 1]?.nativeElement);
      // The page opens on its first step: the focus stays where the browser put it.
      if (first) {
        first = false;
        return;
      }
      card?.focus({ preventScroll: true });
    });
  }

  private settleWhenStill(element: HTMLElement, n: number, motion: Motion): void {
    // A browser without the Web Animations API has nothing to wait for.
    const running = [element, element.querySelector('.body')].flatMap((moving) =>
      moving && 'getAnimations' in moving ? moving.getAnimations() : [],
    );
    if (running.length === 0) {
      this.stack.update((stack) => settled(stack, n, motion));
      return;
    }
    // A transition retargeted by a new change is cut short: look again, it may still be moving.
    void Promise.allSettled(running.map((animation) => animation.finished)).then(() => {
      this.settleWhenStill(element, n, motion);
    });
  }
}
