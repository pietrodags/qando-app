import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { Page } from '@playwright/test';
import { mailboxPorts } from './mailbox/mailbox.js';

/**
 * What the API reads from its environment in a run, besides DATABASE_URL. The test clock lets
 * each request name the time the API reads (steps/fixtures.ts). The example applications let a
 * scenario connect an assistant that exists nowhere: the API answers the document of any
 * `https://<host>.example/<name>.json` itself, and reads no other. Sessions are trusted from the
 * web dev server's origin, which forwards /api to the API. Every email goes to the run's mailbox,
 * which offers no TLS.
 */
export const apiEnvironment = {
  QANDO_TEST_CLOCK: 'on',
  QANDO_TEST_APPLICATIONS: 'on',
  BETTER_AUTH_URL: 'http://localhost:4200',
  BETTER_AUTH_SECRET: 'end-to-end-tests-secret-never-deployed-0123456789',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(mailboxPorts.smtp),
  SMTP_SECURE: 'false',
};

/** The API's entry, from the repository's root: run by tsx from its sources. */
const API_ENTRY = 'apps/api/src/main.ts';

const tsx = 'npx tsx --conditions=@qando/source';

/**
 * Starts the run's API as a deployment does: DATABASE_URL is brought up to date first, then the
 * API starts, which it does not on a database that lacks its tables.
 */
export const apiCommand = `${tsx} apps/api/src/migrate.ts && ${tsx} ${API_ENTRY}`;

const REPOSITORY = new URL('..', import.meta.url);

/** A port nothing listens on, as the system gives one. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') reject(new Error('No port given'));
        else resolve(address.port);
      });
    });
  });
}

/**
 * The API after a restart: a new process on the same database, which holds nothing of what the
 * run's own API has in memory. The run's API is left alone, since stopping it would fail the
 * scenarios running beside this one; a page sent here (`serve`) gets every API answer from the
 * new process instead.
 */
export class RestartedApi {
  #process: ChildProcess | undefined;
  #origin = '';
  /** Each answer the new process has given, in order: the path asked, its status and its body. */
  readonly answered: { path: string; status: number; body: string }[] = [];

  /** Starts the new process and waits until it listens. */
  async start(): Promise<void> {
    const port = await freePort();
    const api = spawn(
      process.execPath,
      ['--conditions=@qando/source', '--import', 'tsx', API_ENTRY],
      {
        cwd: REPOSITORY,
        env: { ...process.env, ...apiEnvironment, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    this.#process = api;
    await new Promise<void>((resolve, reject) => {
      let errors = '';
      api.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));
      api.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('API listening')) resolve();
      });
      api.once('error', reject);
      api.once('exit', (code) => {
        reject(new Error(`The restarted API stopped (${String(code)}): ${errors}`));
      });
    });
    this.#origin = `http://127.0.0.1:${String(port)}`;
  }

  /**
   * From now on the new process answers every API request of `page`, each sent with `headers`
   * (the scenario's time and address) over its own.
   */
  async serve(page: Page, headers: Record<string, string>): Promise<void> {
    if (!this.#origin) throw new Error('The API has not restarted');
    await page.route('**/api/**', async (route) => {
      const { pathname, search } = new URL(route.request().url());
      const response = await route.fetch({
        url: `${this.#origin}${pathname}${search}`,
        headers: { ...route.request().headers(), ...headers },
      });
      this.answered.push({
        path: pathname,
        status: response.status(),
        body: await response.text(),
      });
      await route.fulfill({ response });
    });
  }

  stop(): void {
    this.#process?.kill();
  }
}
