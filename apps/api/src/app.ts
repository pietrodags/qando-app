import express, { type Express } from 'express';
import { healthRouter, type DatabaseCheck } from './modules/health/health.js';

export interface AppDependencies {
  checkDatabase: DatabaseCheck;
}

export function createApp({ checkDatabase }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/health', healthRouter(checkDatabase));
  return app;
}
