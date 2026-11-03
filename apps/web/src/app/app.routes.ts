import type { Routes } from '@angular/router';

// Sitemap views (docs/sitemap.md). `title` is a catalogue key; until each story is built,
// its view is the placeholder page.
const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/create/create-page').then((m) => m.CreatePage),
  },
  { path: 'sign-in', title: 'pages.signIn.title', loadComponent: placeholder },
  { path: 'my-events', title: 'pages.myEvents.title', loadComponent: placeholder },
  { path: 'profile', title: 'pages.profile.title', loadComponent: placeholder },
  { path: 'vote/:eventId', title: 'pages.vote.title', loadComponent: placeholder },
  { path: 'vote/:eventId/my-vote', title: 'pages.myVote.title', loadComponent: placeholder },
  { path: 'results/:resultsId', title: 'pages.results.title', loadComponent: placeholder },
  { path: 'manage/:eventId', title: 'pages.manage.title', loadComponent: placeholder },
  {
    path: 'manage/:eventId/options',
    title: 'pages.manageOptions.title',
    loadComponent: placeholder,
  },
  {
    path: '**',
    title: 'pages.notFound.title',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
