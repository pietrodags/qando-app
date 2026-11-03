import { createOpenApiDocument } from '@qando/contracts/openapi';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

/** Serves the OpenAPI document generated from the contracts and Swagger UI to browse it. */
export function docsRouter(): Router {
  const document = createOpenApiDocument();
  const router = Router();

  router.get('/openapi.json', (_request, response) => {
    response.json(document);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'qando API' }));

  return router;
}
