export {
  defineEndpoint,
  type Endpoint,
  type EndpointResponse,
  type HttpMethod,
} from './endpoint.js';
export { endpoints } from './endpoints.js';
export {
  healthEndpoint,
  healthOkSchema,
  healthResponseSchema,
  healthUnavailableSchema,
  type HealthResponse,
} from './health/health.js';
