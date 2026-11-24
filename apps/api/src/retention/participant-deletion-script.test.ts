import { describe, expect, it } from 'vitest';
import type { ParticipantDeletion } from './participant-deletion.js';
import { describeDeletion, readScriptArguments, usage } from './participant-deletion-script.js';

const editLink = 'https://qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/my-vote#t=Hy4mQ7vZ2xT9bLm4Np0RsA';
const eventLink = 'https://qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8';

describe('readScriptArguments', () => {
  it('reads an edit link as the vote it holds, only said unless --yes', () => {
    expect(readScriptArguments([editLink])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' },
      confirmed: false,
    });
  });

  it('confirms the deletion with --yes, wherever it is', () => {
    expect(readScriptArguments(['--yes', editLink])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' },
      confirmed: true,
    });
    expect(readScriptArguments([eventLink, 'Marta', '--yes'])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta' },
      confirmed: true,
    });
  });

  it('reads an event link and the words after it as the voter of that name', () => {
    expect(readScriptArguments([eventLink, 'Marta', 'López'])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta López' },
      confirmed: false,
    });
    expect(readScriptArguments([eventLink, ' Marta López '])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta López' },
      confirmed: false,
    });
  });

  it('takes an edit link alone, as a name given with it adds nothing', () => {
    expect(readScriptArguments([editLink, 'Marta'])).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' },
      confirmed: false,
    });
  });

  it('reads links on any host, without their scheme, and with a slash at the end', () => {
    expect(
      readScriptArguments(['http://localhost:4200/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/', 'Marta']),
    ).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta' },
      confirmed: false,
    });
    expect(
      readScriptArguments([
        'qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/my-vote#t=Hy4mQ7vZ2xT9bLm4Np0RsA',
      ]),
    ).toEqual({
      request: { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' },
      confirmed: false,
    });
  });

  it('asks for a link when none is given', () => {
    expect(readScriptArguments([])).toEqual({
      problem: "Give the voter's edit link, or the event's link and the voter's name.",
    });
    expect(readScriptArguments(['--yes'])).toEqual({
      problem: "Give the voter's edit link, or the event's link and the voter's name.",
    });
  });

  it('refuses what is not a link to vote nor an edit link', () => {
    const problem = (link: string) =>
      `"${link}" is not an event's link to vote (…/vote/<id>) nor a voter's edit link (…/vote/<id>/my-vote#t=<token>).`;

    for (const link of [
      'https://qando.app/results/k3JdQ9vZ2xT9bLm4Np0Rs8',
      'https://qando.app/vote/',
      'https://qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/other',
      'https://qando.app/en/vote/k3JdQ9vZ2xT9bLm4Np0Rs8',
      'Marta',
      'not a link',
    ]) {
      expect(readScriptArguments([link, 'Marta'])).toEqual({ problem: problem(link) });
    }
  });

  it('refuses an edit link without its token', () => {
    const problem = {
      problem:
        'The edit link has no token, which follows "#t=" at its end: check it was copied whole.',
    };

    expect(readScriptArguments(['https://qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/my-vote'])).toEqual(
      problem,
    );
    expect(
      readScriptArguments(['https://qando.app/vote/k3JdQ9vZ2xT9bLm4Np0Rs8/my-vote#t=']),
    ).toEqual(problem);
  });

  it("asks for the voter's name after an event link", () => {
    const problem = {
      problem: "Without the voter's edit link, give their name after the event's link.",
    };

    expect(readScriptArguments([eventLink])).toEqual(problem);
    expect(readScriptArguments([eventLink, ' ', '--yes'])).toEqual(problem);
  });

  it('refuses an option other than --yes', () => {
    expect(readScriptArguments([editLink, '--force'])).toEqual({
      problem: 'Unknown option "--force": the only one is --yes.',
    });
  });
});

describe('usage', () => {
  it('names the command, its arguments and what --yes does', () => {
    expect(usage).toBe(
      [
        'Usage: npm run db:delete-participant --workspace @qando/api -- <link> [name] [--yes]',
        "  <link>  the voter's edit link (…/vote/<id>/my-vote#t=<token>),",
        "          or the event's link (…/vote/<id>) followed by the voter's name",
        '  --yes   deletes the vote; without it, only says what would be deleted',
      ].join('\n'),
    );
  });
});

describe('describeDeletion', () => {
  const byLink = { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' };
  const byName = { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta' };
  const marta = { name: 'Marta', castAt: new Date('2026-07-01T10:22:51.123Z') };
  const said = (request: typeof byLink | typeof byName, deletion: ParticipantDeletion) =>
    describeDeletion(request, deletion);

  it('says the vote it found, cast when, and how to delete it', () => {
    expect(said(byName, { outcome: 'found', title: 'Cena de verano', vote: marta })).toBe(
      'The vote of "Marta" in "Cena de verano", cast on 2026-07-01 at 10:22 UTC. ' +
        'Nothing deleted yet: run again with --yes to delete it.',
    );
  });

  it('says the vote it deleted', () => {
    expect(said(byName, { outcome: 'deleted', title: 'Cena de verano', vote: marta })).toBe(
      'Deleted the vote of "Marta" in "Cena de verano", with its answers.',
    );
  });

  it('names a vote of an anonymous event as such', () => {
    const anonymous = { name: null, castAt: new Date('2026-07-02T08:05:00Z') };

    expect(said(byLink, { outcome: 'found', title: 'Café', vote: anonymous })).toBe(
      'The vote of an anonymous voter in "Café", cast on 2026-07-02 at 08:05 UTC. ' +
        'Nothing deleted yet: run again with --yes to delete it.',
    );
    expect(said(byLink, { outcome: 'deleted', title: 'Café', vote: anonymous })).toBe(
      'Deleted the vote of an anonymous voter in "Café", with its answers.',
    );
  });

  it('says why nothing is deleted when no event has the link', () => {
    expect(said(byName, { outcome: 'no event' })).toBe(
      'No event has this link: it was deleted (6 months after its date, or with its ' +
        "organizer's account) or never existed, and nothing of it is kept. Nothing to delete.",
    );
  });

  it('says a cancelled event kept no votes', () => {
    expect(said(byName, { outcome: 'cancelled', title: 'Partido de pádel' })).toBe(
      '"Partido de pádel" was cancelled: its votes were deleted with it. Nothing to delete.',
    );
  });

  it('says only the edit link identifies a vote of an anonymous event', () => {
    expect(said(byName, { outcome: 'anonymous', title: 'Café' })).toBe(
      '"Café" is anonymous: its votes have no name, and only the voter\'s edit link ' +
        'identifies theirs. Nothing deleted.',
    );
  });

  it('says no vote matched, as the request named it', () => {
    expect(said(byLink, { outcome: 'no vote', title: 'Cena de verano' })).toBe(
      'The edit link holds no vote of "Cena de verano": it was deleted already, or the link ' +
        'is not complete. Nothing deleted.',
    );
    expect(said(byName, { outcome: 'no vote', title: 'Cena de verano' })).toBe(
      'No vote of "Cena de verano" is named "Marta". Nothing deleted.',
    );
  });

  it('says how many votes share the name, and asks for the edit link', () => {
    expect(said(byName, { outcome: 'several', title: 'Cena de verano', count: 2 })).toBe(
      '2 votes of "Cena de verano" have that name: nothing deleted. ' +
        'Ask the voter for their edit link.',
    );
  });
});
