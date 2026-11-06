import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  Component,
  Directive,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  viewChild,
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
 * Steps shown as a stack of cards (ADR 0010): the current step is a card with its label; the
 * steps before it fold into tabs above it, each one a little smaller the further back it is, and
 * pressing a tab goes back to that step; the steps after it are not shown yet. `current` counts
 * from 1, as the labels do. When the step changes, the focus moves to the new card, which its
 * label names: the control that changed it is gone with the old card. Motion comes from the step tokens, which reduced motion sets to zero.
 */
@Component({
  selector: 'app-step-stack',
  imports: [NgTemplateOutlet],
  styleUrl: './step-stack.scss',
  template: `
    @for (step of earlier(); track step) {
      <button
        class="tab"
        type="button"
        [style.--tab-depth]="current() - 1 - $index"
        [disabled]="locked()"
        (click)="current.set($index + 1)"
      >
        {{ step.appStep() }}
      </button>
    }
    <!-- Tracked by the step, so each step gets a card of its own and plays the entering motion. -->
    @for (step of shown(); track step) {
      <section
        #card
        class="card"
        tabindex="-1"
        [attr.aria-label]="step.appStep()"
        animate.enter="entering"
      >
        <p class="step-label" [style.--step-accent]="'var(--q-accent-' + step.accent() + ')'">
          {{ step.appStep() }}
        </p>
        <ng-container [ngTemplateOutlet]="step.template" />
      </section>
    }
  `,
})
export class StepStack {
  readonly current = model.required<number>();
  /** The current step cannot be left by its tabs (e.g. while what it holds is being sent). */
  readonly locked = input(false);

  private readonly steps = contentChildren(Step);

  protected readonly earlier = computed(() => this.steps().slice(0, this.current() - 1));
  /** The current step, alone: a list so the card is tracked by the step it shows. */
  protected readonly shown = computed(() => this.steps().slice(this.current() - 1, this.current()));

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  constructor() {
    const injector = inject(Injector);
    let first = true;
    effect(() => {
      this.current();
      // The page opens on its first step: the focus stays where the browser put it.
      if (first) {
        first = false;
        return;
      }
      afterNextRender(
        () => {
          this.card()?.nativeElement.focus({ preventScroll: true });
        },
        { injector },
      );
    });
  }
}
