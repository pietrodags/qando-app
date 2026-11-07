import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { StepStackPlayground } from './step-stack-playground';

describe('StepStackPlayground', () => {
  let fixture: ComponentFixture<StepStackPlayground>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(StepStackPlayground);
    await fixture.whenStable();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function card(): string | undefined {
    return element().querySelector('.card .step-label')?.textContent.trim();
  }

  async function press(name: string): Promise<void> {
    const button = Array.from(element().querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === name,
    );
    button?.click();
    await fixture.whenStable();
  }

  it('opens a four-step stack on its first step', () => {
    expect(card()).toBe('paso 1');
  });

  it('goes to any step, forward or back', async () => {
    await press('Ir al 4');
    expect(card()).toBe('paso 4');

    await press('Ir al 2');
    expect(card()).toBe('paso 2');
  });

  it('goes forward from inside the step, as a page does', async () => {
    await press('Siguiente');

    expect(card()).toBe('paso 2');
  });

  it('plays a burst of quick changes and ends on its last step', async () => {
    await press('Clics rápidos 2 → 3 → 1');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();

    expect(card()).toBe('paso 1');
  });

  it('slows the step motion down four times', async () => {
    document.documentElement.style.setProperty('--q-step-duration', '350ms');
    await press('Cámara lenta');

    const stage = element().querySelector<HTMLElement>('.stage');
    expect(stage?.style.getPropertyValue('--q-step-duration')).toBe('calc(350ms * 4)');

    await press('Cámara lenta');
    expect(stage?.style.getPropertyValue('--q-step-duration')).toBe('');
    document.documentElement.style.removeProperty('--q-step-duration');
  });
});
