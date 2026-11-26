// Better Auth stores an account's answer on the consent page by looking for the account's
// consent to the application and creating one when it finds none. Two answers sent at once
// (the consent page open in two tabs, "Permitir" pressed in both) both find none, and the
// database keeps one consent per account and application, so it refuses the second. That answer
// is still an allowance: here it is written over the consent the first answer stored a moment
// before, as Better Auth writes an answer over a consent it finds, and both answers go on.
import type { BetterAuthOptions } from 'better-auth';
import { refusedAsStored } from '../../db/refused-as-stored.js';

/** What is read here of Better Auth's database: how it creates a row and how it updates one. */
interface Writes {
  create(asked: { model: string; data: Record<string, unknown> }): Promise<unknown>;
  update(asked: {
    model: string;
    where: { field: string; value: unknown }[];
    update: Record<string, unknown>;
  }): Promise<unknown>;
}

/** Better Auth's name for an account's consent to an application. */
const consentModel = 'oauthConsent';

/**
 * Better Auth's database made by `factory`, in which creating an account's consent to an
 * application that the account has a consent to already writes the new answer over it (its
 * permissions, what it was given for and when it was answered) and answers the consent as it
 * is then stored. Every other call, and any other failure, is the database's own.
 */
export function consentsWrittenOver<Adapter extends Writes>(
  factory: (options: BetterAuthOptions) => Adapter,
): (options: BetterAuthOptions) => Adapter {
  return (options) => {
    const adapter = factory(options);
    const create: Writes['create'] = async (asked) => {
      try {
        return await adapter.create(asked);
      } catch (error) {
        if (asked.model !== consentModel || !refusedAsStored(error)) throw error;
        const { userId, clientId, scopes, resources, requestedUserInfoClaims, updatedAt } =
          asked.data;
        return await adapter.update({
          model: consentModel,
          where: [
            { field: 'userId', value: userId },
            { field: 'clientId', value: clientId },
          ],
          update: { scopes, resources, requestedUserInfoClaims, updatedAt },
        });
      }
    };
    return new Proxy(adapter, {
      get: (target, member, receiver) =>
        member === 'create' ? create : Reflect.get(target, member, receiver),
    });
  };
}
