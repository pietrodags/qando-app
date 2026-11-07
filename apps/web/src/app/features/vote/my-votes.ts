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
import { sameVoterName } from '@qando/domain';
import { ApiClient, type ApiRequest } from '../../core/api/api-client';

const TOKEN_BYTES = 16;
const storageKey = (eventId: string) => `qando.voteToken.${eventId}`;
/** Set when the stored token came from a private link: the vote of whoever opened it. */
const linkKey = (eventId: string) => `qando.voteToken.${eventId}.fromLink`;

/**
 * What this browser holds for an event: its vote; none; or a private link, just opened, that
 * holds no vote of it (copied in part, or of another event). Voting stays open in every case.
 */
/** A sent vote: its private link, and whether it replaced a vote stored before this page's sends. */
export interface CastVote {
  readonly link: string;
  readonly updated: boolean;
}

export type StoredVote =
  | { readonly kind: 'voted'; readonly vote: MyVote }
  | { readonly kind: 'none' }
  /** The API could not answer (network, server, limit): there may be a vote or not. */
  | { readonly kind: 'unread' }
  | { readonly kind: 'unknownLink' };

/**
 * The votes this browser casts, each guarded by its own vote-edit token. The token is created
 * (128 random bits, base64url) and kept per event before the first send, so a retry, a double
 * click or a reload after a lost answer sends the same token and the API stores one vote. A token
 * sent before may already hold a stored vote whose answer was lost: the vote is then edited, so
 * answers changed since are not dropped. Kept in the browser's storage, shared by its tabs: a
 * Web Lock per event lets one tab at a time read or create it, so two tabs voting at once send
 * the same token. Each page keeps the token it used; where storage is blocked, only it has it.
 *
 * The private link hands its token to the browser that opens it, which then edits that vote. A
 * vote is only edited once the page showed it, or when the voter typed its name again: behind a
 * link that holds no vote of the event (copied in part, or of another event) the page shows none,
 * so the browser's own vote is edited only under its name, and any other vote is cast anew with a
 * new token.
 */
@Service()
export class MyVotes {
  private readonly api = inject(ApiClient);
  /** The token this page used for each event. */
  private readonly used = new Map<string, string>();
  /** The events whose token held a vote before this page sent any: casting updates it. */
  private readonly existing = new Set<string>();
  /**
   * The private link this page was opened from, per event: its token until the page takes it, or
   * null once it holds no vote of this event (copied in part, or of another event).
   */
  private readonly links = new Map<string, string | null>();
  /**
   * Behind an unknown link: the token this browser held (if any) and its vote's name, read but
   * not shown (undefined when unread or anonymous).
   */
  private readonly unshown = new Map<string, { token: string | null; name: string | undefined }>();

  /**
   * Takes the token of a private link opened on this page. Unless it holds no vote of the event,
   * it replaces the one this browser held, as the link just opened is the vote the voter means.
   */
  claim(eventId: string, token: string): void {
    this.links.set(eventId, voteTokenSchema.safeParse(token).success ? token : null);
  }

  /**
   * The vote this browser holds for the event, or the private link's. When the API cannot answer
   * it is unread, which the steps take as none: voting then edits the vote the token may hold, as
   * after a lost answer. The page
   * then sends that token, even if another tab stores another one: it edits the vote it shows.
   */
  async stored(eventId: string): Promise<StoredVote> {
    const link = this.links.get(eventId);
    if (link === null) return this.unknownLink(eventId);
    const token = link ?? this.used.get(eventId) ?? readStored(eventId);
    if (token === null) return { kind: 'none' };
    try {
      const vote = await this.api.send(myVoteEndpoint, {
        params: { id: eventId },
        headers: { 'x-vote-token': token },
      });
      this.take(eventId, token);
      this.existing.add(eventId);
      return { kind: 'voted', vote };
    } catch (error) {
      if (link === undefined) {
        this.take(eventId, token);
      } else if (error instanceof HttpErrorResponse && error.status === 403) {
        this.links.set(eventId, null);
        return this.unknownLink(eventId);
      }
      // An unread link stays pending: voting tries its token first.
      return error instanceof HttpErrorResponse && error.status === 403
        ? { kind: 'none' }
        : { kind: 'unread' };
    }
  }

  /** Sends the vote; answers its private link, `/vote/:id/my-vote#t=<token>`. */
  async cast(eventId: string, vote: CastVoteBody): Promise<CastVote> {
    const link = this.links.get(eventId);
    if (typeof link === 'string') {
      // A link the page could not read: its token is taken only if it holds a vote to edit.
      if (await this.edited(request(eventId, link, vote))) {
        this.take(eventId, link);
        this.existing.add(eventId);
        return { link: privateLink(eventId, link), updated: true };
      }
      this.links.set(eventId, null);
      await this.readUnshown(eventId);
    }
    const { token, sentBefore } =
      this.links.get(eventId) === null
        ? await this.afterUnknownLink(eventId, vote.name ?? '')
        : await this.tokenOf(eventId);
    const sending = request(eventId, token, vote);
    if (!sentBefore) {
      await this.api.send(castVoteEndpoint, sending);
    } else if (!(await this.edited(sending))) {
      // An earlier send with this token may still be on its way: if it is stored before this
      // cast, the cast answers with it and keeps its answers, so they are replaced once more.
      await this.api.send(castVoteEndpoint, sending);
      await this.api.send(editVoteEndpoint, sending);
    }
    return { link: privateLink(eventId, token), updated: this.existing.has(eventId) };
  }

  /** The token this page sends from now on; a private link's becomes the browser's. */
  private take(eventId: string, token: string): void {
    if (this.links.has(eventId)) {
      store(eventId, token, this.links.get(eventId) === token);
      this.links.delete(eventId);
    }
    this.used.set(eventId, token);
  }

  private async unknownLink(eventId: string): Promise<StoredVote> {
    await this.readUnshown(eventId);
    return { kind: 'unknownLink' };
  }

  /** Keeps the browser's own vote, unshown, for a voter who may type its name again. */
  private async readUnshown(eventId: string): Promise<void> {
    const token = this.used.get(eventId) ?? readStored(eventId);
    this.unshown.set(eventId, { token, name: undefined });
    if (token === null) return;
    try {
      const { name } = await this.api.send(myVoteEndpoint, {
        params: { id: eventId },
        headers: { 'x-vote-token': token },
      });
      this.unshown.set(eventId, { token, name });
    } catch {
      // Unread, it is never edited: the vote is cast anew.
    }
  }

  /**
   * The token of the first send behind an unknown link: the browser's own when the voter typed
   * its name again (none on anonymous events), a new one otherwise, which the browser takes. A
   * token another tab stored meanwhile is never taken: nothing tells whose vote it holds. Two
   * tabs voting at once behind the same link may then cast two votes (accepted: never an
   * overwrite of a vote the voter did not see).
   */
  private async afterUnknownLink(
    eventId: string,
    name: string,
  ): Promise<{ token: string; sentBefore: boolean }> {
    if (!this.unshown.has(eventId)) await this.readUnshown(eventId);
    const own = this.unshown.get(eventId);
    if (own?.token != null && own.name !== undefined && sameVoterName(own.name, name)) {
      this.links.delete(eventId);
      this.used.set(eventId, own.token);
      this.existing.add(eventId);
      return { token: own.token, sentBefore: true };
    }
    const token = newToken();
    this.take(eventId, token);
    return { token, sentBefore: false };
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
      // Another tab's token is shared, so two tabs voting at once store one vote; never one taken
      // from a private link, whose vote this page did not show.
      const stored = readStored(eventId);
      if (stored !== null && !fromLink(eventId, stored)) return { token: stored, sentBefore: true };
      const token = newToken();
      store(eventId, token);
      return { token, sentBefore: false };
    });
    this.used.set(eventId, chosen.token);
    return chosen;
  }
}

function request(eventId: string, token: string, vote: CastVoteBody) {
  return { params: { id: eventId }, headers: { 'x-vote-token': token }, body: vote };
}

function privateLink(eventId: string, token: string): string {
  return `/vote/${eventId}/my-vote#t=${token}`;
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
function store(eventId: string, token: string, linked = false): void {
  try {
    // The mark first: a token from a link is never stored without it.
    if (linked) localStorage.setItem(linkKey(eventId), token);
    else localStorage.removeItem(linkKey(eventId));
    localStorage.setItem(storageKey(eventId), token);
  } catch {
    // Nothing else to do: `used` keeps it.
  }
}

function fromLink(eventId: string, token: string): boolean {
  try {
    return localStorage.getItem(linkKey(eventId)) === token;
  } catch {
    return false;
  }
}
