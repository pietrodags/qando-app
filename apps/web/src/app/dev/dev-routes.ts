import type { Routes } from '@angular/router';

/** Pages for development only; the production build replaces this file with an empty list. */
export const devRoutes: Routes = [
  {
    path: 'dev/step-stack',
    loadComponent: () => import('./step-stack-playground').then((m) => m.StepStackPlayground),
  },
];
