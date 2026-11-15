// Splits text into graphemes, the segmenter's default granularity.
const graphemes = new Intl.Segmenter();

/** Characters as people see them: "Á" with a combining accent or "👨‍👩‍👧" count as one. */
export function countCharacters(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

/**
 * `text` after an edit that ends at `caret`, cut to at most `limit` characters as people see them
 * once trimmed, by dropping the characters just before the caret (what was just typed or pasted),
 * never one cut in two; the text after the caret is kept. Also gives where the caret goes.
 */
export function clipBefore(
  text: string,
  limit: number,
  caret: number,
): { text: string; caret: number } {
  const after = text.slice(caret);
  const before = Array.from(graphemes.segment(text.slice(0, caret)), ({ segment }) => segment);
  while (before.length > 0 && countCharacters((before.join('') + after).trim()) > limit) {
    before.pop();
  }
  const kept = before.join('');
  return { text: kept + after, caret: kept.length };
}
