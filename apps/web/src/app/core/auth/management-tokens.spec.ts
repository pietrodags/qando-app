import { TestBed } from '@angular/core/testing';
import { ManagementTokens } from './management-tokens';

/** A new instance, as after reloading the page or in another tab. */
function tokens(): ManagementTokens {
  return TestBed.runInInjectionContext(() => new ManagementTokens());
}

function refuseStorage(...methods: ('setItem' | 'getItem')[]): void {
  for (const method of methods) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
  }
}

describe('ManagementTokens', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps one token per event, for every tab and after a reload', () => {
    tokens().keep('k3Jd9', 'token-of-cena');
    tokens().keep('Re0YV', 'token-of-cafe');

    expect(tokens().of('k3Jd9')).toBe('token-of-cena');
    expect(tokens().of('Re0YV')).toBe('token-of-cafe');
  });

  it('holds none for an event whose link this browser never opened', () => {
    tokens().keep('k3Jd9', 'token-of-cena');

    expect(tokens().of('Re0YV')).toBeNull();
  });

  it('replaces the token kept before for the event', () => {
    const page = tokens();
    page.keep('k3Jd9', 'old-token');
    page.keep('k3Jd9', 'new-token');

    expect(page.of('k3Jd9')).toBe('new-token');
    expect(tokens().of('k3Jd9')).toBe('new-token');
  });

  it('keeps the token on the page alone when the browser refuses its storage', () => {
    refuseStorage('setItem', 'getItem');
    const page = tokens();
    page.keep('k3Jd9', 'token-of-cena');

    expect(page.of('k3Jd9')).toBe('token-of-cena');
    expect(page.of('Re0YV')).toBeNull();
    expect(tokens().of('k3Jd9')).toBeNull();
  });

  it('forgets every token, also for the page that kept them', () => {
    const page = tokens();
    page.keep('k3Jd9', 'token-of-cena');
    page.keep('Re0YV', 'token-of-cafe');

    tokens().forgetAll();

    expect(page.of('k3Jd9')).toBeNull();
    expect(page.of('Re0YV')).toBeNull();
    expect(localStorage).toHaveLength(0);
  });

  it('forgets the tokens a page keeps alone, in a browser without storage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const page = tokens();
    page.keep('k3Jd9', 'token-of-cena');
    expect(page.of('k3Jd9')).toBe('token-of-cena');

    page.forgetAll();

    expect(page.of('k3Jd9')).toBeNull();
  });

  it('forgets nothing else the browser stores: a voter’s link stays', () => {
    localStorage.setItem('qando.voteToken.k3Jd9', 'vote-token');
    localStorage.setItem('qando.voteToken.k3Jd9.fromLink', 'vote-token');
    localStorage.setItem('other', 'value');
    tokens().keep('k3Jd9', 'token-of-cena');

    tokens().forgetAll();

    expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe('vote-token');
    expect(localStorage.getItem('qando.voteToken.k3Jd9.fromLink')).toBe('vote-token');
    expect(localStorage.getItem('other')).toBe('value');
    expect(localStorage).toHaveLength(3);
  });

  it('forgets the tokens it can when one cannot be removed', () => {
    const page = tokens();
    page.keep('k3Jd9', 'token-of-cena');
    page.keep('Re0YV', 'token-of-cafe');
    // Refused once: the calls after it remove as always.
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    page.forgetAll();

    expect(localStorage).toHaveLength(1);
  });
});
