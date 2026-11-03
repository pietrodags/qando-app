export {
  defineEndpoint,
  errorResponseOf,
  isSuccessStatus,
  successBodyOf,
  type Endpoint,
  type EndpointResponse,
  type ErrorResponse,
  type HttpMethod,
  type SuccessBody,
} from './endpoint.js';
export { endpoints } from './endpoints.js';
export {
  healthEndpoint,
  healthOkSchema,
  healthResponseSchema,
  healthUnavailableSchema,
  type HealthResponse,
} from './health/health.js';
