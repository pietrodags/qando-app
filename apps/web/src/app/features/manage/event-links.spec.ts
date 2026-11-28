import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toaster } from '../../shared/ui/toast';
import { literalValues } from '../../../styles/token-usage';
import { EventLinks } from './event-links';
import linkStyles from './event-links.scss' with { loader: 'text' };

describe('EventLinks', () => {
  let fixture: ComponentFixture<EventLinks>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [EventLinks],
      providers: [provideI18n(), provideRouter([])],
    });
    fixture = TestBed.createComponent(EventLinks);
    fixture.componentRef.setInput('participationId', 'k3Jd9aB2cD4eF6gH8iJ0kL');
    fixture.componentRef.setInput('resultsId', 'Qw7p2aB2cD4eF6gH8iJ0kL');
    fixture.componentRef.setInput('title', 'Cena de verano');
    await fixture.whenStable();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null | undefined): string | undefined {
    return node?.textContent.replace(/\s+/g, ' ').trim();
  }

  /** The link `index` of the list: its well, then the block that shares it. */
  function link(index: number): HTMLElement {
    return element().querySelectorAll<HTMLElement>('.wells > li')[index]!;
  }

  function well(index: number): HTMLElement {
    return link(index).querySelector<HTMLElement>('.well')!;
  }

  function channel(index: number, name: string): HTMLElement {
    return link(index).querySelector<HTMLElement>(`app-share-links [aria-label="${name}"]`)!;
  }

  function copying(result: Promise<void>): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(() => result);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  const vote = `${location.origin}/vote/k3Jd9aB2cD4eF6gH8iJ0kL`;
  const results = `${location.origin}/results/Qw7p2aB2cD4eF6gH8iJ0kL`;

  it('styles itself only with design tokens', () => {
    expect(literalValues(linkStyles)).toEqual([]);
  });

  it('is a section closed as the page opens, the links inside it', async () => {
    const toggle = element().querySelector<HTMLButtonElement>('app-manage-section h2 > button');
    expect(text(toggle)).toBe('Enlaces');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(link(0).closest('[hidden]')).not.toBeNull();

    toggle?.click();
    await fixture.whenStable();

    expect(link(0).closest('[hidden]')).toBeNull();
    expect(element().querySelector('.help')?.closest('[hidden]')).toBeNull();
  });

  it('shows the participation and results links without their protocol', () => {
    expect(text(element().querySelector('h2'))).toBe('Enlaces');
    expect(element().querySelectorAll('.wells > li')).toHaveLength(2);
    expect(text(well(0).querySelector('.name'))).toBe('Para votar');
    expect(text(well(0).querySelector('.url'))).toBe(
      `${location.host}/vote/k3Jd9aB2cD4eF6gH8iJ0kL`,
    );
    expect(text(well(1).querySelector('.name'))).toBe('Resultados');
    expect(text(well(1).querySelector('.url'))).toBe(
      `${location.host}/results/Qw7p2aB2cD4eF6gH8iJ0kL`,
    );
  });

  it.each([
    [0, vote, '¡Vota tus preferencias para "Cena de verano"!'],
    [1, results, 'Mira los resultados de "Cena de verano"'],
  ])('shares link %i under its well, in full, with its own words', (index, url, words) => {
    const shares = link(index).querySelector('.well + app-share-links');
    expect(shares).not.toBeNull();
    expect(channel(index, 'WhatsApp').getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(`${words}\n\n${url}`)}`,
    );
    expect(channel(index, 'Email').getAttribute('href')).toBe(
      `mailto:?subject=${encodeURIComponent('Cena de verano')}&body=${encodeURIComponent(`${words}\n\n${url}`)}`,
    );
  });

  it.each([
    [0, 'Para votar'],
    [1, 'Resultados'],
  ])(
    'names the block of link %i by the link, for a screen reader to tell them apart',
    (index, name) => {
      const shares = link(index).querySelector('app-share-links');
      expect(shares?.getAttribute('role')).toBe('group');
      expect(shares?.getAttribute('aria-label')).toBe(name);
    },
  );

  it('shares the title it is given, as it changes', async () => {
    fixture.componentRef.setInput('title', 'Excursión al lago');
    await fixture.whenStable();

    expect(channel(1, 'WhatsApp').getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Mira los resultados de "Excursión al lago"\n\n${results}`)}`,
    );
  });

  it.each([
    [0, vote],
    [1, results],
  ])('copies link %i in full from its block and says so', async (index, url) => {
    const writeText = copying(Promise.resolve());

    channel(index, 'Copiar enlace').click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(url);
    expect(TestBed.inject(Toaster).message()).toBe('Enlace copiado');
  });

  it('leaves the wells without a copy button of their own', () => {
    expect([...well(0).querySelectorAll('button'), ...well(1).querySelectorAll('button')]).toEqual(
      [],
    );
  });

  it('opens the results from their well with a bar chart named "Ver resultados"', () => {
    const open = well(1).querySelector('a');
    expect(open?.getAttribute('href')).toBe('/results/Qw7p2aB2cD4eF6gH8iJ0kL');
    expect(open?.getAttribute('aria-label')).toBe('Ver resultados');
    expect(text(open)).toBe('');
    expect(open?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect([...well(0).querySelectorAll('a')]).toEqual([]);
  });

  it('says "Ver resultados" over the bar chart while the mouse is on it, never to a finger', async () => {
    const open = well(1).querySelector('a')!;
    const tip = () => well(1).querySelector('app-tooltip');
    const pointer = (pointerType: string) => {
      const event = new MouseEvent('pointerenter', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      open.dispatchEvent(event);
    };

    pointer('touch');
    await fixture.whenStable();
    expect(tip()).toBeNull();

    pointer('mouse');
    await fixture.whenStable();
    expect(text(tip())).toBe('Ver resultados');
    expect(tip()?.getAttribute('aria-hidden')).toBe('true');
  });
});
