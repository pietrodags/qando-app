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
    <app-tooltip [anchor]="day" [placement]="placement()">09:00 • 18:15</app-tooltip>
  </div>`,
})
class Host {
  readonly placement = signal<'above' | 'below' | 'start'>('above');
}

describe('Tooltip', () => {
  let fixture: ComponentFixture<Host>;
  let tooltip: HTMLElement;
  // Where the anchor's centre is, from the page's left edge, and its top.
  const anchor = signal({ centre: 200, top: 300 });

  async function render(placement: 'above' | 'below' | 'start' = 'above'): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.placement.set(placement);
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
      return { left: centre - 20, width: 40, top, bottom: top + 40, height: 40 } as DOMRect;
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

  it('sits below the anchor when asked, its stem pointing up at it', async () => {
    anchor.set({ centre: 200, top: 300 });
    await render('below');

    // The anchor's bottom, 340, inside the border: 340 − 200 − 1 = 139.
    expect(tooltip.style.left).toBe('99px');
    expect(tooltip.style.top).toBe('139px');
    expect(tooltip.style.getPropertyValue('--stem-left')).toBe('50px');
    expect(tooltip.classList).toContain('below');
  });

  it('sits before the anchor on its line when asked, centred on its height, its stem pointing at it', async () => {
    anchor.set({ centre: 200, top: 300 });
    await render('start');

    // Its right edge on the anchor's left, 180: 180 − 100 − 50 − 1 = 29; its middle on the
    // anchor's, 320: 320 − 15 − 200 − 1 = 104.
    expect(tooltip.style.left).toBe('29px');
    expect(tooltip.style.top).toBe('104px');
    expect(tooltip.classList).toContain('start');
    expect(tooltip.classList).not.toContain('below');
  });

  it('is drawn above unless asked otherwise', async () => {
    await render();

    expect(tooltip.classList).not.toContain('below');
    expect(tooltip.classList).not.toContain('start');
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
