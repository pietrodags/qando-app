import { describe, expect, it } from 'vitest';
import { applicationShown } from './application-shown.js';

describe('applicationShown', () => {
  it('shows the name the application’s document gave, with the host of its address', () => {
    expect(applicationShown('https://claude.ai/oauth/mcp-client.json', 'Claude')).toEqual({
      name: 'Claude',
      host: 'claude.ai',
    });
  });

  it('shows the host for a name when the document gave none', () => {
    expect(applicationShown('https://chatgpt.com/connector.json', null)).toEqual({
      name: 'chatgpt.com',
      host: 'chatgpt.com',
    });
  });

  it('keeps the port of the address in its host', () => {
    expect(applicationShown('https://assistant.example:8443/app.json', null)).toEqual({
      name: 'assistant.example:8443',
      host: 'assistant.example:8443',
    });
  });
});
