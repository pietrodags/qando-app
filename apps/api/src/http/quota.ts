/** What asking the quota for one place answered. */
export type QuotaAnswer =
  | {
      readonly granted: true;
      /** Gives this place back, e.g. a code the email server refused; once. */
      release(): void;
    }
  | { readonly granted: false; readonly retryAfterSeconds: number };

/** How much one key may do: a gap between two, and at most `limit` in any minute or hour. */
export interface QuotaSettings {
  readonly gapMs: number;
  readonly limit: number;
  readonly per: 'minute' | 'hour';
}

/**
 * What a key (an email, an account, a client address) may do, as `take(key)` asks: grants one
 * place or says how long to wait.
 */
export interface Quota {
  take(key: string): QuotaAnswer;
}

const lengthMs = { minute: 60_000, hour: 60 * 60_000 };

/**
 * Limits what each key does (the codes sent to an email, the calls of an account) by what was
 * granted, not by requests: each granted place is held until it is a window old (a minute or an
 * hour, as `per` says) or released, so a send that takes long and then fails frees only its own
 * place, never a later one's; a refused ask takes nothing. The window slides: at most `limit` in
 * any one, by the clock given (`now`), read once per ask. Lives in memory: the API runs as one
 * instance.
 */
export function quota({ gapMs, limit, per }: QuotaSettings, now: () => Date): Quota {
  const windowMs = lengthMs[per];
  /** Each key's places in the last window, oldest first; a place is released by its identity. */
  const taken = new Map<string, { readonly at: number }[]>();
  let lastSweep = now().getTime();

  return {
    take: (key) => {
      const asked = now().getTime();
      // Stryker disable all: forgetting keys without recent places only bounds memory; take and
      // release answer the same with or without it.
      if (asked - lastSweep >= windowMs) {
        lastSweep = asked;
        for (const [swept, times] of taken) {
          if (times.every(({ at }) => at <= asked - windowMs)) taken.delete(swept);
        }
      }
      // Stryker restore all
      const held = (taken.get(key) ?? []).filter(({ at }) => at > asked - windowMs);
      const latest = held.at(-1)?.at ?? -Infinity;
      if (asked - latest < gapMs) {
        return { granted: false, retryAfterSeconds: secondsUntil(latest + gapMs, asked) };
      }
      if (held.length >= limit) {
        const oldest = Math.min(...held.map(({ at }) => at));
        return { granted: false, retryAfterSeconds: secondsUntil(oldest + windowMs, asked) };
      }
      const place = { at: asked };
      taken.set(key, [...held, place]);
      return {
        granted: true,
        release: () => {
          const list = taken.get(key) ?? [];
          const index = list.indexOf(place);
          if (index >= 0) list.splice(index, 1);
        },
      };
    },
  };
}

/** Whole seconds until `at`, at least one: an answer of 0 would invite a retry now. */
function secondsUntil(at: number, asked: number): number {
  return Math.max(1, Math.ceil((at - asked) / 1000));
}
