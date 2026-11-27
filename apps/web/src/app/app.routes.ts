import type { Routes } from '@angular/router';
import { signedInOnly } from './core/auth/signed-in-only';
import { devRoutes } from './dev/dev-routes';
import { openManagementLink } from './features/manage/management-link';
import { openMyVoteLink } from './features/vote/my-vote-link';

// Sitemap views (docs/sitemap.md). `title` is a catalogue key; until each story is built,
// its view is the placeholder page. Built when called, not when the module loads, the page
// loaders too: a value built at load time is a static mutant, which mutation testing can only
// check by running every test of the web.
export function appRoutes(): Routes {
  const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);
  return [
    {
      path: '',
      loadComponent: () => import('./features/create/create-page').then((m) => m.CreatePage),
    },
    {
      path: 'sign-in',
      title: 'pages.signIn.title',
      loadComponent: () => import('./features/sign-in/sign-in-page').then((m) => m.SignInPage),
    },
    {
      path: 'connect',
      title: 'pages.connect.title',
      loadComponent: () => import('./features/connect/connect-page').then((m) => m.ConnectPage),
    },
    {
      path: 'my-events',
      title: 'pages.myEvents.title',
      canActivate: [signedInOnly],
      loadComponent: () =>
        import('./features/my-events/my-events-page').then((m) => m.MyEventsPage),
    },
    {
      path: 'connected-apps',
      title: 'pages.connectedApps.title',
      canActivate: [signedInOnly],
      loadComponent: () =>
        import('./features/connected-apps/connected-apps-page').then((m) => m.ConnectedAppsPage),
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
      path: 'privacy',
      title: 'pages.privacy.title',
      loadComponent: () => import('./features/privacy/privacy-page').then((m) => m.PrivacyPage),
    },
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
      loadComponent: () => import('./features/manage/options-editor').then((m) => m.OptionsEditor),
    },
    ...devRoutes,
    {
      path: '**',
      title: 'pages.notFound.title',
      loadComponent: () =>
        import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
    },
  ];
}
