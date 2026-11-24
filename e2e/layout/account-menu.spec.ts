// The account menu's trash ("Eliminar mi cuenta") as the mouse finds it: hidden until the pointer
// is over the email, then the wizard's grey trash, red and a little larger under the mouse, with
// nothing drawn behind it and its tooltip in red too. The API is answered here, so this runs
// against any URL.
import { expect, type Locator, test } from '@playwright/test';

// Transitions end at once, so the trash's look is read where it ends.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

interface Look {
  readonly opacity: string;
  readonly colour: string;
  readonly background: string;
  readonly transform: string;
}

function look(trash: Locator): Promise<Look> {
  return trash.evaluate((element) => {
    const { opacity, color, backgroundColor, transform } = getComputedStyle(element);
    return { opacity, colour: color, background: backgroundColor, transform };
  });
}

const nothing = 'rgba(0, 0, 0, 0)';

test('the trash beside the email is the wizard’s: grey, red under the mouse, no circle, its tooltip red', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout desktop', 'once, with the laptop');
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
  );
  await page.goto('/');
  await page.locator('app-account-menu button.account').click();
  const trash = page.getByRole('button', { name: 'Eliminar mi cuenta' });

  await page.mouse.move(640, 600);
  await expect.poll(async () => (await look(trash)).opacity).toBe('0');

  await page.getByText('ana@example.com').hover();
  await expect
    .poll(() => look(trash))
    .toEqual({ opacity: '1', colour: 'rgb(68, 68, 68)', background: nothing, transform: 'none' });

  await trash.hover();
  await expect
    .poll(() => look(trash))
    .toEqual({
      opacity: '1',
      colour: 'rgb(251, 0, 0)',
      background: nothing,
      transform: 'matrix(1.1, 0, 0, 1.1, 0, 0)',
    });
  // The red of text: the trash's own is too light for words this small.
  // Hidden from screen readers, which hear the trash's name.
  const tooltip = page.locator('app-tooltip');
  await expect(tooltip).toHaveText('Eliminar mi cuenta');
  await expect(tooltip).toHaveCSS('color', 'rgb(230, 0, 0)');
});
