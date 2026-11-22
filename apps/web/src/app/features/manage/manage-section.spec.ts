import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { ManageSection } from './manage-section';
import sectionStyles from './manage-section.scss' with { loader: 'text' };

/** Two sections as the page holds them: one whose holder opens it, one left to itself. */
@Component({
  imports: [ManageSection],
  template: `
    <app-manage-section heading="Enlaces" [(open)]="links">
      <p class="inside">Para votar</p>
    </app-manage-section>
    <app-manage-section heading="Emails"><p>Resumen del evento</p></app-manage-section>
  `,
})
class Host {
  readonly links = signal(false);
}

describe('ManageSection', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  function section(index: number): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      'app-manage-section',
    )[index]!;
  }

  function toggle(index: number): HTMLButtonElement {
    return section(index).querySelector<HTMLButtonElement>('h2 > button')!;
  }

  /** What the heading's button controls. */
  function body(index: number): HTMLElement {
    const id = toggle(index).getAttribute('aria-controls') ?? '';
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${id}"]`)!;
  }

  function press(index: number): void {
    toggle(index).click();
    fixture.detectChanges();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(sectionStyles)).toEqual([]);
  });

  it('heads itself with a button that names it, and starts closed', () => {
    expect(toggle(0).textContent.trim()).toBe('Enlaces');
    expect(toggle(0).type).toBe('button');
    expect(toggle(0).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(0).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(body(0).hidden).toBe(true);
    expect(body(0).textContent.trim()).toBe('Para votar');
    expect(body(1).hidden).toBe(true);
  });

  it('opens and closes when its heading is pressed, and says so', () => {
    press(1);

    expect(toggle(1).getAttribute('aria-expanded')).toBe('true');
    expect(body(1).hidden).toBe(false);
    expect(body(0).hidden).toBe(true);

    press(1);

    expect(toggle(1).getAttribute('aria-expanded')).toBe('false');
    expect(body(1).hidden).toBe(true);
  });

  it('opens when what holds it opens it, and tells it when the organizer closes it', () => {
    fixture.componentInstance.links.set(true);
    fixture.detectChanges();

    expect(toggle(0).getAttribute('aria-expanded')).toBe('true');
    expect(body(0).hidden).toBe(false);

    press(0);

    expect(fixture.componentInstance.links()).toBe(false);
    expect(body(0).hidden).toBe(true);
  });

  it('gives each section its own body', () => {
    expect(body(0)).not.toBe(body(1));
    expect(body(0).contains(section(0).querySelector('.inside'))).toBe(true);
    expect(section(0).contains(body(0))).toBe(true);
  });
});
