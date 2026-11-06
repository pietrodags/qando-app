import { HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  castVoteEndpoint,
  editVoteEndpoint,
  myVoteEndpoint,
  voteTokenSchema,
  type CastVoteBody,
  type MyVote,
} from '@qando/contracts';
import { ApiClient, type ApiRequest } from '../../core/api/api-client';

const TOKEN_BYTES = 16;
const storageKey = (eventId: string) => `qando.voteToken.${eventId}`;

/**
 * What this browser holds for an event: its vote; none; or a private link, just opened, that
 * holds no vote of it (copied in part, or of another event). Voting stays open in every case.
 */
export type StoredVote =
  | { readonly kind: 'voted'; readonly vote: MyVote }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknownLink' };

/**
 * The votes this browser casts, each guarded by its own vote-edit token. The token is created
 * (128 random bits, base64url) and kept per event before the first send, so a retry, a double
 * click or a reload after a lost answer sends the same token and the API stores one vote. A token
 * sent before may already hold a stored vote whose answer was lost: the vote is then edited, so
 * answers changed since are not dropped. Kept in the browser's storage, shared by its tabs: a
 * Web Lock per event lets one tab at a time read or create it, so two tabs voting at once send
 * the same token. Each page keeps the token it used; where storage is blocked, only it has it.
 */
@Service()
export class MyVotes {
  private readonly api = inject(ApiClient);
  /** The token this page used for each event. */
  private readonly used = new Map<string, string>();
  /** The events opened from a private link on this page, with its token when well-formed. */
  private readonly claimed = new Map<string, string | null>();

  /**
   * Takes the token of a private link opened on this page: it replaces the one this browser
   * held for the event, as the link just opened is the vote the voter means.
   */
  claim(eventId: string, token: string): void {
    if (!voteTokenSchema.safeParse(token).success) {
      this.claimed.set(eventId, null);
      return;
    }
    this.claimed.set(eventId, token);
    this.used.set(eventId, token);
    store(eventId, token);
  }

  /**
   * The vote this browser holds for the event. When the API cannot answer it is none: voting
   * then edits the vote the token may hold, as after a lost answer.
   */
  async stored(eventId: string): Promise<StoredVote> {
    const fromLink = this.claimed.has(eventId);
    if (this.claimed.get(eventId) === null) return { kind: 'unknownLink' };
    const token = this.used.get(eventId) ?? readStored(eventId);
    if (token === null) return { kind: 'none' };
    try {
      const vote = await this.api.send(myVoteEndpoint, {
        params: { id: eventId },
        headers: { 'x-vote-token': token },
      });
      return { kind: 'voted', vote };
    } catch (error) {
      const noVote = error instanceof HttpErrorResponse && error.status === 403;
      return noVote && fromLink ? { kind: 'unknownLink' } : { kind: 'none' };
    }
  }

  /** Sends the vote; answers its private link, `/vote/:id/my-vote#t=<token>`. */
  async cast(eventId: string, vote: CastVoteBody): Promise<string> {
    const { token, sentBefore } = await this.tokenOf(eventId);
    const request = { params: { id: eventId }, headers: { 'x-vote-token': token }, body: vote };
    if (!sentBefore) {
      await this.api.send(castVoteEndpoint, request);
    } else if (!(await this.edited(request))) {
      // An earlier send with this token may still be on its way: if it is stored before this
      // cast, the cast answers with it and keeps its answers, so they are replaced once more.
      await this.api.send(castVoteEndpoint, request);
      await this.api.send(editVoteEndpoint, request);
    }
    return `/vote/${eventId}/my-vote#t=${token}`;
  }

  /** Replaces the vote the token holds; false when it holds none (403), so it must be cast. */
  private async edited(request: ApiRequest<typeof editVoteEndpoint>): Promise<boolean> {
    try {
      await this.api.send(editVoteEndpoint, request);
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) return false;
      throw error;
    }
  }

  /**
   * The event's token, and whether a send may have carried it before (on this page, in another
   * tab or before a reload).
   */
  private async tokenOf(eventId: string): Promise<{ token: string; sentBefore: boolean }> {
    const used = this.used.get(eventId);
    if (used !== undefined) return { token: used, sentBefore: true };
    const chosen = await oneTabAtATime(storageKey(eventId), () => {
      const stored = readStored(eventId);
      if (stored !== null) return { token: stored, sentBefore: true };
      const token = newToken();
      store(eventId, token);
      return { token, sentBefore: false };
    });
    this.used.set(eventId, chosen.token);
    return chosen;
  }
}

/**
 * Runs `read` while no other tab of this browser runs it for `name`; at once where Web Locks are
 * missing or the browser refuses them (an isolated frame, some privacy settings). `read` never
 * throws, so a rejection always comes from the lock.
 */
async function oneTabAtATime<T>(name: string, read: () => T): Promise<T> {
  if (!('locks' in navigator)) return read();
  try {
    return await navigator.locks.request(name, read);
  } catch {
    return read();
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

/** Private windows and blocked site data refuse it: the page then keeps it alone. */
function store(eventId: string, token: string): void {
  try {
    localStorage.setItem(storageKey(eventId), token);
  } catch {
    // Nothing else to do: `used` keeps it.
  }
}
