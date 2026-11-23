import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { NoticeBox } from './notice-box';
import noticeStyles from './notice-box.scss' with { loader: 'text' };
import type { NoticeLine } from './notice-box';

describe('NoticeBox', () => {
  let fixture: ComponentFixture<NoticeBox>;
  let closed: number;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NoticeBox], providers: [provideI18n()] });
  });

  async function render(lines: readonly NoticeLine[], tone?: 'info' | 'error'): Promise<void> {
    fixture = TestBed.createComponent(NoticeBox);
    fixture.componentRef.setInput('lines', lines);
    if (tone !== undefined) fixture.componentRef.setInput('tone', tone);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Each line as it reads, the spaces between its words as one. */
  function lines(): string[] {
    return [...host().querySelectorAll('p')].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(noticeStyles)).toEqual([]);
  });

  it('says each line under the one before, the days a line speaks of first and in bold', async () => {
    await render([
      { lead: 'vie 19 jun', text: 'hemos marcado el día.' },
      { lead: null, text: 'Hay algo que no encaja.' },
    ]);

    expect(lines()).toEqual(['vie 19 jun: hemos marcado el día.', 'Hay algo que no encaja.']);
    expect([...host().querySelectorAll('strong')].map((each) => each.textContent)).toEqual([
      'vie 19 jun:',
    ]);
  });

  it('is amber unless it is told of a phrase left unread', async () => {
    await render([{ lead: null, text: 'Hay algo que no encaja.' }]);
    expect(host().classList.contains('error')).toBe(false);

    fixture.componentRef.setInput('tone', 'error');
    await fixture.whenStable();
    expect(host().classList.contains('error')).toBe(true);

    fixture.componentRef.setInput('tone', 'info');
    await fixture.whenStable();
    expect(host().classList.contains('error')).toBe(false);
  });

  it('asks to be closed when its cross is pressed, and stays until whoever shows it takes it away', async () => {
    await render([{ lead: null, text: 'No se ha podido interpretar' }], 'error');
    const cross = host().querySelector<HTMLButtonElement>('button');

    expect(cross?.getAttribute('aria-label')).toBe('Cerrar aviso');
    expect(cross?.type).toBe('button');
    expect(closed).toBe(0);

    cross?.click();
    expect(closed).toBe(1);
    expect(lines()).toEqual(['No se ha podido interpretar']);
  });
});
