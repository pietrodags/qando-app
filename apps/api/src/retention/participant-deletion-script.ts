// What `npm run db:delete-participant` reads and says (`src/delete-participant.ts` runs it): the
// links as a participant pastes them into an email, and an answer for each outcome.
import type { IdentifiedVote, ParticipantDeletion, VoterRequest } from './participant-deletion.js';

/** The script's arguments read: the request and whether to delete, or what is wrong with them. */
export type ScriptArguments =
  { readonly request: VoterRequest; readonly confirmed: boolean } | { readonly problem: string };

export const usage = [
  'Usage: npm run db:delete-participant --workspace @qando/api -- <link> [name] [--yes]',
  "  <link>  the voter's edit link (…/vote/<id>/my-vote#t=<token>),",
  "          or the event's link (…/vote/<id>) followed by the voter's name",
  '  --yes   deletes the vote; without it, only says what would be deleted',
].join('\n');

/**
 * Reads a link, then the voter's name, its words in as many arguments as the shell split them
 * into, and `--yes` anywhere. A link is read on any host and without its scheme; a name given
 * after an edit link is not needed and is left out.
 */
export function readScriptArguments(args: readonly string[]): ScriptArguments {
  const options = args.filter((arg) => arg.startsWith('--'));
  const unknown = options.find((option) => option !== '--yes');
  if (unknown !== undefined)
    return { problem: `Unknown option "${unknown}": the only one is --yes.` };
  const [link, ...words] = args.filter((arg) => !arg.startsWith('--'));
  if (link === undefined) {
    return { problem: "Give the voter's edit link, or the event's link and the voter's name." };
  }
  const read = readLink(link);
  if (read === null) {
    return {
      problem:
        `"${link}" is not an event's link to vote (…/vote/<id>) ` +
        "nor a voter's edit link (…/vote/<id>/my-vote#t=<token>).",
    };
  }
  const confirmed = options.length > 0;
  if (read.token !== undefined) {
    return read.token === ''
      ? {
          problem:
            'The edit link has no token, which follows "#t=" at its end: check it was copied whole.',
        }
      : { request: { publicId: read.publicId, token: read.token }, confirmed };
  }
  const name = words.join(' ').trim();
  if (name === '') {
    return { problem: "Without the voter's edit link, give their name after the event's link." };
  }
  return { request: { publicId: read.publicId, name }, confirmed };
}

/** The event's ID of a link to vote, and the token of an edit link (empty when it lacks one). */
function readLink(link: string): { publicId: string; token?: string } | null {
  const url = URL.parse(link) ?? URL.parse(`https://${link}`);
  if (url === null) return null;
  const path = /^\/vote\/([^/]+)(\/my-vote)?\/?$/.exec(url.pathname);
  if (!path?.[1]) return null;
  const publicId = path[1];
  if (path[2] === undefined) return { publicId };
  return { publicId, token: new URLSearchParams(url.hash.slice(1)).get('t') ?? '' };
}

/** What the script says of a request's outcome. */
export function describeDeletion(request: VoterRequest, deletion: ParticipantDeletion): string {
  switch (deletion.outcome) {
    case 'no event':
      return (
        'No event has this link: it was deleted (6 months after its date, or with its ' +
        "organizer's account) or never existed, and nothing of it is kept. Nothing to delete."
      );
    case 'cancelled':
      return `"${deletion.title}" was cancelled: its votes were deleted with it. Nothing to delete.`;
    case 'anonymous':
      return (
        `"${deletion.title}" is anonymous: its votes have no name, and only the voter's edit ` +
        'link identifies theirs. Nothing deleted.'
      );
    case 'no vote':
      return 'name' in request
        ? `No vote of "${deletion.title}" is named "${request.name}". Nothing deleted.`
        : `The edit link holds no vote of "${deletion.title}": it was deleted already, ` +
            'or the link is not complete. Nothing deleted.';
    case 'several':
      return (
        `${deletion.count} votes of "${deletion.title}" have that name: ` +
        'nothing deleted. Ask the voter for their edit link.'
      );
    case 'found':
      return (
        `The vote of ${voterOf(deletion.vote)} in "${deletion.title}", cast on ` +
        `${moment(deletion.vote.castAt)}. Nothing deleted yet: run again with --yes to delete it.`
      );
    case 'deleted':
      return `Deleted the vote of ${voterOf(deletion.vote)} in "${deletion.title}", with its answers.`;
  }
}

function voterOf(vote: IdentifiedVote): string {
  return vote.name === null ? 'an anonymous voter' : `"${vote.name}"`;
}

/** `2026-07-01 at 10:22 UTC`. */
function moment(instant: Date): string {
  const iso = instant.toISOString();
  return `${iso.slice(0, 10)} at ${iso.slice(11, 16)} UTC`;
}
