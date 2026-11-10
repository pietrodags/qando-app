import { returnTarget, signInFrom } from './sign-in-return';

describe('signInFrom', () => {
  it('asks to come back to the page it is pressed on, with its query', () => {
    expect(signInFrom('/vote/k3Jd9')).toEqual({ returnTo: '/vote/k3Jd9' });
    expect(signInFrom('/results/Qw7p2?x=1')).toEqual({ returnTo: '/results/Qw7p2?x=1' });
  });

  it('asks for nothing from the home page', () => {
    expect(signInFrom('/')).toEqual({});
    expect(signInFrom('/?x=1')).toEqual({});
  });

  it('keeps what the sign-in page was already asked, never itself', () => {
    expect(signInFrom('/sign-in?returnTo=%2Fvote%2Fk3Jd9')).toEqual({ returnTo: '/vote/k3Jd9' });
    expect(signInFrom('/sign-in')).toEqual({});
  });
});

describe('returnTarget', () => {
  it('is the page that asked to sign in', () => {
    expect(returnTarget('/vote/k3Jd9')).toBe('/vote/k3Jd9');
    expect(returnTarget('/manage/k3Jd9/options?x=1')).toBe('/manage/k3Jd9/options?x=1');
  });

  it('is "Mis eventos" when no page asked, or the home page did', () => {
    expect(returnTarget(undefined)).toBe('/my-events');
    expect(returnTarget('')).toBe('/my-events');
    expect(returnTarget('/')).toBe('/my-events');
  });

  it('never leaves qando: an address of another site goes to "Mis eventos"', () => {
    for (const foreign of [
      'https://evil.example/x',
      '//evil.example/x',
      '/\\evil.example/x',
      'evil.example',
      'javascript:alert(1)',
    ]) {
      expect(returnTarget(foreign)).toBe('/my-events');
    }
  });

  it('never returns to the sign-in page', () => {
    expect(returnTarget('/sign-in')).toBe('/my-events');
    expect(returnTarget('/sign-in?returnTo=%2Fvote')).toBe('/my-events');
  });
});
