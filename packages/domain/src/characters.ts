// Splits text into graphemes, the segmenter's default granularity.
const graphemes = new Intl.Segmenter();

/** Characters as people see them: "Á" with a combining accent or "👨‍👩‍👧" count as one. */
export function countCharacters(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}
