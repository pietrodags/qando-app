// What the three languages write the same way and belongs to none of them: symbols and the
// short forms of chat.
import type { Language } from './term.js';

export const shared: Language = {
  words: [
    [{ t: 'AND' }, '&|+'],
    [{ t: 'AT' }, '@'],
    [{ t: 'H' }, 'h'],
    [{ t: 'PM' }, 'pm|p m'],
    [{ t: 'AM' }, 'am|a m'],
    [{ t: 'FILLER' }, 'ok|okay'],
  ],
  notTypos: [],
};
