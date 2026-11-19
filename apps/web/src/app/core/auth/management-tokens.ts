import { Service } from '@angular/core';

const KEY_PREFIX = 'qando.managementToken.';

/**
 * The management tokens this browser keeps, one per event whose management link it opened: in
 * its storage, shared by its tabs and kept after a reload. A browser that refuses its storage
 * (private windows, blocked site data) keeps them for the page alone. Signing out forgets them
 * all, so a shared computer keeps no way into anyone's events; the links stay in their emails.
 */
@Service()
export class ManagementTokens {
  /** The tokens the storage refused, kept while this page lives. */
  private readonly unstored = new Map<string, string>();

  /** Keeps the event's token, in the place of the one kept before. */
  keep(eventId: string, token: string): void {
    try {
      localStorage.setItem(KEY_PREFIX + eventId, token);
      this.unstored.delete(eventId);
    } catch {
      this.unstored.set(eventId, token);
    }
  }

  /** The event's token; `null` when this browser keeps none. */
  of(eventId: string): string | null {
    return this.unstored.get(eventId) ?? stored(eventId);
  }

  /** Forgets every token, in every tab. */
  forgetAll(): void {
    this.unstored.clear();
    for (const key of storedKeys()) {
      try {
        localStorage.removeItem(key);
      } catch {
        // The others are still removed.
      }
    }
  }
}

function stored(eventId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + eventId);
  } catch {
    return null;
  }
}

/** The storage's keys that hold a management token; none from a storage that refuses to be read. */
function storedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(KEY_PREFIX));
  } catch {
    return [];
  }
}
