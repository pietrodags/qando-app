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
  viewChild,
  viewChildren,
} from '@angular/core';

/**
 * The card of the current step, as a CSS selector: what a step holds finds the card it is in
 * with `closest`.
 */
export const STEP_CARD = '.card';

/** One step of a `StepStack`: `<ng-template appStep="paso 1">…</ng-template>`. */
@Directive({ selector: 'ng-template[appStep]' })
export class Step {
  /** The step's label, already translated (named as the selector, so no alias is needed). */
  readonly appStep = input.required<string>();
  readonly template = inject(TemplateRef);
}

/**
 * A step on its way to its place in the stack (a tab, the card, or off the screen after the card).
 * `returning`: it is becoming the card, from a tab or from fading out. `content`: it was the card
 * when it started moving, so its content stays on screen until it is still.
 */
interface Motion {
  readonly returning: boolean;
  readonly content: boolean;
}

/** Where the stack is: the current step and the steps still moving. */
interface Stack {
  readonly current: number;
  readonly motions: ReadonlyMap<number, Motion>;
}

/** A step on screen, as the template draws it. */
interface StepView {
  readonly step: Step;
  readonly n: number;
  readonly place: 'tab' | 'card' | 'leaving';
  readonly folded: boolean;
  readonly returning: boolean;
  readonly content: boolean;
  readonly depth: number;
}

/** The steps on screen: up to the current one, and those after it still fading out. */
function shownOf(stack: Stack): number {
  return Math.max(stack.current, ...stack.motions.keys());
}

/**
 * The stack after a change of step, taken from where it is: every step whose place changes (and
 * every step already moving) gets a new motion, and keeps its element, so a change during a
 * motion turns it towards its new place and never shows two cards.
 */
function moved(stack: Stack, to: number): Stack {
  const from = stack.current;
  const motions = new Map(stack.motions);
  for (let n = 1; n <= shownOf(stack); n++) {
    const before = stack.motions.get(n);
    if (n >= to || n === from || before !== undefined) {
      motions.set(n, { returning: n === to, content: n === from || before?.content === true });
    }
  }
  return { current: to, motions };
}

function settled(stack: Stack, n: number, motion: Motion): Stack {
  // A later change gave the step a new motion: that one settles on its own.
  if (stack.motions.get(n) !== motion) return stack;
  const motions = new Map(stack.motions);
  motions.delete(n);
  return { current: stack.current, motions };
}

/**
 * Steps shown as a stack of cards, one component for every page with steps so that their motion
 * cannot drift apart: the current step is a card with its label; the steps before it fold into
 * tabs above it, each one a little smaller the further back it is, and pressing a tab goes back
 * to that step; the steps after it are not shown. `current` counts from 1, as the labels do; a
 * page only sets it.
 *
 * The stack moves on its own: going forward, the card folds into its tab while the next card comes
 * in; going back, the tab grows back into the card while the steps after it fade out. A change
 * during a motion takes it from where it is. Every step keeps one element while it is on screen,
 * so the motion is CSS transitions between its places; a step leaves the screen, or a tab drops
 * its content, once its element has no animation left. Motion comes from the step tokens, which
 * reduced motion sets to zero, and then everything settles at once. When the step changes, the
 * focus moves to the new card, which its label names: the control that changed it is gone. A page
 * asks for the same (`focusCard`) after a change inside the card that takes away the control
 * pressed. What measures the page from inside the card asks how much higher the card will be once
 * the steps above it have folded (`rise`): the card comes in while the step before it still folds.
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
    computation: (to, previous) =>
      previous ? moved(previous.value, to) : { current: to, motions: new Map() },
  });

  /** Every step on screen, in order, with its place in the stack. */
  protected readonly shown = computed<readonly StepView[]>(() => {
    const stack = this.stack();
    const { current, motions } = stack;
    return this.steps()
      .slice(0, shownOf(stack))
      .map((step, index) => {
        const n = index + 1;
        const motion = motions.get(n);
        const place: StepView['place'] = n < current ? 'tab' : n === current ? 'card' : 'leaving';
        const content = n === current || motion?.content === true;
        return {
          step,
          n,
          place,
          // A step fading out keeps the shape it had: only the card it was has content.
          folded: place === 'tab' || !content,
          returning: motion?.returning === true,
          content,
          depth: current - n,
        };
      });
  });

  private readonly elements = viewChildren<ElementRef<HTMLElement>>('step');
  private readonly folded = viewChild.required<ElementRef<HTMLElement>>('folded');

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
      // Only a change of step moves the focus, not a step leaving the screen.
      this.current();
      // The page opens on its first step: the focus stays where the browser put it.
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        this.focusCard();
      });
    });
  }

  /**
   * Moves the focus to the current card, which its label names: as on a change of step, for a
   * change inside the card that takes away the control that made it.
   */
  focusCard(): void {
    this.elements()[this.current() - 1]?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * How much higher on the page `element`, in the current card, will be once the steps above the
   * card have folded into their tabs: while one still folds, the card sits lower than it will,
   * for as long as the motion lasts. 0 when nothing above it moves, and for what is not in the
   * card.
   */
  rise(element: Element): number {
    const steps = this.elements();
    const current = this.current();
    const card = steps[current - 1]?.nativeElement;
    if (!card?.contains(element)) return 0;
    // The room a tab takes on the page, read from a folded step that never moves.
    const folded = this.folded().nativeElement;
    const tab = folded.offsetHeight + parseFloat(getComputedStyle(folded).marginBottom);
    const settledTop = (steps[0]?.nativeElement.offsetTop ?? 0) + (current - 1) * tab;
    return card.offsetTop - settledTop;
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
