import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import type { Answers } from './answers';
import { VoteConfirm } from './vote-confirm';
import confirmStyles from './vote-confirm.scss' with { loader: 'text' };

const withPreferred: Answers = { a: 'available', b: 'preferred', c: 'unavailable' };

describe('VoteConfirm', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [VoteConfirm], providers: [provideI18n()] });
  });

  async function render(
    inputs: Partial<{ answers: Answers; sending: boolean; failed: boolean }> = {},
  ): Promise<ComponentFixture<VoteConfirm>> {
    const fixture = TestBed.createComponent(VoteConfirm);
    fixture.componentRef.setInput('answers', inputs.answers ?? withPreferred);
    fixture.componentRef.setInput('deadline', '2026-07-01');
    fixture.componentRef.setInput('sending', inputs.sending ?? false);
    fixture.componentRef.setInput('failed', inputs.failed ?? false);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteConfirm>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function lines(fixture: ComponentFixture<VoteConfirm>): string[] {
    return Array.from(element(fixture).querySelectorAll('.bubble p'), (line) =>
      line.textContent.trim(),
    );
  }

  function button(fixture: ComponentFixture<VoteConfirm>, name: string): HTMLButtonElement {
    const found = element(fixture).querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (found === null) throw new Error(`No button "${name}"`);
    return found;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(confirmStyles)).toEqual([]);
  });

  it('asks whether all is ready and says until when the vote can be changed', async () => {
    const fixture = await render({ answers: withPreferred });

    expect(lines(fixture)).toEqual([
      '¿Todo listo?',
      'Si quieres revisar, vuelve atrás.',
      'Si confirmas, el organizador verá tu voto. Podrás cambiarlo hasta el 1 de julio de 2026.',
    ]);
    expect(element(fixture).querySelector('.bubble strong')?.textContent).toBe('atrás');
  });

  it('points out that no day is preferred when some are available', async () => {
    const fixture = await render({ answers: { a: 'unavailable', b: 'available' } });

    expect(lines(fixture).slice(0, 2)).toEqual([
      '¿Todo listo?',
      'No has elegido ningún día preferido. Si quieres elegirlo, vuelve atrás.',
    ]);
  });

  it('says no day suits when every one is unavailable', async () => {
    const fixture = await render({ answers: { a: 'unavailable', b: 'unavailable' } });

    expect(lines(fixture).slice(0, 2)).toEqual([
      'No puedes ningún día.',
      'Si quieres revisar, vuelve atrás.',
    ]);
  });

  it('is a dialog named by its question and described by the rest', async () => {
    const fixture = await render();

    const dialog = element(fixture).querySelector('[role="alertdialog"]');
    const labelledBy = dialog?.getAttribute('aria-labelledby') ?? '';
    expect(element(fixture).querySelector(`#${labelledBy}`)?.textContent.trim()).toBe(
      '¿Todo listo?',
    );
    expect(dialog?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('sends with the check and goes back with the arrow or Escape', async () => {
    const fixture = await render();
    const sent = vi.fn();
    const back = vi.fn();
    fixture.componentInstance.send.subscribe(sent);
    fixture.componentInstance.back.subscribe(back);

    button(fixture, 'Confirmar mi voto').click();
    button(fixture, 'Volver atrás').click();
    element(fixture)
      .querySelector('[role="alertdialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(sent).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('puts the focus on the check when it opens', async () => {
    const fixture = await render();
    TestBed.tick();

    expect(document.activeElement).toBe(button(fixture, 'Confirmar mi voto'));
  });

  it('gives the focus back to what opened it when it closes', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const fixture = await render();
    TestBed.tick();

    fixture.destroy();
    await Promise.resolve();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('cannot send again while the vote is on its way', async () => {
    const fixture = await render({ sending: true });

    expect(button(fixture, 'Confirmar mi voto').disabled).toBe(true);
  });

  it('says the vote could not be sent, inside the bubble, and lets the voter try again', async () => {
    const fixture = await render({ failed: true });

    const error = element(fixture).querySelector('.bubble [role="alert"]');
    expect(error?.textContent.trim()).toBe('No se ha podido enviar tu voto. Inténtalo de nuevo.');
    expect(button(fixture, 'Confirmar mi voto').disabled).toBe(false);
  });
});
