import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { When, Then } = createBdd(test);

// The metadata of the authorization server as an application read it, kept for the step that
// checks it.
let serverMetadata: Record<string, unknown> | undefined;

When("an application reads the metadata of qando's authorization server", async ({ page }) => {
  // As an application finds it, through the web's address: the connector's metadata names the
  // authorization server, whose own metadata is at the well-known address of its site, with
  // the server's path after it.
  const connector = await page.request.get('/.well-known/oauth-protected-resource/api/mcp');
  expect(connector.status()).toBe(200);
  const { authorization_servers: servers } = (await connector.json()) as {
    authorization_servers: string[];
  };
  const server = new URL(servers[0] ?? '');
  const answer = await page.request.get(
    `${server.origin}/.well-known/oauth-authorization-server${server.pathname}`,
  );
  expect(answer.status()).toBe(200);
  serverMetadata = (await answer.json()) as Record<string, unknown>;
});

Then('the metadata offers no address to register at', () => {
  expect(serverMetadata).toHaveProperty('issuer');
  expect(serverMetadata).not.toHaveProperty('registration_endpoint');
});
