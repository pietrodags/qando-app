import { sendSignInCodeEndpoint, signInEndpoint } from './auth/sign-in.js';
import { signOutEndpoint } from './auth/sign-out.js';
import type { Endpoint } from './endpoint.js';
import { healthEndpoint } from './health/health.js';
import { confirmOptionEndpoint } from './management/confirm-option.js';
import { managedEventEndpoint } from './management/managed-event.js';
import { castVoteEndpoint } from './public-events/cast-vote.js';
import { editVoteEndpoint, myVoteEndpoint } from './public-events/my-vote.js';
import { publicEventEndpoint } from './public-events/public-event.js';
import { resultsEndpoint } from './results/results.js';

/** Every endpoint the API serves; the OpenAPI document lists exactly these. */
export const endpoints: readonly Endpoint[] = [
  healthEndpoint,
  publicEventEndpoint,
  castVoteEndpoint,
  myVoteEndpoint,
  editVoteEndpoint,
  resultsEndpoint,
  managedEventEndpoint,
  confirmOptionEndpoint,
  sendSignInCodeEndpoint,
  signInEndpoint,
  signOutEndpoint,
];
