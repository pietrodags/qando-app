import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { StepPager } from './step-pager';
import pagerStyles from './step-pager.scss' with { loader: 'text' };

const ARROW_LEFT = 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18';
const CHEVRON_LEFT = 'M15.75 19.5 8.25 12l7.5-7.5';
const ARROW_RIGHT = 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3';
const CHEVRON_RIGHT = 'm8.25 4.5 7.5 7.5-7.5 7.5';
const CHECK = 'm4.5 12.75 6 6 9-13.5';

@Component({
  imports: [StepPager],
  template: `<app-step-pager
    [(page)]="page"
    [pages]="pages()"
    backLabel="Volver al paso 2"
    previousLabel="Días anteriores"
    nextLabel="Días siguientes"
    forwardLabel="Siguiente"
    [forwardIcon]="icon()"
    (back)="went.push('back')"
    (forward)="went.push('forward')"
  />`,
})
class Host {
  readonly page = signal(0);
  readonly pages = signal(1);
  readonly icon = signal<'arrow' | 'check'>('arrow');
  readonly went: string[] = [];
}

describe('StepPager', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
  });

  async function render(pages: number, page = 0): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.pages.set(pages);
    fixture.componentInstance.page.set(page);
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function buttons(): HTMLButtonElement[] {
    return [...host().querySelectorAll<HTMLButtonElement>('button')];
  }

  function names(): (string | null)[] {
    return buttons().map((button) => button.getAttribute('aria-label'));
  }

  function icons(): (string | null)[] {
    return buttons().map((button) => button.querySelector('path')?.getAttribute('d') ?? null);
  }

  function place(): HTMLElement | null {
    return host().querySelector<HTMLElement>('.place');
  }

  async function press(index: number): Promise<void> {
    buttons()[index]?.click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pagerStyles)).toEqual([]);
  });

  describe('with a single page', () => {
    it('shows the two arrows of the step and no place among pages', async () => {
      await render(1);

      expect(names()).toEqual(['Volver al paso 2', 'Siguiente']);
      expect(icons()).toEqual([ARROW_LEFT, ARROW_RIGHT]);
      expect(buttons().map((button) => button.type)).toEqual(['button', 'button']);
      expect(buttons().every((button) => button.querySelector('svg[aria-hidden="true"]'))).toBe(
        true,
      );
      expect(place()).toBeNull();
    });

    it('leaves the step with either arrow', async () => {
      await render(1);

      await press(0);
      await press(1);

      expect(fixture.componentInstance.went).toEqual(['back', 'forward']);
      expect(fixture.componentInstance.page()).toBe(0);
    });

    it('draws a tick on the arrow that ends the step when asked to', async () => {
      await render(1);
      fixture.componentInstance.icon.set('check');
      await fixture.whenStable();

      expect(icons()).toEqual([ARROW_LEFT, CHECK]);
    });
  });

  describe('with several pages', () => {
    it('goes on to the next page from the first one, and back out of the step', async () => {
      await render(3);

      expect(names()).toEqual(['Volver al paso 2', 'Días siguientes']);
      expect(icons()).toEqual([ARROW_LEFT, CHEVRON_RIGHT]);
      expect(place()?.textContent.trim()).toBe('1 / 3');
      expect(place()?.classList).not.toContain('last');

      await press(1);

      expect(fixture.componentInstance.page()).toBe(1);
      expect(fixture.componentInstance.went).toEqual([]);

      fixture.componentInstance.page.set(0);
      await fixture.whenStable();
      await press(0);

      expect(fixture.componentInstance.page()).toBe(0);
      expect(fixture.componentInstance.went).toEqual(['back']);
    });

    it('moves between pages from a page in the middle', async () => {
      await render(3, 1);

      expect(names()).toEqual(['Días anteriores', 'Días siguientes']);
      expect(icons()).toEqual([CHEVRON_LEFT, CHEVRON_RIGHT]);
      expect(place()?.textContent.trim()).toBe('2 / 3');
      expect(place()?.classList).not.toContain('last');

      await press(0);

      expect(fixture.componentInstance.page()).toBe(0);

      await press(1);
      await press(1);

      expect(fixture.componentInstance.page()).toBe(2);
      expect(fixture.componentInstance.went).toEqual([]);
    });

    it('goes on out of the step from the last page, marked as the last', async () => {
      await render(3, 2);

      expect(names()).toEqual(['Días anteriores', 'Siguiente']);
      expect(icons()).toEqual([CHEVRON_LEFT, ARROW_RIGHT]);
      expect(place()?.textContent.trim()).toBe('3 / 3');
      expect(place()?.classList).toContain('last');

      await press(1);

      expect(fixture.componentInstance.page()).toBe(2);
      expect(fixture.componentInstance.went).toEqual(['forward']);
    });

    it('draws the tick only on the last page', async () => {
      await render(2);
      fixture.componentInstance.icon.set('check');
      await fixture.whenStable();

      expect(icons()).toEqual([ARROW_LEFT, CHEVRON_RIGHT]);

      await press(1);

      expect(icons()).toEqual([CHEVRON_LEFT, CHECK]);
    });
  });
});
