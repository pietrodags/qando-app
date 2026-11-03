import { expect, it } from 'vitest';

it('fails on purpose to prove that CI blocks merging', () => {
  expect(1).toBe(2);
});
