// The years beside the days of a step of columns (the wizard's times and summary, the voting
// page's times), as the browser draws them: what is measured of the step on screen, and where its
// years are expected to be.
import { expect, type Page } from '@playwright/test';
import { currentStep, stepsSettled as settled } from '../steps/step-card.js';

/**
 * Below this width a step of columns shows three of them, and on a phone they take the step's
 * width.
 */
export const WIDE = 650;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** What is measured of the step on screen, read in one go. */
export interface Drawn {
  readonly years: readonly { readonly text: string; readonly box: Box; readonly cut: number }[];
  /** The first and the last header on screen, and their months. */
  readonly first: Box;
  readonly firstMonth: Box;
  readonly last: Box;
  readonly lastMonth: Box;
  readonly back: Box;
  readonly forward: Box;
  readonly card: Box;
  /** The columns between the years: the window on them in the wizard. */
  readonly columns: Box;
}

export async function drawn(page: Page): Promise<Drawn> {
  await settled(page);
  return currentStep(page).evaluate((card) => {
    const boxOf = (element: Element | null | undefined): Box => {
      if (!element) throw new Error('Not drawn');
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    /** How far an element reaches out of the boxes around it that hide what overflows them. */
    const cut = (element: Element): number => {
      const box = element.getBoundingClientRect();
      let most = 0;
      for (let around = element.parentElement; around; around = around.parentElement) {
        const style = getComputedStyle(around);
        const edge = around.getBoundingClientRect();
        const left = edge.left + around.clientLeft;
        const top = edge.top + around.clientTop;
        if (style.overflowX !== 'visible') {
          most = Math.max(most, left - box.left, box.right - (left + around.clientWidth));
        }
        if (style.overflowY !== 'visible') {
          most = Math.max(most, top - box.top, box.bottom - (top + around.clientHeight));
        }
      }
      return most;
    };
    const headers = [...card.querySelectorAll('.column:not([inert]) app-column-header')];
    const arrows = card.querySelectorAll('app-step-pager button.arrow');
    return {
      years: [...card.querySelectorAll('.year')]
        .filter((year) => year.textContent.trim() !== '')
        .map((year) => ({ text: year.textContent.trim(), box: boxOf(year), cut: cut(year) })),
      first: boxOf(headers[0]),
      firstMonth: boxOf(headers[0]?.querySelector('.month')),
      last: boxOf(headers.at(-1)),
      lastMonth: boxOf(headers.at(-1)?.querySelector('.month')),
      back: boxOf(arrows[0]),
      forward: boxOf(arrows[1]),
      card: boxOf(card),
      columns: boxOf(card.querySelector('.frame > .side + *')),
    };
  });
}

export const middle = (box: Box): number => box.top + box.height / 2;
export const centre = (box: Box): number => box.left + box.width / 2;

/** The year of the first column, as wide as the card is. */
export function expectFirstYear(page: Page, { years, first, firstMonth, back, card }: Drawn): void {
  const [year] = years;
  if (!year) throw new Error('No year');
  expect(year.cut).toBe(0);
  if ((page.viewportSize()?.width ?? 0) < WIDE) {
    // Upright, reading upwards, in the card's margin beside the first day, from its month down.
    expect(year.box.height).toBeGreaterThan(year.box.width);
    expect(year.box.right).toBeLessThanOrEqual(first.left - 4);
    expect(year.box.left).toBeGreaterThanOrEqual(card.left + 4);
    expect(Math.abs(year.box.top - firstMonth.top)).toBeLessThanOrEqual(3);
  } else {
    // Lying at the back arrow's edge, its line level with the first day's month.
    expect(year.box.width).toBeGreaterThan(year.box.height);
    expect(Math.abs(year.box.left - back.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(middle(year.box) - middle(firstMonth))).toBeLessThanOrEqual(2);
    expect(year.box.right).toBeLessThanOrEqual(first.left - 8);
  }
}

/** The year the last column reaches into: the first one's mirror. */
export function expectSecondYear(page: Page, { years, last, lastMonth, forward, card }: Drawn): void {
  const year = years[1];
  if (!year) throw new Error('No second year');
  expect(year.cut).toBe(0);
  if ((page.viewportSize()?.width ?? 0) < WIDE) {
    expect(year.box.height).toBeGreaterThan(year.box.width);
    expect(year.box.left).toBeGreaterThanOrEqual(last.right + 4);
    expect(year.box.right).toBeLessThanOrEqual(card.right - 4);
    expect(Math.abs(year.box.top - lastMonth.top)).toBeLessThanOrEqual(3);
  } else {
    expect(year.box.width).toBeGreaterThan(year.box.height);
    expect(Math.abs(year.box.right - forward.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(middle(year.box) - middle(lastMonth))).toBeLessThanOrEqual(2);
    expect(year.box.left).toBeGreaterThanOrEqual(last.right + 8);
  }
}
