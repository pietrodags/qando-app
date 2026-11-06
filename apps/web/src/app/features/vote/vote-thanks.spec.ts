import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toast } from '../../shared/ui/toast';
import { literalValues } from '../../../styles/token-usage';
import { VoteThanks } from './vote-thanks';
import thanksStyles from './vote-thanks.scss' with { loader: 'text' };

const editLink = '/vote/k3Jd9/my-vote#t=AAAAAAAAAAAAAAAAAAAAAA';

describe('VoteThanks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [VoteThanks, Toast], providers: [provideI18n()] });
  });

  async function render(organizerName = 'ana'): Promise<ComponentFixture<VoteThanks>> {
    const fixture = TestBed.createComponent(VoteThanks);
    fixture.componentRef.setInput('organizerName', organizerName);
    fixture.componentRef.setInput('deadline', '2026-07-01');
    fixture.componentRef.setInput('editLink', editLink);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteThanks>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(fixture: ComponentFixture<VoteThanks>, selector: string): string | undefined {
    return element(fixture).querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(thanksStyles)).toEqual([]);
  });

  it('says the answer was registered and when the organizer will tell the date', async () => {
    const fixture = await render('ana');

    expect(text(fixture, 'h2')).toBe('¡Hecho!');
    expect(text(fixture, '.registered')).toBe('Tu respuesta ha sido registrada correctamente.');
    expect(text(fixture, '.organizer')).toBe(
      'Ana comunicará la fecha del evento a partir del 1 de julio de 2026.',
    );
  });

  it('shows the organizer name as text, never as markup', async () => {
    const fixture = await render('<img src=x onerror=alert(1)>');

    expect(element(fixture).querySelector('.organizer img')).toBeNull();
    expect(text(fixture, '.organizer')).toContain('<img src=x onerror=alert(1)>');
  });

  it('hides the check icon from screen readers and takes the focus to the heading', async () => {
    const fixture = await render();
    TestBed.tick();

    expect(element(fixture).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(element(fixture).querySelector('h2'));
  });

  it('tells how to change the vote and links to the private edit link', async () => {
    const fixture = await render();

    expect(text(fixture, 'h3')).toBe('¿Quieres cambiar tu voto?');
    const help = element(fixture).querySelector('.change-help');
    expect(Array.from(help?.childNodes ?? [], (node) => node.textContent)).toEqual([
      'En este navegador, abre de nuevo el enlace de la votación.',
      '',
      'Desde otro dispositivo, usa tu enlace privado:',
    ]);
    const link = element(fixture).querySelector('a');
    expect(link?.textContent.trim()).toBe('Editar mi voto');
    expect(link?.getAttribute('href')).toBe(editLink);
    expect(text(fixture, '.keep-private')).toBe(
      'Guárdalo y no lo compartas: quien lo tenga puede cambiar tu voto.',
    );
  });

  /** The app shell's toast, where the card's messages appear. */
  function toast(): () => string | undefined {
    const shell = TestBed.createComponent(Toast);
    return () => {
      shell.detectChanges();
      return (shell.nativeElement as HTMLElement).querySelector('.toast')?.textContent.trim();
    };
  }

  function stubClipboard(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }

  it('copies the full private link and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const shown = toast();
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('button.copy')?.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(`${location.origin}${editLink}`);
    expect(shown()).toBe('Enlace copiado');
  });

  it('says nothing when the browser refuses to copy', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    stubClipboard(writeText);
    const shown = toast();
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('button.copy')?.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalled();
    expect(shown()).toBeUndefined();
  });
});
