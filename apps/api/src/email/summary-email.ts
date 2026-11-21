import type { ProposedOption } from '@qando/domain';
import { dayLabel, shortOptionLabel, zoneCity } from './date-labels.js';
import type { EmailContent } from './email.js';
import { renderEmail, type EmailBlock } from './render-email.js';

/** What the summary says about an event, read when it is sent. */
export interface SummaryEmailData {
  /** The organizer's name, as the event keeps it. */
  readonly organizerName: string;
  readonly title: string;
  readonly note: string | null;
  /** In the event's order. */
  readonly options: readonly ProposedOption[];
  readonly timeZone: string;
  /** The last day to vote (`YYYY-MM-DD`), in the event's time zone. */
  readonly deadline: string;
  /** The event's public id, in the address of its participation and management pages. */
  readonly participationId: string;
  /** qando's public address (`https://qando.app`). */
  readonly siteUrl: string;
}

/** Up to this many options are listed; from one more, all but one and "+ N" for the rest. */
const mostPills = 8;

/**
 * The email an organizer receives once the event is created (owner, 2026-11-21): its options,
 * the link to share, until when the group can vote and the button to the management page. That
 * page is linked without its token, which is never stored: a browser without a session signs in
 * first, so a forwarded email never manages the event.
 */
export function summaryEmail({
  organizerName,
  title,
  note,
  options,
  timeZone,
  deadline,
  participationId,
  siteUrl,
}: SummaryEmailData): EmailContent {
  const city = zoneCity(timeZone);
  const listed = options.length > mostPills ? options.slice(0, mostPills - 1) : options;
  const quote = note?.trim();
  const pageUrl = (page: string) => new URL(`/${page}/${participationId}`, siteUrl).href;

  const blocks: EmailBlock[] = [
    { kind: 'paragraph', text: ['Aquí tienes el resumen de ', { strong: title }, '.'] },
    { kind: 'lead', text: ['Opciones propuestas para la votación:'] },
    {
      kind: 'pills',
      labels: listed.map(shortOptionLabel),
      more: options.length - listed.length,
      caption: `Hora de ${city}`,
    },
    ...(quote ? [{ kind: 'quote', text: quote } as const] : []),
    { kind: 'lead', text: ['Comparte el enlace para votar:'] },
    { kind: 'link', url: pageUrl('vote') },
    {
      kind: 'paragraph',
      text: [
        'Se puede votar hasta el ',
        { strong: dayLabel(deadline) },
        ` (hora de ${city}). Cuando se cierre la votación, te enviaremos los resultados.`,
      ],
    },
    {
      kind: 'lead',
      text: [
        'Desde la gestión del evento puedes ver cómo va la votación y confirmar la fecha final:',
      ],
    },
    { kind: 'button', label: 'Gestionar evento', url: pageUrl('manage') },
  ];

  return renderEmail({
    subject: `Resumen de tu evento: ${title}`,
    preview: 'El enlace para votar y la gestión de tu evento.',
    name: organizerName,
    blocks,
    footer: ['Recibes este correo porque has creado este evento en ', { strong: 'qando' }, '.'],
    siteUrl,
  });
}
