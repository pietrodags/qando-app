import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Step, StepStack } from './step-stack';
import stackStyles from './step-stack.scss' with { loader: 'text' };

@Component({
  imports: [Step, StepStack],
  template: `
    <app-step-stack [(current)]="current">
      <ng-template appStep="paso 1"><p>Your name</p></ng-template>
      <ng-template appStep="paso 2" accent="amber"><p>Your days</p></ng-template>
      <ng-template appStep="paso 3"><p>Your times</p></ng-template>
    </app-step-stack>
  `,
})
class Host {
  readonly current = signal(1);
}

describe('StepStack', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
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

  it('folds the steps before the current one into tabs that show only their label', async () => {
    await goTo(3);

    expect(tabs().map((tab) => tab.textContent.trim())).toEqual(['paso 1', 'paso 2']);
    expect(element().textContent).not.toContain('Your name');
    expect(element().querySelector('.card')?.textContent).toContain('Your times');
  });

  it('goes back to a step when its tab is pressed', async () => {
    await goTo(3);

    tabs()[0]?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.current()).toBe(1);
    expect(element().querySelector('.card')?.textContent).toContain('Your name');
  });

  it('shrinks each tab a little more the further back it is', async () => {
    await goTo(3);

    expect(tabs().map((tab) => tab.style.getPropertyValue('--tab-depth'))).toEqual(['2', '1']);
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
