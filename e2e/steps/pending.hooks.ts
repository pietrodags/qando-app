import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { Before } = createBdd(test);

// Scenarios not built yet (@wip) or waiting on a later milestone (@m2, @m3) run as expected to
// fail: while they fail the run stays green, and once one passes Playwright reports "expected to
// fail, but passed", so the forgotten tag turns the run red instead of hiding a working scenario.
Before({ tags: '@wip or @m2 or @m3' }, ({ $testInfo }) => {
  $testInfo.fail();
});

// Scenarios that wait for a time no scenario can move (@system-clock): the sign-in library reads
// a code's expiry from the system's clock, never from the API's. They are not run here; the
// API's integration tests check them, moving the system's clock itself.
Before({ tags: '@system-clock' }, ({ $testInfo }) => {
  $testInfo.skip();
});
