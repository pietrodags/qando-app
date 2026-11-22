import { sendSignInCodeEndpoint, signInEndpoint } from './auth/sign-in.js';
import { sessionEndpoint } from './auth/session.js';
import { signOutEndpoint } from './auth/sign-out.js';
import { dateInterpretationEndpoint } from './date-interpretations/date-interpretation.js';
import type { Endpoint } from './endpoint.js';
import { healthEndpoint } from './health/health.js';
import { cancelEventEndpoint } from './management/cancel-event.js';
import { changeDeadlineEndpoint, closeVotingEndpoint } from './management/change-deadline.js';
import { confirmOptionEndpoint } from './management/confirm-option.js';
import { createEventEndpoint } from './management/create-event.js';
import { managedEventEndpoint } from './management/managed-event.js';
import { myEventsEndpoint } from './management/my-events.js';
import { retryEmailEndpoint } from './management/retry-email.js';
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
  createEventEndpoint,
  managedEventEndpoint,
  confirmOptionEndpoint,
  cancelEventEndpoint,
  changeDeadlineEndpoint,
  closeVotingEndpoint,
  retryEmailEndpoint,
  myEventsEndpoint,
  sendSignInCodeEndpoint,
  signInEndpoint,
  signOutEndpoint,
  sessionEndpoint,
  dateInterpretationEndpoint,
];
