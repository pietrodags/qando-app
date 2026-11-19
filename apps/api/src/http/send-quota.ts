/** What asking the quota for one send answered. */
export type QuotaAnswer =
  | {
      readonly granted: true;
      /** Gives this send's place back, e.g. a code the email server refused; once. */
      release(): void;
    }
  | { readonly granted: false; readonly retryAfterSeconds: number };

/** How many sends one key may make: a gap between two, and a cap in any hour. */
export interface SendQuotaSettings {
  readonly gapMs: number;
  readonly perHour: number;
}

/** Sends per key (an email, a client address), as `take(key)` asks: grants one or says how long to wait. */
export interface SendQuota {
  take(key: string): QuotaAnswer;
}

const hourMs = 60 * 60_000;

/**
 * Limits sends per key by the sends themselves, not by requests: each granted send
 * holds its place until it is an hour old or released, so a send that takes long and then fails
 * frees only its own place, never a later send's; a refused ask takes nothing. The hour slides:
 * at most `perHour` sends in any hour, by the clock given (`now`), read once per ask. Lives in
 * memory: the API runs as one instance.
 */
export function sendQuota({ gapMs, perHour }: SendQuotaSettings, now: () => Date): SendQuota {
  /** Each key's sends in the last hour, oldest first; a send is released by its identity. */
  const sends = new Map<string, { readonly at: number }[]>();
  let lastSweep = now().getTime();

  return {
    take: (key) => {
      const asked = now().getTime();
      // Stryker disable all: forgetting keys without recent sends only bounds memory; take and
      // release answer the same with or without it.
      if (asked - lastSweep >= hourMs) {
        lastSweep = asked;
        for (const [swept, times] of sends) {
          if (times.every(({ at }) => at <= asked - hourMs)) sends.delete(swept);
        }
      }
      // Stryker restore all
      const held = (sends.get(key) ?? []).filter(({ at }) => at > asked - hourMs);
      const latest = held.at(-1)?.at ?? -Infinity;
      if (asked - latest < gapMs) {
        return { granted: false, retryAfterSeconds: secondsUntil(latest + gapMs, asked) };
      }
      if (held.length >= perHour) {
        const oldest = Math.min(...held.map(({ at }) => at));
        return { granted: false, retryAfterSeconds: secondsUntil(oldest + hourMs, asked) };
      }
      const send = { at: asked };
      sends.set(key, [...held, send]);
      return {
        granted: true,
        release: () => {
          const list = sends.get(key) ?? [];
          const place = list.indexOf(send);
          if (place >= 0) list.splice(place, 1);
        },
      };
    },
  };
}

/** Whole seconds until `at`, at least one: an answer of 0 would invite a retry now. */
function secondsUntil(at: number, asked: number): number {
  return Math.max(1, Math.ceil((at - asked) / 1000));
}
