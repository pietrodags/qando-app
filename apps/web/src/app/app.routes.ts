import type { Routes } from '@angular/router';
import { signedInOnly } from './core/auth/signed-in-only';
import { devRoutes } from './dev/dev-routes';
import { openManagementLink } from './features/manage/management-link';
import { openMyVoteLink } from './features/vote/my-vote-link';

// Sitemap views (docs/sitemap.md). `title` is a catalogue key; until each story is built,
// its view is the placeholder page.
const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/create/create-page').then((m) => m.CreatePage),
  },
  {
    path: 'sign-in',
    title: 'pages.signIn.title',
    loadComponent: () => import('./features/sign-in/sign-in-page').then((m) => m.SignInPage),
  },
  // PROTOTYPE: where an application's request for access asks the organizer's consent.
  {
    path: 'connect',
    loadComponent: () => import('./features/connect/connect-page').then((m) => m.ConnectPage),
  },
  {
    path: 'my-events',
    title: 'pages.myEvents.title',
    canActivate: [signedInOnly],
    loadComponent: placeholder,
  },
  {
    path: 'profile',
    title: 'pages.profile.title',
    canActivate: [signedInOnly],
    loadComponent: placeholder,
  },
  {
    path: 'vote/:eventId',
    title: 'pages.vote.title',
    loadComponent: () => import('./features/vote/vote-page').then((m) => m.VotePage),
  },
  { path: 'vote/:eventId/my-vote', redirectTo: openMyVoteLink },
  {
    path: 'results/:resultsId',
    title: 'pages.results.title',
    loadComponent: () => import('./features/results/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'manage/:eventId',
    title: 'pages.manage.title',
    canActivate: [openManagementLink],
    // Also when only the fragment changes: the full link pasted over its event's page.
    runGuardsAndResolvers: 'always',
    loadComponent: () => import('./features/manage/manage-page').then((m) => m.ManagePage),
  },
  {
    path: 'manage/:eventId/options',
    title: 'pages.manageOptions.title',
    loadComponent: placeholder,
  },
  ...devRoutes,
  {
    path: '**',
    title: 'pages.notFound.title',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
