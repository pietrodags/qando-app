import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Switch } from './switch';
import switchStyles from './switch.scss' with { loader: 'text' };

@Component({
  imports: [Switch],
  template: `<app-switch [(on)]="on">Horario</app-switch>`,
})
class Host {
  readonly on = signal(false);
}

@Component({
  imports: [Switch],
  template: `<app-switch label="Generar fechas con IA" [(on)]="on"><svg /></app-switch>`,
})
class DrawnHost {
  readonly on = signal(false);
}

describe('Switch', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  function box(): HTMLInputElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!found) throw new Error('No switch');
    return found;
  }

  async function press(): Promise<void> {
    box().click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(switchStyles)).toEqual([]);
  });

  it('is a switch named by the text it is given, off until it is turned on', () => {
    expect(box().getAttribute('role')).toBe('switch');
    expect(box().labels?.[0]?.textContent.trim()).toBe('Horario');
    expect(box().checked).toBe(false);
  });

  it('is turned on by a press and off by the next one, and says so each time', async () => {
    await press();
    expect(box().checked).toBe(true);
    expect(fixture.componentInstance.on()).toBe(true);

    await press();
    expect(box().checked).toBe(false);
    expect(fixture.componentInstance.on()).toBe(false);
  });

  it('shows what it is told', async () => {
    fixture.componentInstance.on.set(true);
    await fixture.whenStable();

    expect(box().checked).toBe(true);
  });

  it('has no name other than its text unless it is given one in words', () => {
    expect(box().hasAttribute('aria-label')).toBe(false);
  });

  it('is named in words when its name is a drawing', async () => {
    const drawn = TestBed.createComponent(DrawnHost);
    await drawn.whenStable();
    const named = (drawn.nativeElement as HTMLElement).querySelector('input');

    expect(named?.getAttribute('role')).toBe('switch');
    expect(named?.getAttribute('aria-label')).toBe('Generar fechas con IA');
  });
});
