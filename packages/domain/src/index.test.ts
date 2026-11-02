import { describe, expect, it } from 'vitest';

describe('package entry point', () => {
  it('loads as an ES module', async () => {
    await expect(import('./index.js')).resolves.toBeDefined();
  });
});
