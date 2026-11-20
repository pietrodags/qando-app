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
    TestBed.configureTestingModule({
      imports: [CreateDone],
      providers: [provideI18n(), provideRouter([{ path: '**', component: Blank }])],
    });
    fixture = TestBed.createComponent(CreateDone);
    fixture.componentRef.setInput('event', {
      participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
      deadline: '2026-11-27',
    });
    again = 0;
    fixture.componentInstance.again.subscribe(() => again++);
    await fixture.whenStable();
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

  it('says when the results come, the deadline in words', () => {
    expect(text('.results')).toBe(
      'Recibirás los resultados en tu email el viernes, 27 de noviembre.',
    );
    expect(text('.results strong')).toBe('viernes, 27 de noviembre');
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
