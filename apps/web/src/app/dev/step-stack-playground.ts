import { Component, computed, signal } from '@angular/core';
import { Step, StepStack } from '../shared/ui/step-stack';

/** The step tokens slowed down by the slow-motion switch. */
const motionTokens = [
  '--q-step-duration',
  '--q-step-collapse-duration',
  '--q-step-radius-duration',
  '--q-step-return-duration',
];

/** A burst of changes, a little faster than one motion, so each one cuts the last short. */
const burst = [2, 3, 1];
const burstGap = 120;

/**
 * Development-only page where the step motion is reviewed (ADR 0010): a four-step stack with
 * steps of different heights, buttons for every change (forward, back, jumps, a burst of quick
 * clicks) and a slow-motion switch. Not part of the production build.
 */
@Component({
  selector: 'app-step-stack-playground',
  imports: [Step, StepStack],
  templateUrl: './step-stack-playground.html',
  styleUrl: './step-stack-playground.scss',
})
export class StepStackPlayground {
  protected readonly step = signal(1);
  protected readonly slow = signal(false);
  protected readonly locked = signal(false);
  protected readonly steps = [1, 2, 3, 4];
  protected readonly days = Array.from({ length: 35 }, (_, index) => index + 1);

  protected readonly slowMotion = computed(() => {
    if (!this.slow()) return {};
    const root = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      motionTokens.map((token) => [token, `calc(${root.getPropertyValue(token).trim()} * 4)`]),
    );
  });

  protected playBurst(): void {
    burst.forEach((step, index) => {
      setTimeout(() => {
        this.step.set(step);
      }, index * burstGap);
    });
  }
}
