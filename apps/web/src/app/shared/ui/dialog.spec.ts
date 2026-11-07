import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { Dialog } from './dialog';
import dialogStyles from './dialog.scss' with { loader: 'text' };

@Component({
  imports: [Dialog],
  template: `
    @if (shown()) {
      <app-dialog
        label="martes, 8 de diciembre"
        (closed)="closings = closings + 1; shown.set(false)"
      >
        <button type="button" class="inside">8:00</button>
      </app-dialog>
    }
  `,
})
class Host {
  readonly shown = signal(true);
  closings = 0;
}

describe('Dialog', () => {
  let fixture: ComponentFixture<Host>;
  let modals: number;

  // jsdom has no modal dialogs: these stand for the browser's, closing with a `close` event.
  beforeEach(async () => {
    modals = 0;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      modals += 1;
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  function dialog(): HTMLDialogElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog');
  }

  function done(): HTMLButtonElement {
    return dialog()!.querySelector<HTMLButtonElement>('button.done')!;
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(dialogStyles)).toEqual([]);
  });

  it('opens as a modal while it is in the page, named, with what it is given', () => {
    expect(modals).toBe(1);
    expect(dialog()?.hasAttribute('open')).toBe(true);
    expect(dialog()?.getAttribute('aria-label')).toBe('martes, 8 de diciembre');
    expect(dialog()?.querySelector('.inside')?.textContent).toBe('8:00');
  });

  it('closes with the round ✓ at the bottom, its only button', async () => {
    expect(done().getAttribute('aria-label')).toBe('Listo');
    expect(dialog()?.querySelectorAll('button:not(.inside)')).toHaveLength(1);

    done().click();
    await settle();

    expect(fixture.componentInstance.closings).toBe(1);
    expect(dialog()).toBeNull();
  });

  it('closes with a tap on the scrim around the card', async () => {
    dialog()!.click();
    await settle();

    expect(fixture.componentInstance.closings).toBe(1);
  });

  it('stays open with a tap inside the card', async () => {
    dialog()!.querySelector<HTMLElement>('.inside')!.click();
    await settle();

    expect(fixture.componentInstance.closings).toBe(0);
    expect(dialog()?.hasAttribute('open')).toBe(true);
  });

  it('closes when the browser closes it: Escape, or back on a phone', async () => {
    dialog()!.close();
    await settle();

    expect(fixture.componentInstance.closings).toBe(1);
    expect(dialog()).toBeNull();
  });

  it('says it closed only once, and nothing when the page removes it', async () => {
    done().click();
    await settle();
    expect(fixture.componentInstance.closings).toBe(1);

    fixture.componentInstance.shown.set(true);
    await settle();
    fixture.componentInstance.shown.set(false);
    await settle();

    expect(fixture.componentInstance.closings).toBe(1);
  });
});
