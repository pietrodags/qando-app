// The demo events of `npm run db:seed`: one per state the voting, results and management pages
// show, dated from the day the command runs so the open ones are still open.
import type { EventSeed, SeededEvent } from './seed-event.js';

export interface DemoEvent {
  /** What the event shows, printed next to its links. */
  readonly state: string;
  readonly seed: EventSeed;
}

/** The demo events for `today`, an ISO date in Madrid. */
export function demoEvents(today: string): readonly DemoEvent[] {
  const day = (offset: number) => addDays(today, offset);
  return [
    {
      state: 'open',
      seed: {
        title: 'Cena de verano',
        note: 'En el sitio de siempre',
        deadline: day(14),
        options: [
          day(20),
          { date: day(24), startTime: '21:00' },
          { date: day(25), endDate: day(26) },
        ],
        votes: [
          { name: 'Luis', states: ['available', 'preferred', 'unavailable'] },
          { name: 'Marta', states: ['unavailable', 'available', 'preferred'] },
          { name: 'Javi', states: ['available', 'available', 'available'] },
        ],
      },
    },
    {
      state: 'open, anonymous',
      seed: {
        title: 'Regalo para Lucía',
        note: 'Para decidir cuándo quedamos a comprarlo',
        deadline: day(7),
        anonymous: true,
        options: [day(10), day(12), { date: day(13), startTime: '18:00', endTime: '20:00' }],
        votes: [
          { states: ['preferred', 'available', 'unavailable'] },
          { states: ['available', 'unavailable', 'preferred'] },
        ],
      },
    },
    {
      state: 'closed, pending confirmation',
      seed: {
        title: 'Excursión a la sierra',
        deadline: day(-1),
        options: [day(5), day(6), { date: day(12), endDate: day(13) }],
        votes: [
          { name: 'Luis', states: ['available', 'preferred', 'available'] },
          { name: 'Marta', states: ['preferred', 'available', 'unavailable'] },
          { name: 'Javi', states: ['unavailable', 'available', 'preferred'] },
          { name: 'Sara', states: ['available', 'available', 'unavailable'] },
        ],
      },
    },
    {
      state: 'confirmed',
      seed: {
        title: 'Comida de equipo',
        deadline: day(-3),
        options: [
          { date: day(8), startTime: '14:00' },
          { date: day(9), startTime: '14:00' },
        ],
        votes: [
          { name: 'Luis', states: ['available', 'preferred'] },
          { name: 'Marta', states: ['unavailable', 'preferred'] },
          { name: 'Javi', states: ['available', 'available'] },
        ],
        outcome: { confirmed: 1 },
      },
    },
    {
      state: 'cancelled',
      seed: {
        title: 'Concierto en el parque',
        deadline: day(10),
        options: [day(15)],
        outcome: 'cancelled',
      },
    },
  ];
}

/** The links a seeded event is opened with, labelled; a cancelled event keeps only two. */
export function linksOf(
  webUrl: string,
  seeded: SeededEvent,
): readonly (readonly [label: string, url: string])[] {
  const base = webUrl.replace(/\/$/, '');
  const vote = `${base}/vote/${seeded.publicId}`;
  const links: [string, string][] = [
    ['Vote', vote],
    ['Results', `${base}/results/${seeded.resultsId}`],
  ];
  if (seeded.cancelled) return links;

  links.push(['Manage', `${base}/manage/${seeded.publicId}#t=${seeded.managementToken}`]);
  seeded.votes.forEach(({ name, token }, index) => {
    const label = name === undefined ? `Edit vote ${index + 1}` : `Edit the vote of ${name}`;
    links.push([label, `${vote}/my-vote#t=${token}`]);
  });
  return links;
}

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
