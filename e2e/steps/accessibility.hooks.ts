import { createBdd } from 'playwright-bdd';
import { expectAccessible } from '../accessibility.js';
import { test } from './fixtures.js';

const { AfterStep } = createBdd(test);

// After every step, each page the scenario looks at (its own, and the one it votes on in another
// browser) is checked with axe against WCAG 2.2 AA, so every state the scenarios reach is checked
// at each width: a form, a question, an error, a thank-you. A page whose markup has not changed
// since its last check is not checked again. A step that passes through a state and leaves it
// (a dialog it opens and closes) checks that state itself.
AfterStep(async ({ page, myVote }) => {
  for (const shown of new Set([page, myVote.page])) {
    await expectAccessible(shown);
  }
});
