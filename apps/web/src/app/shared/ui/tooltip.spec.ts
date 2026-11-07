import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Tooltip } from './tooltip';
import tooltipStyles from './tooltip.scss' with { loader: 'text' };

// A 300 px wide container at x = 50, its 1 px border inside; the tooltip is 100 × 30 px.
const CONTAINER = { left: 50, top: 200, width: 300, border: 1 };
const TIP = { width: 100, height: 30 };

@Component({
  imports: [Tooltip],
  template: `<div class="container">
    <button type="button" #day>6</button>
    <app-tooltip [anchor]="day">09:00 • 18:15</app-tooltip>
  </div>`,
})
class Host {}

describe('Tooltip', () => {
  let fixture: ComponentFixture<Host>;
  let tooltip: HTMLElement;
  // Where the anchor's centre is, from the page's left edge, and its top.
  const anchor = signal({ centre: 200, top: 300 });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Host);
    const root = fixture.nativeElement as HTMLElement;
    const container = root.querySelector<HTMLElement>('.container')!;
    const day = root.querySelector<HTMLElement>('button')!;
    tooltip = root.querySelector<HTMLElement>('app-tooltip')!;
    container.getBoundingClientRect = () =>
      ({ left: CONTAINER.left, top: CONTAINER.top }) as DOMRect;
    Object.defineProperty(container, 'clientWidth', { value: CONTAINER.width });
    Object.defineProperty(container, 'clientLeft', { value: CONTAINER.border });
    Object.defineProperty(container, 'clientTop', { value: CONTAINER.border });
    day.getBoundingClientRect = () => {
      const { centre, top } = anchor();
      return { left: centre - 20, width: 40, top } as DOMRect;
    };
    Object.defineProperty(tooltip, 'offsetWidth', { value: TIP.width });
    Object.defineProperty(tooltip, 'offsetHeight', { value: TIP.height });
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(tooltipStyles)).toEqual([]);
  });

  it('is a tooltip that shows what it is given', async () => {
    await render();

    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.textContent.trim()).toBe('09:00 • 18:15');
  });

  it('sits above the anchor, centred on it, with its stem on the anchor', async () => {
    anchor.set({ centre: 200, top: 300 });
    await render();

    // Inside the border: 200 − 50 − 1 = 149 from the container's left; 300 − 200 − 1 − 30 = 69.
    expect(tooltip.style.left).toBe('99px');
    expect(tooltip.style.top).toBe('69px');
    expect(tooltip.style.getPropertyValue('--stem-left')).toBe('50px');
  });

  it('stays inside the container near its left edge, the stem still on the anchor', async () => {
    anchor.set({ centre: 71, top: 300 });
    await render();

    expect(tooltip.style.left).toBe('0px');
    expect(tooltip.style.getPropertyValue('--stem-left')).toBe('20px');
  });

  it('stays inside the container near its right edge', async () => {
    anchor.set({ centre: 340, top: 300 });
    await render();

    expect(tooltip.style.left).toBe('200px');
    expect(tooltip.style.getPropertyValue('--stem-left')).toBe('89px');
  });
});
