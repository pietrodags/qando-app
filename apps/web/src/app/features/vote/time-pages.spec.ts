import type { Option } from '@qando/contracts';
import { allAvailable } from './answers';
import { timePages } from './time-pages';

let nextId = 0;

function at(date: string, time: string): Option {
  nextId += 1;
  return {
    id: `at-${String(nextId)}`,
    dates: { kind: 'single', date },
    time: { kind: 'single', at: time },
  };
}

function between(date: string, start: string, end: string): Option {
  nextId += 1;
  return {
    id: `between-${String(nextId)}`,
    dates: { kind: 'single', date },
    time: { kind: 'range', start, end },
  };
}

function wholeDay(date: string): Option {
  nextId += 1;
  return { id: `day-${String(nextId)}`, dates: { kind: 'single', date }, time: null };
}

function range(start: string, end: string): Option {
  nextId += 1;
  return { id: `range-${String(nextId)}`, dates: { kind: 'range', start, end }, time: null };
}

function ids(options: readonly Option[]): string[] {
  return options.map(({ id }) => id);
}

describe('timePages', () => {
  it('puts the options of each day in one column, in order, as the organizer chose them', () => {
    const nine = at('2026-07-06', '09:00');
    const evening = between('2026-07-06', '18:00', '20:00');
    const seventh = wholeDay('2026-07-07');
    const options = [nine, evening, seventh];

    const [page] = timePages(options, allAvailable(ids(options)), 4);

    expect(page?.columns).toEqual([
      {
        dates: { kind: 'single', date: '2026-07-06' },
        blocks: [
          { optionId: nine.id, time: { kind: 'single', at: '09:00' } },
          { optionId: evening.id, time: { kind: 'range', start: '18:00', end: '20:00' } },
        ],
      },
      {
        dates: { kind: 'single', date: '2026-07-07' },
        blocks: [{ optionId: seventh.id, time: null }],
      },
    ]);
  });

  it('gives a range of days a column of its own', () => {
    const weekend = range('2026-07-11', '2026-07-12');

    const [page] = timePages([weekend], allAvailable([weekend.id]), 4);

    expect(page?.columns).toEqual([
      { dates: weekend.dates, blocks: [{ optionId: weekend.id, time: null }] },
    ]);
  });

  it('leaves out the days whose every option is unavailable', () => {
    const sixth = at('2026-07-06', '09:00');
    const seventhMorning = at('2026-07-07', '09:00');
    const seventhEvening = at('2026-07-07', '19:00');
    const options = [sixth, seventhMorning, seventhEvening];

    const [page] = timePages(
      options,
      {
        [sixth.id]: 'unavailable',
        [seventhMorning.id]: 'unavailable',
        [seventhEvening.id]: 'available',
      },
      4,
    );

    expect(page?.columns.map(({ dates }) => dates)).toEqual([
      { kind: 'single', date: '2026-07-07' },
    ]);
  });

  it('has no page when every day is unavailable', () => {
    const sixth = at('2026-07-06', '09:00');

    expect(timePages([sixth], { [sixth.id]: 'unavailable' }, 4)).toEqual([]);
  });

  it('splits the columns into pages of the size given', () => {
    const options = ['06', '07', '08', '09', '10'].map((day) => wholeDay(`2026-07-${day}`));

    const pages = timePages(options, allAvailable(ids(options)), 3);

    expect(pages.map(({ columns }) => columns.length)).toEqual([3, 2]);
    expect(pages[1]?.columns[0]?.dates).toEqual({ kind: 'single', date: '2026-07-09' });
  });

  it('shows the one year of the event on every page', () => {
    const options = ['06', '07', '08', '09'].map((day) => wholeDay(`2026-07-${day}`));

    const pages = timePages(options, allAvailable(ids(options)), 2);

    expect(pages.map(({ years }) => years)).toEqual([[2026], [2026]]);
  });

  it('shows the years of the page itself when the days span several years', () => {
    const options = [
      wholeDay('2026-12-30'),
      wholeDay('2026-12-31'),
      wholeDay('2027-01-01'),
      wholeDay('2027-01-02'),
    ];

    const pages = timePages(options, allAvailable(ids(options)), 2);
    const straddling = timePages(options, allAvailable(ids(options)), 3);

    expect(pages.map(({ years }) => years)).toEqual([[2026], [2027]]);
    expect(straddling.map(({ years }) => years)).toEqual([[2026, 2027], [2027]]);
  });

  it('counts the years a range of days reaches into', () => {
    const newYear = range('2026-12-31', '2027-01-01');

    expect(timePages([newYear], allAvailable([newYear.id]), 4)[0]?.years).toEqual([2026, 2027]);
  });

  it('reads only the days left in: an unavailable day of another year adds no year', () => {
    const december = wholeDay('2026-12-31');
    const january = wholeDay('2027-01-04');

    const [page] = timePages(
      [december, january],
      { [december.id]: 'available', [january.id]: 'unavailable' },
      4,
    );

    expect(page?.years).toEqual([2026]);
  });
});
