// Splits text into graphemes, the segmenter's default granularity.
const graphemes = new Intl.Segmenter();

/** Characters as people see them: "Á" with a combining accent or "👨‍👩‍👧" count as one. */
export function countCharacters(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

/** How many of `parts` (one character each) remain once the spaces around them are gone. */
function trimmedCount(parts: readonly string[]): number {
  const isText = (part: string) => part.trim() !== '';
  const first = parts.findIndex(isText);
  // The web is built for ES2022, without findLastIndex.
  return first === -1 ? 0 : parts.length - [...parts].reverse().findIndex(isText) - first;
}

/**
 * `text` after an edit that ends at `caret`, cut to at most `limit` characters as people see them
 * once trimmed, by dropping the characters just before the caret (what was just typed or pasted),
 * never one cut in two; the text after the caret is kept. Also gives where the caret goes. The text
 * is split into characters once, so a whole document pasted by mistake is cut at once.
 */
export function clipBefore(
  text: string,
  limit: number,
  caret: number,
): { text: string; caret: number } {
  const parts = Array.from(graphemes.segment(text));
  const split = parts.findIndex(({ index }) => index >= caret);
  const before = parts.slice(0, split === -1 ? parts.length : split).map(({ segment }) => segment);
  const after = parts.slice(before.length).map(({ segment }) => segment);
  const fits = (kept: number) => trimmedCount([...before.slice(0, kept), ...after]) <= limit;
  if (fits(before.length)) return { text, caret };
  // The most characters before the caret that still fit: keeping fewer never adds characters.
  let low = 0;
  let high = before.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  const kept = before.slice(0, low).join('');
  return { text: kept + after.join(''), caret: kept.length };
}
