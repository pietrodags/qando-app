// A comment or a document that points to a document kept outside this repository cannot be
// followed by who reads it here, so it must say its reason in words. Two shapes give such a
// pointer away: the identifier of a bug, a decision or a requirement (a known upper-case prefix, a
// hyphen and two or three digits) and a decision record named by its four-digit number.

/** A text file of the repository: its path from the root and its whole text. */
export interface TextFile {
  readonly path: string;
  readonly text: string;
}

const identifier = /\b(?:(?:BUG|OD|ADD|DR|BR|PAR|RES|AD\d)-\d{2,3}|ADR[ -]?\d{4})\b/g;

/**
 * Every identifier in the files that points to a document outside the repository, one line each
 * (`<path>:<line>: …`), in the order of the files and of their text; empty when there is none.
 * Names that only look alike (a hash or a standard with its number, an issue number, the same
 * letters inside a longer word or in lower case) are not identifiers.
 */
export function foreignReferences(files: readonly TextFile[]): string[] {
  return files.flatMap(({ path, text }) =>
    text
      .split('\n')
      .flatMap((line, index) =>
        Array.from(
          line.matchAll(identifier),
          ([found]) =>
            `${path}:${String(index + 1)}: \`${found}\` points to a document that is not in this repository; say the reason in words`,
        ),
      ),
  );
}
