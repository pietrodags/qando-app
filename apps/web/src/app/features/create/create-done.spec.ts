import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { CreateDone } from './create-done';
import doneStyles from './create-done.scss' with { loader: 'text' };

@Component({ template: '' })
class Blank {}

describe('CreateDone', () => {
  let fixture: ComponentFixture<CreateDone>;
  let again: number;

  beforeEach(async () => {
    // Friday 20 November 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    TestBed.configureTestingModule({
      imports: [CreateDone],
      providers: [provideI18n(), provideRouter([{ path: '**', component: Blank }])],
    });
    fixture = TestBed.createComponent(CreateDone);
    fixture.componentRef.setInput('event', {
      participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
      deadline: '2026-11-27',
      title: 'Cena de verano',
    });
    again = 0;
    fixture.componentInstance.again.subscribe(() => again++);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | undefined {
    return element().querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(doneStyles)).toEqual([]);
  });

  it('says it is done, the heading taking the focus', () => {
    expect(text('h2')).toBe('¡Hecho!');
    expect(document.activeElement).toBe(element().querySelector('h2'));
  });

  it('shows the link to vote, without its protocol, to share it', () => {
    expect(text('.lead')).toBe('Comparte el enlace para votar.');
    expect(text('.link')).toBe(`${location.host}/vote/uHuaiU4BzZfa7oUR2OC3QQ`);
  });

  it('shares the link to vote, inviting the group to vote on the event', () => {
    const message = `¡Vota tus preferencias para "Cena de verano"!\n\n${location.origin}/vote/uHuaiU4BzZfa7oUR2OC3QQ`;
    const channel = (name: string) =>
      element().querySelector(`app-share-links a[aria-label="${name}"]`)?.getAttribute('href');

    expect(channel('WhatsApp')).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
    expect(channel('Email')).toBe(
      `mailto:?subject=${encodeURIComponent('Cena de verano')}&body=${encodeURIComponent(message)}`,
    );
  });

  it('offers the ways to share under the link, before when the results come', () => {
    const parts = Array.from(element().querySelectorAll('.link, app-share-links, .results'));

    expect(parts.map((part) => (part.localName === 'p' ? part.className : part.localName))).toEqual(
      ['link', 'app-share-links', 'results'],
    );
  });

  it('says when the results come, the deadline in words', () => {
    expect(text('.results')).toBe(
      'Recibirás los resultados en tu email el viernes, 27 de noviembre.',
    );
    expect(text('.results strong')).toBe('viernes, 27 de noviembre');
  });

  it('says the year of a deadline in another year', async () => {
    fixture.componentRef.setInput('event', {
      participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
      deadline: '2027-01-08',
      title: 'Cena de verano',
    });
    await fixture.whenStable();

    expect(text('.results strong')).toBe('viernes, 8 de enero de 2027');
  });

  it('opens the event’s management page with "Gestionar evento"', () => {
    const manage = Array.from(element().querySelectorAll('a')).find(
      (link) => link.textContent.trim() === 'Gestionar evento',
    );

    expect(manage?.getAttribute('href')).toBe('/manage/uHuaiU4BzZfa7oUR2OC3QQ');
  });

  it('asks for another event with "Crear otro evento"', async () => {
    const button = Array.from(element().querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === 'Crear otro evento',
    );

    button?.click();
    await fixture.whenStable();

    expect(again).toBe(1);
  });
});
