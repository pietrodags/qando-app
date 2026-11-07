import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type Ended, VoteEnded } from './vote-ended';
import endedStyles from './vote-ended.scss' with { loader: 'text' };

const id = '6f1c2a0e-0000-4000-8000-000000000001';

describe('VoteEnded', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [VoteEnded], providers: [provideI18n()] });
  });

  async function render(ended: Ended): Promise<ComponentFixture<VoteEnded>> {
    const fixture = TestBed.createComponent(VoteEnded);
    fixture.componentRef.setInput('ended', ended);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<VoteEnded>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textOf(fixture: ComponentFixture<VoteEnded>, selector: string): string | undefined {
    return element(fixture).querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(endedStyles)).toEqual([]);
  });

  describe('when voting is closed', () => {
    const closed = { kind: 'closed', title: 'Cena de verano', organizerName: 'ana' } as const;

    it('says so under the title, and that the organizer will tell the date', async () => {
      const fixture = await render({ ...closed, notice: null });

      expect(textOf(fixture, 'h1')).toBe('Cena de verano');
      expect(textOf(fixture, 'h2')).toBe('Votación cerrada');
      expect(textOf(fixture, '.message')).toBe(
        'Ya no se puede votar. Ana comunicará la fecha del evento.',
      );
      expect(element(fixture).classList).toContain('closed');
      expect(element(fixture).querySelector('.notice')).toBeNull();
    });

    it.each([
      ['voted', 'Tu voto quedó registrado.'],
      ['lateVote', 'Tu voto no ha llegado a tiempo: la votación se cerró antes de enviarlo.'],
      ['lateEdit', 'Tus cambios no han llegado a tiempo: se mantiene el voto que enviaste antes.'],
    ] as const)('adds the notice of the vote (%s), its lead-in in bold', async (notice, text) => {
      const fixture = await render({ ...closed, notice });

      expect(textOf(fixture, '.notice')).toBe(text);
      expect(element(fixture).querySelector('.notice strong')).not.toBeNull();
    });
  });

  describe('when the organizer confirmed a date', () => {
    async function confirmed(option: Omit<Option, 'id'>): Promise<ComponentFixture<VoteEnded>> {
      return render({
        kind: 'confirmed',
        title: 'Cena de verano',
        organizerName: 'ana',
        option: { id, ...option },
      });
    }

    it('shows the date with its weekday and year, and who chose it', async () => {
      const fixture = await confirmed({
        dates: { kind: 'single', date: '2026-07-10' },
        time: null,
      });

      expect(textOf(fixture, 'h2')).toBe('Fecha confirmada');
      expect(textOf(fixture, '.date')).toBe('viernes 10 de julio de 2026');
      expect(textOf(fixture, '.message')).toBe('Ana ha elegido esta fecha. Ya no se puede votar.');
      expect(element(fixture).classList).toContain('confirmed');
    });

    it('adds the time, without its leading zero', async () => {
      const fixture = await confirmed({
        dates: { kind: 'single', date: '2026-07-10' },
        time: { kind: 'single', at: '09:30' },
      });

      expect(textOf(fixture, '.date')).toBe('viernes 10 de julio de 2026, 9:30');
    });

    it('adds a range of times', async () => {
      const fixture = await confirmed({
        dates: { kind: 'single', date: '2026-07-10' },
        time: { kind: 'range', start: '20:00', end: '22:00' },
      });

      expect(textOf(fixture, '.date')).toBe('viernes 10 de julio de 2026, 20:00 a 22:00');
    });

    it('shows both ends of a range of days', async () => {
      const fixture = await confirmed({
        dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
        time: null,
      });

      expect(textOf(fixture, '.date')).toBe(
        'viernes 10 de julio de 2026 a domingo 12 de julio de 2026',
      );
    });
  });

  it('says a cancelled event was cancelled, under the title it kept', async () => {
    const fixture = await render({ kind: 'cancelled', title: 'Cena de verano' });

    expect(textOf(fixture, 'h1')).toBe('Cena de verano');
    expect(textOf(fixture, 'h2')).toBe('Evento cancelado');
    expect(textOf(fixture, '.message')).toBe(
      'Este evento ha sido cancelado. Ya no se puede votar.',
    );
    expect(element(fixture).classList).toContain('cancelled');
  });

  it('takes the focus to its heading, so a screen reader follows the change', async () => {
    const fixture = await render({ kind: 'cancelled', title: 'Cena de verano' });
    TestBed.tick();

    const heading = element(fixture).querySelector('h2');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });
});
