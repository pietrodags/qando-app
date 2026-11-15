// Splits text into graphemes, the segmenter's default granularity.
const graphemes = new Intl.Segmenter();

/** Characters as people see them: "Á" with a combining accent or "👨‍👩‍👧" count as one. */
export function countCharacters(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

/**
 * The longest start of `text` whose trimmed text has at most `limit` characters as people see
 * them: the spaces before it do not count, and no character is ever cut in two.
 */
export function clipCharacters(text: string, limit: number): string {
  if (countCharacters(text.trim()) <= limit) return text;
  const start = text.length - text.trimStart().length;
  const kept = Array.from(graphemes.segment(text.slice(start)), ({ segment }) => segment);
  return text.slice(0, start) + kept.slice(0, limit).join('');
}
