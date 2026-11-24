import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { PrivacyPage } from './privacy-page';
import pageStyles from './privacy-page.scss' with { loader: 'text' };

describe('PrivacyPage', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [PrivacyPage],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(PrivacyPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('says who offers qando and where to write about one’s data', async () => {
    const element = await render();

    expect(text(element.querySelector('h1'))).toBe('Privacidad y condiciones');
    expect(text(element.querySelector('.updated'))).toBe(
      'Última actualización: 24 de noviembre de 2026',
    );
    const intro = element.querySelector('.intro');
    expect(text(intro)).toBe(
      'qando lo ofrece Pietro D’Agostino. Para cualquier pregunta sobre tus datos, escribe a privacidad@qando.app.',
    );
    expect(intro?.querySelector('a')?.getAttribute('href')).toBe('mailto:privacidad@qando.app');
  });

  it('marks its text for the shared style of the catalogue’s links, out of reach of its own', async () => {
    const element = await render();

    expect(element.querySelector('article')?.hasAttribute('data-text-links')).toBe(true);
  });

  it('covers privacy first, then the terms, each part under its own heading', async () => {
    const element = await render();

    const headings = [...element.querySelectorAll('h2, h3')].map(
      (heading) => `${heading.tagName} ${text(heading)}`,
    );
    expect(headings).toEqual([
      'H2 Privacidad',
      'H3 Qué guarda qando',
      'H3 Para qué',
      'H3 Cuánto tiempo',
      'H3 Quién más los trata',
      'H3 Cookies',
      'H3 Ver o borrar tus datos',
      'H2 Condiciones de uso',
    ]);
  });

  it('says how long qando keeps what, as it deletes it', async () => {
    const element = await render();

    const periods = [...element.querySelectorAll('.periods li')].map(text);
    expect(periods).toEqual([
      'Un evento, con sus fechas y sus votos, se borra 6 meses después de su fecha: el último día de la fecha confirmada o, si no se confirmó ninguna, el fin del plazo para votar.',
      'Al cancelar un evento se borran al momento sus fechas y sus votos; su título, 6 meses después.',
      'Tu cuenta se borra cuando no tiene ningún evento y llevas 6 meses sin usarla.',
      'El código para entrar caduca a los 10 minutos, y la sesión, a los 90 días sin usarla.',
    ]);
  });

  it('names everyone else who handles the data, the language model and its 55 days included', async () => {
    const element = await render();

    const others = [...element.querySelectorAll('.others li strong')].map(text);
    expect(others).toEqual(['Render', 'Scaleway', 'Cloudflare', 'Google']);
    expect(text(element.querySelector('.others'))).toContain(
      'Google la conserva 55 días para detectar abusos y puede tratarla fuera de la Unión Europea.',
    );
  });

  it('tells a voter how to have their vote deleted, and where to complain', async () => {
    const element = await render();

    const rights = element.querySelector('.rights');
    expect(text(rights)).toContain(
      'escribe a privacidad@qando.app con tu enlace privado (el que te da qando al votar, para cambiar tu voto desde otro dispositivo), o bien con el enlace para votar y tu nombre tal como lo escribiste.',
    );
    const complaint = [...(rights?.querySelectorAll('a') ?? [])].at(-1);
    expect(text(complaint)).toBe('aepd.es');
    expect(complaint?.getAttribute('href')).toBe('https://www.aepd.es');
  });

  it('ends with short terms of use', async () => {
    const element = await render();

    expect([...element.querySelectorAll('.terms li')].map(text)).toEqual([
      'qando es gratis y se ofrece tal cual, sin garantías: puede tener errores, cambiar o dejar de funcionar, y un email puede no llegar.',
      'No lo uses para enviar spam, engañar o molestar a nadie, ni para nada ilegal. Los eventos o las cuentas que lo hagan se pueden borrar sin aviso.',
      'Lo que escribes en tus eventos es responsabilidad tuya.',
      'Esta página puede cambiar. La fecha de arriba dice cuándo cambió por última vez.',
    ]);
  });
});
