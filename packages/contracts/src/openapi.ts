import { createDocument, type ZodOpenApiObject, type ZodOpenApiPathsObject } from 'zod-openapi';
import { endpoints } from './endpoints.js';

type OpenApiDocument = ReturnType<typeof createDocument>;

/** Builds the OpenAPI document of the API from the Zod schemas of its endpoints. */
export function createOpenApiDocument(): OpenApiDocument {
  const paths: ZodOpenApiPathsObject = {};
  for (const endpoint of endpoints) {
    const responses = Object.fromEntries(
      Object.entries(endpoint.responses).map(([status, response]) => [
        status,
        {
          description: response.description,
          content: { 'application/json': { schema: response.schema } },
          ...(response.headers && { headers: response.headers }),
        },
      ]),
    );
    paths[endpoint.path] = {
      ...paths[endpoint.path],
      [endpoint.method]: {
        summary: endpoint.summary,
        tags: [...endpoint.tags],
        ...((endpoint.params ?? endpoint.headers) && {
          requestParams: {
            ...(endpoint.params && { path: endpoint.params }),
            ...(endpoint.headers && { header: endpoint.headers }),
          },
        }),
        ...(endpoint.body && {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: endpoint.body } },
          },
        }),
        responses,
      },
    };
  }

  const definition: ZodOpenApiObject = {
    openapi: '3.1.0',
    info: {
      title: 'qando API',
      version: '0.0.0',
      description: 'Generated from the Zod schemas of the contracts package.',
    },
    paths,
  };
  return createDocument(definition);
}
