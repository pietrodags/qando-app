import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { AfterStep } = createBdd(test);

// After every step, each page the scenario looks at (its own, and the one it votes on in another
// browser) is checked with axe against WCAG 2.2 AA, so every state the scenarios reach is checked
// at each width: a form, a question, an error, a thank-you. A page whose markup has not changed
// since its last check is not checked again.
AfterStep(async ({ page, myVote, accessibility }) => {
  for (const shown of new Set([page, myVote.page])) {
    await accessibility.check(shown);
  }
});
