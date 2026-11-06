import { inject } from '@angular/core';
import { Router, type RedirectFunction } from '@angular/router';
import { MyVotes } from './my-votes';

/**
 * The private link, `/vote/:id/my-vote#t=<token>`: hands its token to this browser and opens the
 * voting page on the vote it holds, without the token in the address bar (or the history).
 */
export const openMyVoteLink: RedirectFunction = ({ params, fragment }) => {
  const eventId = String(params['eventId']);
  const token = new URLSearchParams(fragment ?? '').get('t');
  if (token !== null) inject(MyVotes).claim(eventId, token);
  return inject(Router).createUrlTree(['/vote', eventId]);
};
