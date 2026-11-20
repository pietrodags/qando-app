import { managementTokenSchema, voteTokenSchema } from '@qando/contracts';
import { newCapabilityToken } from './capability-token';

describe('newCapabilityToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is 128 random bits from the browser, in base64url without padding', () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint8Array) array.fill(0xfb).fill(0xff, 15);
      return array;
    });

    expect(newCapabilityToken()).toBe('-_v7-_v7-_v7-_v7-_v7_w');
    expect(random).toHaveBeenCalledWith(new Uint8Array(16).fill(0xfb).fill(0xff, 15));
  });

  it('is a new token each time, of the shape the API takes for a vote and for an event', () => {
    const first = newCapabilityToken();
    const second = newCapabilityToken();

    expect(second).not.toBe(first);
    expect(voteTokenSchema.safeParse(first).success).toBe(true);
    expect(managementTokenSchema.safeParse(first).success).toBe(true);
  });
});
