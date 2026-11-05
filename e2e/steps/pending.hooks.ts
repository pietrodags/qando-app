import { createBdd } from 'playwright-bdd';

const { Before } = createBdd();

// Scenarios not built yet (@wip) or waiting on a later milestone (@m2, @m3) run as expected to
// fail: while they fail the run stays green, and once one passes Playwright reports "expected to
// fail, but passed", so the forgotten tag turns the run red instead of hiding a working scenario.
Before({ tags: '@wip or @m2 or @m3' }, ({ $testInfo }) => {
  $testInfo.fail();
});
