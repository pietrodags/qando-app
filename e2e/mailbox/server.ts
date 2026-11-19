// The mailbox's server, started by the acceptance run (playwright.config.ts): an SMTP server that
// takes every email the API sends and keeps it in memory, and the HTTP address the steps read
// them from (`GET /emails?to=<address>`). Nothing leaves this computer.
import { createServer } from 'node:http';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { mailboxPorts, type DeliveredEmail } from './mailbox.js';

const delivered: DeliveredEmail[] = [];

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  logger: false,
  // Answered only once the email is kept: when the API hears it was taken, a step can read it.
  onData(stream, session, callback) {
    simpleParser(stream)
      .then((mail) => {
        for (const { address } of session.envelope.rcptTo) {
          delivered.push({ to: address, subject: mail.subject ?? '', text: mail.text ?? '' });
        }
        callback();
      })
      .catch(callback);
  },
});
smtp.on('error', (error) => {
  console.error('The test mailbox failed', error);
});
smtp.listen(mailboxPorts.smtp, '127.0.0.1');

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://mailbox');
  const to = url.searchParams.get('to');
  if (url.pathname !== '/emails' || to === null) {
    response.writeHead(404).end();
    return;
  }
  response
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify(delivered.filter((email) => email.to === to)));
}).listen(mailboxPorts.http, '127.0.0.1');
