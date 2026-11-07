import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Step, StepStack } from './step-stack';
import stackStyles from './step-stack.scss' with { loader: 'text' };

@Component({
  imports: [Step, StepStack],
  template: `
    <app-step-stack [(current)]="current" [locked]="locked()">
      <ng-template appStep="paso 1"><p>Your name</p></ng-template>
      <ng-template appStep="paso 2" accent="amber"><p>Your days</p></ng-template>
      <ng-template appStep="paso 3"><p>Your times</p></ng-template>
    </app-step-stack>
  `,
})
class Host {
  readonly current = signal(1);
  readonly locked = signal(false);
}

@Component({
  imports: [Step, StepStack],
  template: `
    <app-step-stack [(current)]="current">
      <ng-template appStep="paso 1"><p>Your name</p></ng-template>
      <ng-template appStep="paso 2"><p>Your days</p></ng-template>
    </app-step-stack>
  `,
})
class BareHost {
  readonly current = signal(1);
}

/**
 * Stands in for the browser's transitions, which jsdom does not run: while it is running, every
 * element reports one animation, which ends (or is cut short) when the test says so.
 */
class Motion {
  constructor(private readonly stable: () => Promise<void>) {}

  private finished: Promise<void> = Promise.resolve();
  private finish: (cut: boolean) => void = () => undefined;
  private running = false;

  start(): void {
    this.running = true;
    this.finished = new Promise((resolve, reject) => {
      this.finish = (cut) => {
        if (cut) reject(new DOMException('cut short', 'AbortError'));
        else resolve();
      };
    });
    // A test that never ends the motion leaves it pending, not unhandled.
    this.finished.catch(() => undefined);
  }

  end(): Promise<void> {
    this.running = false;
    this.finish(false);
    return this.settled();
  }

  /** As the browser does when a transition is retargeted or removed. */
  cutShort(): Promise<void> {
    this.running = false;
    this.finish(true);
    return this.settled();
  }

  private async settled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await this.stable();
  }

  animations(): Animation[] {
    return this.running ? [new RunningAnimation(this.finished)] : [];
  }
}

/** One of the browser's animations, of which the component reads only when it is finished. */
class RunningAnimation extends EventTarget implements Animation {
  readonly finished: Promise<Animation>;
  readonly ready: Promise<Animation> = Promise.resolve(this);
  currentTime: CSSNumberish | null = null;
  effect: AnimationEffect | null = null;
  id = '';
  oncancel = null;
  onfinish = null;
  onremove = null;
  readonly overallProgress = null;
  readonly pending = false;
  readonly playState = 'running';
  playbackRate = 1;
  readonly replaceState = 'active';
  startTime: CSSNumberish | null = null;
  timeline: AnimationTimeline | null = null;

  constructor(ends: Promise<void>) {
    super();
    this.finished = ends.then(() => this);
    this.finished.catch(() => undefined);
  }

  cancel(): void {}
  commitStyles(): void {}
  finish(): void {}
  pause(): void {}
  persist(): void {}
  play(): void {}
  reverse(): void {}
  updatePlaybackRate(): void {}
}

describe('StepStack', () => {
  let fixture: ComponentFixture<Host>;

  let motion: Motion;

  beforeEach(async () => {
    motion = new Motion(() => fixture.whenStable());
    Element.prototype.getAnimations = function (): Animation[] {
      return motion.animations();
    };
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => {
    // jsdom has none: the component must also work without it.
    delete (Element.prototype as Partial<Element>).getAnimations;
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function goTo(step: number): Promise<void> {
    fixture.componentInstance.current.set(step);
    await fixture.whenStable();
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('button.tab'));
  }

  /** Every step on screen, in order: tabs, the current card and the steps fading out after it. */
  function steps(): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('section.step'));
  }

  function cards(): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('.card'));
  }

  async function press(tab: HTMLButtonElement | undefined): Promise<void> {
    tab?.click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(stackStyles)).toEqual([]);
  });

  it('shows the current step, labelled, and nothing of the steps after it', () => {
    const card = element().querySelector('.card');

    expect(card?.textContent).toContain('paso 1');
    expect(card?.textContent).toContain('Your name');
    expect(element().textContent).not.toContain('Your days');
    expect(element().textContent).not.toContain('paso 2');
    expect(tabs()).toEqual([]);
  });

  it('brings in a new card for each step, so every step change plays the entering motion', async () => {
    const first = element().querySelector('.card');

    await goTo(2);

    expect(element().querySelector('.card')).not.toBe(first);
  });

  it('leaves the focus where it is on the first step', () => {
    expect(document.activeElement).not.toBe(element().querySelector('.card'));
  });

  it('moves the focus to the new step, named by its label, when the step changes', async () => {
    await goTo(3);
    const card = element().querySelector<HTMLElement>('.card');

    expect(document.activeElement).toBe(card);
    expect(card?.getAttribute('aria-label')).toBe('paso 3');

    await goTo(2);

    expect(document.activeElement).toBe(element().querySelector('.card'));
  });

  it('folds the steps before the current one into tabs that show only their label', async () => {
    await goTo(3);

    expect(tabs().map((tab) => tab.textContent.trim())).toEqual(['paso 1', 'paso 2']);
    expect(steps().map((step) => step.classList.contains('folded'))).toEqual([true, true, false]);
    expect(element().textContent).not.toContain('Your name');
    expect(element().querySelector('.card')?.textContent).toContain('Your times');
  });

  it('lets a page leave out `locked`: the tabs can be pressed', async () => {
    const bare = TestBed.createComponent(BareHost);
    await bare.whenStable();
    bare.componentInstance.current.set(2);
    await bare.whenStable();

    expect(
      (bare.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.tab')?.disabled,
    ).toBe(false);
  });

  it('goes back to a step when its tab is pressed', async () => {
    await goTo(3);

    tabs()[0]?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.current()).toBe(1);
    expect(element().querySelector('.card')?.textContent).toContain('Your name');
  });

  it('keeps the current step while locked: its tabs cannot be pressed', async () => {
    await goTo(3);
    fixture.componentInstance.locked.set(true);
    await fixture.whenStable();

    expect(tabs().map((tab) => tab.disabled)).toEqual([true, true]);
    tabs()[0]?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.current()).toBe(3);
  });

  it('shrinks each tab a little more the further back it is', async () => {
    await goTo(3);

    expect(steps().map((step) => step.style.getPropertyValue('--tab-depth'))).toEqual([
      '2',
      '1',
      '0',
    ]);
  });

  it('settles at once when nothing moves (reduced motion, or no animations at all)', async () => {
    delete (Element.prototype as Partial<Element>).getAnimations;
    await goTo(2);
    await goTo(3);
    await press(tabs()[0]);

    expect(steps()).toHaveLength(1);
    expect(element().textContent).not.toContain('Your days');
  });

  describe('while the step changes', () => {
    it('folds the step it leaves forward into its tab, its content showing until the fold ends', async () => {
      motion.start();
      await goTo(2);

      expect(tabs().map((tab) => tab.textContent.trim())).toEqual(['paso 1']);
      expect(steps()[0]?.textContent).toContain('Your name');
      expect(cards()).toEqual([steps()[1]]);
      expect(steps()[0]?.querySelector('.body')?.hasAttribute('inert')).toBe(true);

      await motion.end();

      expect(element().textContent).not.toContain('Your name');
    });

    it('fades out the steps after the one it goes back to, and removes them once they are gone', async () => {
      await goTo(3);
      motion.start();
      await press(tabs()[0]);

      expect(cards()).toEqual([steps()[0]]);
      expect(
        steps()
          .slice(1)
          .map((step) => step.classList.contains('leaving')),
      ).toEqual([true, true]);
      expect(
        steps()
          .slice(1)
          .map((step) => step.hasAttribute('inert')),
      ).toEqual([true, true]);
      // The card it leaves keeps its content while it fades; the tab before it had none.
      expect(steps()[2]?.textContent).toContain('Your times');
      expect(element().textContent).not.toContain('Your days');

      await motion.end();

      expect(steps()).toHaveLength(1);
      expect(element().textContent).not.toContain('Your times');
    });

    it('fades out each step in the shape it had: a tab stays a tab, the card stays a card', async () => {
      await goTo(3);
      motion.start();
      await press(tabs()[0]);

      expect(steps().map((step) => step.classList.contains('folded'))).toEqual([
        false,
        true,
        false,
      ]);
    });

    it('grows the tab pressed back into the card: the same element, returning', async () => {
      await goTo(2);
      const first = steps()[0];
      motion.start();
      await press(tabs()[0]);

      expect(cards()).toEqual([first]);
      expect(first?.classList.contains('returning')).toBe(true);
      expect(first?.textContent).toContain('Your name');

      await motion.end();

      expect(first?.classList.contains('returning')).toBe(false);
      expect(steps()).toEqual([first]);
    });

    it('takes a new step change from where the running one is: no step is replaced and one card shows', async () => {
      await goTo(2);
      const [first, second] = steps();
      motion.start();
      await goTo(3);
      // Halfway through 2 → 3, back to step 1.
      await press(tabs()[0]);

      expect(steps().slice(0, 2)).toEqual([first, second]);
      expect(cards()).toEqual([first]);
      expect(second?.classList.contains('leaving')).toBe(true);
      // Step 2 was the card when it started folding: it keeps its content until it is gone.
      expect(second?.textContent).toContain('Your days');

      await motion.end();

      expect(steps()).toEqual([first]);
    });

    it('turns a step that is fading out back into the card when it is asked for again', async () => {
      await goTo(2);
      const second = steps()[1];
      motion.start();
      await press(tabs()[0]);
      await goTo(2);

      expect(cards()).toEqual([second]);
      expect(second?.classList.contains('leaving')).toBe(false);
      expect(second?.classList.contains('returning')).toBe(true);
      expect(second?.hasAttribute('inert')).toBe(false);
    });

    it('jumps forward several steps at once: a step jumped over shows only its tab', async () => {
      motion.start();
      await goTo(3);

      expect(tabs().map((tab) => tab.textContent.trim())).toEqual(['paso 1', 'paso 2']);
      expect(element().textContent).not.toContain('Your days');
      expect(cards()[0]?.textContent).toContain('Your times');
    });

    it('settles a motion that is cut short', async () => {
      motion.start();
      await goTo(2);

      await motion.cutShort();

      expect(element().textContent).not.toContain('Your name');
    });

    it('moves the focus to the card the tab grows back into', async () => {
      await goTo(2);
      motion.start();
      await press(tabs()[0]);

      expect(document.activeElement).toBe(cards()[0]);
      expect(cards()[0]?.getAttribute('aria-label')).toBe('paso 1');
    });
  });

  it("colours the label's dot with the step's accent, slate by default", async () => {
    expect(
      element().querySelector<HTMLElement>('.step-label')?.style.getPropertyValue('--step-accent'),
    ).toBe('var(--q-accent-slate)');

    await goTo(2);

    expect(
      element().querySelector<HTMLElement>('.step-label')?.style.getPropertyValue('--step-accent'),
    ).toBe('var(--q-accent-amber)');
  });
});
