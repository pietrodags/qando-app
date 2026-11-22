import type { Option } from '@qando/contracts';
import { resultsOf, type OptionTally, type ResultsOutcome, type VoteState } from '@qando/domain';
import { longOptionLabel, shortOptionLabel, zoneCity } from './date-labels.js';
import type { EmailContent } from './email.js';
import {
  lineText,
  renderEmail,
  type EmailBlock,
  type Line,
  type TallyBar,
} from './render-email.js';

/** What "Votación cerrada" says about an event, read when it is sent. */
export interface VotingClosedEmailData {
  /** The organizer's name, as the event keeps it. */
  readonly organizerName: string;
  readonly title: string;
  readonly timeZone: string;
  /** In the event's order. */
  readonly options: readonly Option[];
  /** Each voter's answers, by option ID. */
  readonly votes: readonly Readonly<Record<string, VoteState>>[];
  /** The event's public id, in the address of its management page. */
  readonly participationId: string;
  /** The id in the address of its results page. */
  readonly resultsId: string;
  /** qando's public address (`https://qando.app`). */
  readonly siteUrl: string;
}

/** The results page's sentence for a tie, by how many options tie. */
const tieSentences = {
  two: 'Hay un empate entre dos opciones:',
  three: 'Hay un empate entre tres opciones:',
  several: '¡Vaya! Parece que no nos decidimos. Hay un empate entre varias opciones.',
  all: '¡Vaya! Parece que no nos decidimos. Hay un empate entre todas las opciones.',
} as const satisfies Partial<Record<ResultsOutcome, string>>;

const legend = { preferred: 'Preferida', available: 'Disponible', unavailable: 'No puede' };

/**
 * The email an organizer receives when voting closes (owner, 2026-11-21): how many voted, the
 * results page's sentence for the outcome with the most voted dates in full (up to three), the
 * final count as the page's bars and the button to confirm a date. With no date anyone can
 * attend (nobody voted, or nobody can come), no bars, as on the page: it offers to extend the
 * deadline or confirm a date anyway on the management page (owner, 2026-11-22). The results are those of `votes`, computed as
 * the results page computes them; dates are never called chosen, as none is confirmed yet.
 */
export function votingClosedEmail({
  organizerName,
  title,
  timeZone,
  options,
  votes,
  participationId,
  resultsId,
  siteUrl,
}: VotingClosedEmailData): EmailContent {
  const results = resultsOf(
    options.map(({ id }) => id),
    votes,
  );
  const byId = new Map(options.map((option) => [option.id, option]));
  const optionOf = ({ optionId }: OptionTally): Option => {
    const option = byId.get(optionId);
    // The tallies are of the event's own options, so each one is found.
    if (!option) throw new Error('A tally of an option the event does not have');
    return option;
  };
  const manageUrl = new URL(`/manage/${participationId}`, siteUrl).href;
  const { outcome, voters } = results;

  const closed: Line = ['Se ha cerrado la votación de ', { strong: title }];
  const counted: Line = [
    ...closed,
    voters === 1 ? '. Ha votado ' : '. Han votado ',
    { strong: voters === 1 ? '1 persona' : `${String(voters)} personas` },
    '.',
  ];
  const parts = { subject: `Votación cerrada: ${title}`, name: organizerName, siteUrl, footer };

  if (outcome === 'no-votes' || outcome === 'nobody-can-attend') {
    // Nobody voted, or the group voted and nobody can attend: no date to confirm or draw.
    const nobodyCan = 'Nadie puede asistir en ninguna de las fechas propuestas.';
    const nobody: { preview: string; said: EmailBlock[]; extend: string } =
      outcome === 'no-votes'
        ? {
            preview: 'Nadie ha votado.',
            said: [
              { kind: 'paragraph', text: [...closed, ' y ', { strong: 'nadie ha votado' }, '.'] },
            ],
            extend: 'ampliar el plazo para que el grupo vote',
          }
        : {
            preview: nobodyCan,
            said: [
              { kind: 'paragraph', text: counted },
              { kind: 'paragraph', text: [nobodyCan] },
            ],
            extend: 'ampliar el plazo',
          };
    return renderEmail({
      ...parts,
      preview: nobody.preview,
      blocks: [
        ...nobody.said,
        {
          kind: 'paragraph',
          text: [
            `Desde la gestión del evento puedes ${nobody.extend} o confirmar una fecha igualmente.`,
          ],
        },
        { kind: 'button', label: 'Gestionar evento', url: manageUrl },
      ],
    });
  }

  const winners = results.winners.map(optionOf);
  const { sentence, preview } = outcomeSentence(outcome, winners);
  const bar = (tally: OptionTally): TallyBar => ({
    label: shortOptionLabel(optionOf(tally)),
    preferred: tally.preferred,
    available: tally.available,
    unavailable: tally.unavailable,
  });
  const { alternatives } = results;
  const timed = winners.some(({ time }) => time !== null);

  const blocks: EmailBlock[] = [
    { kind: 'paragraph', text: counted },
    ...(results.winnersListed
      ? ([
          { kind: 'lead', text: [sentence] },
          {
            kind: 'dates',
            dates: winners.map(longOptionLabel),
            ...(timed && { caption: `Hora de ${zoneCity(timeZone)}` }),
          },
        ] as const)
      : ([{ kind: 'paragraph', text: [sentence] }] as const)),
    { kind: 'lead', text: ['Este es el cómputo final de la votación:'] },
    {
      kind: 'tally',
      legend,
      bars: results.winners.map(bar),
      ...(alternatives.length > 0 && {
        more: {
          heading: alternatives.length === 1 ? 'Fecha alternativa:' : 'Fechas alternativas:',
          bars: alternatives.map(bar),
        },
      }),
    },
    {
      kind: 'lead',
      text: ['Elige la fecha final: al confirmarla, todos verán la fecha elegida.'],
    },
    { kind: 'button', label: 'Confirmar fecha', url: manageUrl },
    {
      kind: 'textLink',
      label: 'Ver los resultados completos',
      url: new URL(`/results/${resultsId}`, siteUrl).href,
    },
  ];

  return renderEmail({ ...parts, preview, blocks });
}

/**
 * The results page's sentence over the winners, and the preview that says the result: one
 * winner is named in it ("La fecha más votada es el sábado 11 de julio, a las 21:00."), a range
 * of days in the plural, as the page does.
 */
function outcomeSentence(
  outcome: keyof typeof tieSentences | 'one',
  winners: readonly Option[],
): { readonly sentence: string; readonly preview: string } {
  if (outcome !== 'one') {
    const sentence = tieSentences[outcome];
    // A sentence before a list ends with its only colon.
    return { sentence, preview: sentence.replace(':', '.') };
  }
  // The one winner's.
  const label = lineText(winners.flatMap(longOptionLabel));
  return winners.some(({ dates }) => dates.kind === 'range')
    ? { sentence: 'Las fechas más votadas son:', preview: `Las fechas más votadas son ${label}.` }
    : { sentence: 'La fecha más votada es:', preview: `La fecha más votada es el ${label}.` };
}

const footer: Line = [
  'Recibes este correo porque has creado este evento en ',
  { strong: 'qando' },
  '.',
];
