import { Service, inject } from '@angular/core';
import { castVoteEndpoint, type CastVoteBody } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';

const TOKEN_BYTES = 16;
const storageKey = (eventId: string) => `qando.voteToken.${eventId}`;

/**
 * The votes this browser casts, each guarded by its own vote-edit token. The token is created
 * (128 random bits, base64url) and kept per event before the first send, so a retry, a double
 * click or a reload after a lost answer sends the same token and the API stores one vote. Kept in
 * the browser's storage; where storage is blocked, only while the page is open.
 */
@Service()
export class MyVotes {
  private readonly api = inject(ApiClient);
  private readonly unsaved = new Map<string, string>();

  /** Sends the vote; answers its private link, `/vote/:id/my-vote#t=<token>`. */
  async cast(eventId: string, vote: CastVoteBody): Promise<string> {
    const token = this.tokenOf(eventId);
    await this.api.send(castVoteEndpoint, {
      params: { id: eventId },
      headers: { 'x-vote-token': token },
      body: vote,
    });
    return `/vote/${eventId}/my-vote#t=${token}`;
  }

  private tokenOf(eventId: string): string {
    const known = this.unsaved.get(eventId) ?? readStored(eventId);
    if (known !== null) return known;
    const token = newToken();
    if (!store(eventId, token)) this.unsaved.set(eventId, token);
    return token;
  }
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function readStored(eventId: string): string | null {
  try {
    return localStorage.getItem(storageKey(eventId));
  } catch {
    return null;
  }
}

/** Whether the token was stored; private windows and blocked site data refuse it. */
function store(eventId: string, token: string): boolean {
  try {
    localStorage.setItem(storageKey(eventId), token);
    return true;
  } catch {
    return false;
  }
}
