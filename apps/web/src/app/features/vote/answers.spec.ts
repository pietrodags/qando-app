import { allAvailable, toggled, withPreferred } from './answers';

describe('answers', () => {
  it('start with every option available', () => {
    expect(allAvailable(['a', 'b'])).toEqual({ a: 'available', b: 'available' });
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
});
