import type { BetterAuthOptions } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import { consentsWrittenOver } from './consents-written-over.js';

/** An error of PostgreSQL's driver, which says what was refused by its code. */
const refused = (code: string) => Object.assign(new Error('refused'), { code });

/** The consent Better Auth creates when an account answers "Permitir" and it found none. */
const answer = {
  clientId: 'https://claude.ai/oauth/claude-code-client-metadata',
  userId: 'ana',
  scopes: ['events:read', 'events:manage', 'offline_access'],
  requestedUserInfoClaims: undefined,
  createdAt: new Date('2026-11-27T10:00:00Z'),
  updatedAt: new Date('2026-11-27T10:00:00Z'),
  resources: ['https://qando.app/api/mcp'],
  referenceId: undefined,
};

/** A row Better Auth asks its database to create. */
type Create = (asked: { model: string; data: Record<string, unknown> }) => Promise<unknown>;
/** Rows Better Auth asks its database to update. */
type Update = (asked: {
  model: string;
  where: { field: string; value: unknown }[];
  update: Record<string, unknown>;
}) => Promise<unknown>;

/** Better Auth's database as far as it is read here, whose create answers or fails as told. */
function database(create: () => Promise<unknown>) {
  return {
    create: vi.fn<Create>(create),
    update: vi.fn<Update>(() => Promise.resolve({ id: 'stored', ...answer })),
    findOne: vi.fn(() => Promise.resolve(null)),
  };
}

const options = { appName: 'qando' } as BetterAuthOptions;

describe('consentsWrittenOver', () => {
  it('makes the database from the options it is given', () => {
    const made = database(() => Promise.resolve({}));
    const factory = vi.fn(() => made);

    consentsWrittenOver(factory)(options);

    expect(factory).toHaveBeenCalledWith(options);
  });

  it('creates a consent the database takes as Better Auth asks, and answers what it stored', async () => {
    const made = database(() => Promise.resolve({ id: 'new', ...answer }));
    const adapter = consentsWrittenOver(() => made)(options);

    const created = await adapter.create({ model: 'oauthConsent', data: answer });

    expect(created).toEqual({ id: 'new', ...answer });
    expect(made.create).toHaveBeenCalledWith({ model: 'oauthConsent', data: answer });
    expect(made.update).not.toHaveBeenCalled();
  });

  it.each([
    ['refuses it', refused('23505')],
    [
      'fails with that refusal as its cause',
      new Error('Failed query', { cause: refused('23505') }),
    ],
  ])(
    'writes the answer over the consent stored already when the database %s, and answers it',
    async (_how, refusal) => {
      const made = database(() => Promise.reject(refusal));
      const adapter = consentsWrittenOver(() => made)(options);

      const created = await adapter.create({ model: 'oauthConsent', data: answer });

      expect(made.update).toHaveBeenCalledWith({
        model: 'oauthConsent',
        where: [
          { field: 'userId', value: 'ana' },
          { field: 'clientId', value: answer.clientId },
        ],
        update: {
          scopes: answer.scopes,
          resources: answer.resources,
          requestedUserInfoClaims: undefined,
          updatedAt: answer.updatedAt,
        },
      });
      expect(created).toEqual({ id: 'stored', ...answer });
    },
  );

  it('fails as the database does when it refuses a consent for another reason', async () => {
    const failure = refused('23503');
    const made = database(() => Promise.reject(failure));
    const adapter = consentsWrittenOver(() => made)(options);

    await expect(adapter.create({ model: 'oauthConsent', data: answer })).rejects.toBe(failure);
    expect(made.update).not.toHaveBeenCalled();
  });

  it('leaves another model refused as stored already to fail as it does', async () => {
    const failure = refused('23505');
    const made = database(() => Promise.reject(failure));
    const adapter = consentsWrittenOver(() => made)(options);

    await expect(
      adapter.create({ model: 'oauthClientAssertion', data: { expiresAt: new Date() } }),
    ).rejects.toBe(failure);
    expect(made.update).not.toHaveBeenCalled();
  });

  it('leaves every other call of the database as it is', async () => {
    const made = database(() => Promise.resolve({}));
    const adapter = consentsWrittenOver(() => made)(options);

    await adapter.findOne();

    expect(adapter.findOne).toBe(made.findOne);
    expect(adapter.update).toBe(made.update);
    expect(made.findOne).toHaveBeenCalledOnce();
  });
});
