import type { Endpoint } from './endpoint.js';
import { healthEndpoint } from './health/health.js';
import { publicEventEndpoint } from './public-events/public-event.js';

/** Every endpoint the API serves; the OpenAPI document lists exactly these. */
export const endpoints: readonly Endpoint[] = [healthEndpoint, publicEventEndpoint];
