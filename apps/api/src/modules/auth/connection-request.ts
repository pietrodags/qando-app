/**
 * What Better Auth adds to a request to connect when it signs it for the sign-in page: the
 * signature, its expiry, and parameters of its own, all named `ba_…`.
 */
const addedToSign = (name: string) => name === 'sig' || name === 'exp' || name.startsWith('ba_');

/**
 * The query to ask the authorization server again what an application asked when it asked to
 * connect, once the person has signed in: the parameters of `signed`, the request as it was
 * signed for the sign-in page (the query of the page's address), in their order, without what
 * was added to sign it and without what asks for a sign-in (`prompt=login`, `max_age`). The
 * person has just made that sign-in: asked for it again, the authorization server would send
 * the browser back to the sign-in page, every time.
 */
export function askedAgain(signed: string): string {
  const asked = new URLSearchParams();
  for (const [name, value] of new URLSearchParams(signed)) {
    if (addedToSign(name) || name === 'max_age') continue;
    if (name !== 'prompt') {
      asked.append(name, value);
      continue;
    }
    // What else the person must be asked (the consent, even if already given) is still asked.
    const others = value.split(' ').filter((prompt) => prompt !== '' && prompt !== 'login');
    if (others.length > 0) asked.append(name, others.join(' '));
  }
  return asked.toString();
}
