import { Injector, inject } from '@angular/core';
import { Router, type RedirectFunction } from '@angular/router';

/**
 * The private link, `/vote/:id/my-vote#t=<token>`: hands its token to this browser and opens the
 * voting page on the vote it holds, without the token in the address bar (or the history).
 * `MyVotes` (and the contract it reads) loads with the voting page, never with the home page.
 */
export const openMyVoteLink: RedirectFunction = async ({ params, fragment }) => {
  const injector = inject(Injector);
  const voting = inject(Router).createUrlTree(['/vote', String(params['eventId'])]);
  // A link without its token was copied in part: an empty one is an unknown link.
  const token = new URLSearchParams(fragment ?? '').get('t') ?? '';
  const { MyVotes } = await import('./my-votes');
  injector.get(MyVotes).claim(String(params['eventId']), token);
  return voting;
};
