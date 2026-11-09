import type { AddressInfo } from 'node:net';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { smtpEmail } from './email.js';

/** What a test SMTP server saw: the emails it took and who signed in. */
interface Seen {
  readonly emails: { from: string; to: string; subject: string; text: string; html: string }[];
  readonly signedIn: { user: string; password: string }[];
}

const servers: SMTPServer[] = [];

/** A plain SMTP server on a free port: no TLS, signing in optional (accepts any password). */
async function startServer(): Promise<{ port: number; seen: Seen }> {
  const seen: Seen = { emails: [], signedIn: [] };
  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth(auth, _session, callback) {
      seen.signedIn.push({ user: auth.username ?? '', password: auth.password ?? '' });
      callback(null, { user: auth.username });
    },
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((mail) => {
          seen.emails.push({
            from: mail.from?.text ?? '',
            to: mail.to && !Array.isArray(mail.to) ? mail.to.text : '',
            subject: mail.subject ?? '',
            text: mail.text ?? '',
            html: typeof mail.html === 'string' ? mail.html : '',
          });
          callback();
        })
        .catch(callback);
    },
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.server.address() as AddressInfo).port, seen };
}

afterEach(closeServers);

const email = {
  to: 'ana@example.com',
  subject: '482915 es tu código de qando',
  text: 'Tu código es 482915',
  html: '<p>Tu código es <b>482915</b></p>',
};

describe('smtpEmail', () => {
  it('hands the email to the server: sender, recipient, subject, text and HTML', async () => {
    const { port, seen } = await startServer();
    const send = smtpEmail({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'qando <no-reply@qando.app>',
    });

    await send(email);

    expect(seen.emails).toEqual([
      {
        from: '"qando" <no-reply@qando.app>',
        to: 'ana@example.com',
        subject: '482915 es tu código de qando',
        text: 'Tu código es 482915',
        html: '<p>Tu código es <b>482915</b></p>',
      },
    ]);
  });

  it('signs in with the user and password when both are set', async () => {
    const { port, seen } = await startServer();
    const send = smtpEmail({
      host: '127.0.0.1',
      port,
      secure: false,
      user: 'project-id',
      password: 'secret-key',
      from: 'no-reply@qando.app',
    });

    await send(email);

    expect(seen.signedIn).toEqual([{ user: 'project-id', password: 'secret-key' }]);
  });

  it.each([
    ['no user nor password', {}],
    ['only a user', { user: 'project-id' }],
    ['only a password', { password: 'secret-key' }],
  ])('does not sign in with %s', async (_, credentials) => {
    const { port, seen } = await startServer();
    const send = smtpEmail({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'no-reply@qando.app',
      ...credentials,
    });

    await send(email);

    expect(seen.signedIn).toEqual([]);
    expect(seen.emails).toHaveLength(1);
  });

  it('never sends in clear when TLS is required and the server offers none', async () => {
    const { port, seen } = await startServer();
    const send = smtpEmail({ host: '127.0.0.1', port, secure: true, from: 'no-reply@qando.app' });

    await expect(send(email)).rejects.toThrow();
    expect(seen.emails).toEqual([]);
  });

  it('rejects when the server cannot be reached', async () => {
    const { port } = await startServer();
    await closeServers();
    const send = smtpEmail({ host: '127.0.0.1', port, secure: false, from: 'no-reply@qando.app' });

    await expect(send(email)).rejects.toThrow();
  });
});

/** Closes the servers started so far. */
async function closeServers(): Promise<void> {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
}
