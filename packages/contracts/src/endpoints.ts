import type { Endpoint } from './endpoint.js';
import { healthEndpoint } from './health/health.js';

/** Every endpoint the API serves; the OpenAPI document lists exactly these. */
export const endpoints: readonly Endpoint[] = [healthEndpoint];
