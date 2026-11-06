import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  model,
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
 * from 1, as the labels do. Motion comes from the step tokens, which reduced motion sets to zero.
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
        (click)="current.set($index + 1)"
      >
        {{ step.appStep() }}
      </button>
    }
    @if (active(); as step) {
      <section class="card" animate.enter="entering">
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

  private readonly steps = contentChildren(Step);

  protected readonly earlier = computed(() => this.steps().slice(0, this.current() - 1));
  protected readonly active = computed(() => this.steps()[this.current() - 1]);
}
