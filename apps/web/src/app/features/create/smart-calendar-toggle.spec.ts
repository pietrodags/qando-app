import { Component, signal, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { TIP_LINGER_MS } from '../../shared/ui/hover-tip';
import { SmartCalendarToggle } from './smart-calendar-toggle';

/** A page with the sparkles beside its question: it opens and closes its box when told. */
@Component({
  imports: [SmartCalendarToggle],
  template: `
    <p class="question">¿Cuándo?</p>
    <app-smart-calendar-toggle [open]="open()" (pressed)="presses = presses + 1" />
  `,
})
class Page {
  readonly open = signal(false);
  presses = 0;
  readonly toggle = viewChild.required(SmartCalendarToggle);
}

describe('SmartCalendarToggle', () => {
  let fixture: ComponentFixture<Page>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Page], providers: [provideI18n()] });
    fixture = TestBed.createComponent(Page);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function sparkles(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>(
      'button[aria-label="Generar fechas con IA"]',
    );
    if (!found) throw new Error('No sparkles');
    return found;
  }

  /** What is said over the sparkles; `null` while nothing is. */
  function tip(): string | null {
    return element().querySelector('app-tooltip')?.textContent.trim() ?? null;
  }

  /** The pointer, a mouse unless said, as the browser tells it. */
  function fire(target: Element, type: string, init: { pointerType?: string; to?: Element } = {}) {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget: init.to ?? null });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
    target.dispatchEvent(event);
  }

  it('is a button named in words, its sparkles drawn and unheard', () => {
    expect(sparkles().getAttribute('type')).toBe('button');
    expect(sparkles().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says it is pressed while the box it opens is open, and not otherwise', async () => {
    expect(sparkles().getAttribute('aria-pressed')).toBe('false');

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(sparkles().getAttribute('aria-pressed')).toBe('true');

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    expect(sparkles().getAttribute('aria-pressed')).toBe('false');
  });

  it('tells each press, and leaves opening and closing the box to the page', async () => {
    sparkles().click();
    sparkles().click();
    await fixture.whenStable();

    expect(fixture.componentInstance.presses).toBe(2);
    expect(sparkles().getAttribute('aria-pressed')).toBe('false');
  });

  it('takes the focus when the page gives it back', () => {
    fixture.componentInstance.toggle().focus();

    expect(document.activeElement).toBe(sparkles());
  });

  it('says "Generar fechas con IA" over the sparkles while the mouse is on them, until pressed', async () => {
    fire(sparkles(), 'pointerenter');
    await fixture.whenStable();
    expect(tip()).toBe('Generar fechas con IA');
    expect(element().querySelector('app-tooltip')?.getAttribute('aria-hidden')).toBe('true');

    fire(sparkles(), 'pointerout');
    await new Promise((resolve) => setTimeout(resolve, TIP_LINGER_MS));
    await fixture.whenStable();
    expect(tip()).toBeNull();

    fire(sparkles(), 'pointerenter');
    await fixture.whenStable();
    sparkles().click();
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });

  it('keeps "Generar fechas con IA" while the mouse moves onto it to read it, until Escape', async () => {
    fire(sparkles(), 'pointerenter');
    await fixture.whenStable();
    const shown = element().querySelector('app-tooltip');
    if (!shown) throw new Error('No tip over the sparkles');

    fire(sparkles(), 'pointerout', { to: shown });
    await fixture.whenStable();
    expect(tip()).toBe('Generar fechas con IA');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });

  it('says nothing over the sparkles when a finger touches them', async () => {
    fire(sparkles(), 'pointerenter', { pointerType: 'touch' });
    await fixture.whenStable();

    expect(tip()).toBeNull();
  });
});
