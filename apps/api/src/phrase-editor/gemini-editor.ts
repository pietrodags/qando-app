// The model that copy-edits a phrase: Gemini 3.5 Flash-Lite through Google's Gemini API (ADR
// 0007). The phrase is the organizer's text, so it travels as data, apart from the instructions,
// and the answer is forced to one phrase. Google is asked not to store the request.
import { z } from 'zod';
import { instructions } from './instructions.js';
import { CopyEditRefused, type CopyEdit } from './phrase-editor.js';

export interface GeminiSettings {
  /** A key of the paid tier, whose requests Google does not use to improve its products. */
  readonly apiKey: string;
  /** Where the Gemini API is. Only a test names another place. */
  readonly baseUrl?: string;
}

const model = 'gemini-3.5-flash-lite';

/** What Gemini answers: the text of its first candidate, in parts; any other candidate is left unread. */
const answerOf = z.object({
  candidates: z.tuple(
    [z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) })],
    z.unknown(),
  ),
});
/** What that text says: the phrase, edited. */
const editOf = z.object({ phrase: z.string().trim().min(1) });

/** Copy-edits a phrase with Gemini: one request per phrase, never tried again. */
export function geminiEditor({
  apiKey,
  baseUrl = 'https://generativelanguage.googleapis.com',
}: GeminiSettings): CopyEdit {
  return async (phrase, signal) => {
    const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ phrase }) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { phrase: { type: 'STRING' } },
            required: ['phrase'],
          },
        },
        store: false,
      }),
      signal,
    });
    if (!response.ok) throw new CopyEditRefused(response.status);
    const [candidate] = answerOf.parse(await response.json()).candidates;
    const written = candidate.content.parts.map((part) => part.text).join('');
    return editOf.parse(JSON.parse(written)).phrase;
  };
}
