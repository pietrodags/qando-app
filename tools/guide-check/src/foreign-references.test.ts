import { describe, expect, it } from 'vitest';

import { foreignReferences } from './foreign-references.ts';

/** The identifiers found in one file `a.ts` with this text, as `line: identifier`. */
function found(text: string): string[] {
  return foreignReferences([{ path: 'a.ts', text }]).map((message) => {
    const match = /^a\.ts:(\d+): `([^`]+)` /.exec(message);
    if (!match) throw new Error(`unexpected message: ${message}`);
    return `${String(match[1])}: ${String(match[2])}`;
  });
}

describe('foreignReferences', () => {
  it('finds nothing without files', () => {
    expect(foreignReferences([])).toEqual([]);
  });

  it('finds nothing in a file that says its reasons in words', () => {
    expect(found('')).toEqual([]);
    expect(found('// Two voters called Ana stay two people.\nexport const a = 1;\n')).toEqual([]);
  });

  it('says where the identifier is and what to do instead', () => {
    expect(
      foreignReferences([{ path: 'apps/api/src/main.ts', text: '// See BUG-046 for why.\n' }]),
    ).toEqual([
      'apps/api/src/main.ts:1: `BUG-046` points to a document that is not in this repository; say the reason in words',
    ]);
  });

  it.each([
    'BUG-046',
    'OD-05',
    'ADD-12',
    'DR-01',
    'BR-020',
    'PAR-038',
    'RES-07',
    'AD2-016',
    'AD3-010',
  ])('finds the identifier %s, with two or three digits', (identifier) => {
    expect(found(`// Listed because they are two (${identifier}).`)).toEqual([`1: ${identifier}`]);
  });

  it.each(['ADR 0004', 'ADR-0004', 'ADR0004'])('finds the decision record %s', (identifier) => {
    expect(found(`// Sign-in by email code (${identifier}).`)).toEqual([`1: ${identifier}`]);
  });

  it('finds an identifier that is the whole text', () => {
    expect(found('OD-05')).toEqual(['1: OD-05']);
    expect(found('ADR 0004')).toEqual(['1: ADR 0004']);
  });

  it('counts lines from 1, whatever the line ending', () => {
    expect(found('one\ntwo OD-05\n\nfour BUG-016\n')).toEqual(['2: OD-05', '4: BUG-016']);
    expect(found('one\r\ntwo\r\nthree ADR 0012\r\n')).toEqual(['3: ADR 0012']);
  });

  it('finds every identifier of a line, in order', () => {
    expect(found('// Fixed (BUG-021, OD-09/OD-10; ADR 0009) and BUG-021 again.')).toEqual([
      '1: BUG-021',
      '1: OD-09',
      '1: OD-10',
      '1: ADR 0009',
      '1: BUG-021',
    ]);
  });

  it('goes through the files in the order given', () => {
    expect(
      foreignReferences([
        { path: 'b.ts', text: 'x\n// DR-04' },
        { path: 'clean.ts', text: 'export const clean = 1;\n' },
        { path: 'a.md', text: 'As ADR-0001 says.' },
      ]),
    ).toEqual([
      'b.ts:2: `DR-04` points to a document that is not in this repository; say the reason in words',
      'a.md:1: `ADR-0001` points to a document that is not in this repository; say the reason in words',
    ]);
  });

  it.each([
    'SHA-256',
    'ISO-8601',
    'UTF-8',
    'ES2022',
    'HU03',
    '#230',
    'RFC 9110',
    // Part of a longer word or a longer number.
    'CMD-12',
    'ROD-05',
    'XBUG-046',
    'XADR 0004',
    'BADR-0004',
    'OD-1234',
    'BUG-0461',
    'OD-05b',
    'OD-05_a',
    'ADR 00045',
    'ADR 0004x',
    // Too few digits, or none.
    'OD-5',
    'BUG-4',
    'ADR 004',
    'ADR 4',
    'OD-',
    'ADR',
    'AD-12',
    'ADX-12',
    // Another separator, or none where one is needed.
    'OD05',
    'BUG046',
    'OD 05',
    'OD_05',
    'ADR_0004',
    'ADR  0004',
    'ADR--0004',
    'ADR\n0004',
    // Only in upper case.
    'od-05',
    'bug-046',
    'adr 0004',
    'Adr 0004',
  ])('leaves %s alone', (lookAlike) => {
    expect(found(`// Hashed with ${lookAlike} first.`)).toEqual([]);
    expect(found(lookAlike)).toEqual([]);
  });
});
