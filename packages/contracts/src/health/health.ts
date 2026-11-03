import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';

export const healthOkSchema = z
  .object({ status: z.literal('ok'), database: z.literal('up') })
  .meta({ id: 'HealthOk', description: 'The API and its database answer.' });

export const healthUnavailableSchema = z
  .object({ status: z.literal('unavailable'), database: z.literal('down') })
  .meta({ id: 'HealthUnavailable', description: 'The database does not answer.' });

export const healthResponseSchema = z.union([healthOkSchema, healthUnavailableSchema]);

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const healthEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/health',
  summary: 'Reports whether the API and its database are up',
  tags: ['health'],
  responses: {
    200: { description: 'Everything is up', schema: healthOkSchema },
    503: { description: 'The database is down', schema: healthUnavailableSchema },
  },
});
