import { allAvailable, dayState, dayToggled, resumed, toggled, withPreferred } from './answers';

describe('answers', () => {
  it('start with every option available', () => {
    expect(allAvailable(['a', 'b'])).toEqual({ a: 'available', b: 'available' });
  });

  it('resume a stored vote: its answer for each option, available for one it lacks', () => {
    expect(resumed(['a', 'b'], { a: 'preferred', gone: 'unavailable' })).toEqual({
      a: 'preferred',
      b: 'available',
    });
  });

  it('toggle available ↔ unavailable, and a preferred option back to available', () => {
    expect(toggled({ a: 'available' }, 'a')).toEqual({ a: 'unavailable' });
    expect(toggled({ a: 'unavailable' }, 'a')).toEqual({ a: 'available' });
    expect(toggled({ a: 'preferred' }, 'a')).toEqual({ a: 'available' });
  });

  it('toggle only the option touched', () => {
    expect(toggled({ a: 'available', b: 'preferred' }, 'a')).toEqual({
      a: 'unavailable',
      b: 'preferred',
    });
  });

  it('keep one preferred option: the new one sends the previous one back to available', () => {
    const answers = { a: 'preferred', b: 'unavailable', c: 'available' } as const;

    expect(withPreferred(answers, 'b')).toEqual({
      a: 'available',
      b: 'preferred',
      c: 'available',
    });
  });

  it('send the preferred option back to available when it is chosen again', () => {
    expect(withPreferred({ a: 'preferred', b: 'unavailable' }, 'a')).toEqual({
      a: 'available',
      b: 'unavailable',
    });
  });

  it('never change the answers they were given', () => {
    const answers = { a: 'available', b: 'preferred' } as const;
    const copy = { ...answers };

    toggled(answers, 'a');
    withPreferred(answers, 'a');

    expect(answers).toEqual(copy);
  });

  describe('of a day with times', () => {
    it('make the day unavailable only when all of its options are', () => {
      expect(dayState({ a: 'unavailable', b: 'unavailable' }, ['a', 'b'])).toBe('unavailable');
      expect(dayState({ a: 'unavailable', b: 'available' }, ['a', 'b'])).toBe('available');
    });

    it('count a preferred option as the day available: the day itself is never preferred', () => {
      expect(dayState({ a: 'unavailable', b: 'preferred' }, ['a', 'b'])).toBe('available');
    });

    it('read only the options of the day', () => {
      expect(dayState({ a: 'unavailable', other: 'available' }, ['a'])).toBe('unavailable');
    });

    it('turn every option of the day unavailable with a tap, the preferred one too', () => {
      expect(
        dayToggled({ a: 'available', b: 'preferred', c: 'unavailable', other: 'available' }, [
          'a',
          'b',
          'c',
        ]),
      ).toEqual({ a: 'unavailable', b: 'unavailable', c: 'unavailable', other: 'available' });
    });

    it('turn every option of an unavailable day available again with a tap', () => {
      expect(
        dayToggled({ a: 'unavailable', b: 'unavailable', other: 'preferred' }, ['a', 'b']),
      ).toEqual({ a: 'available', b: 'available', other: 'preferred' });
    });
  });
});
