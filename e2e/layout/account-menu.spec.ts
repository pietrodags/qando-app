// The account menu's trash ("Eliminar mi cuenta") as the mouse finds it: hidden until the pointer
// is over the email, then the wizard's grey trash, red and a little larger under the mouse, with
// nothing drawn behind it and its tooltip in red too, before it on the email's row, where it
// covers none of the menu's items and the trash stays shown with the mouse on it. The API is
// answered here, so this runs against any URL.
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
    .toEqual({ opacity: '1', colour: 'rgb(85, 85, 85)', background: nothing, transform: 'none' });

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

  // Before the trash, centred on its height, its stem reaching the trash's edge.
  const tip = await tooltip.evaluate((element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return { left, right, top, bottom };
  });
  const at = await trash.evaluate((element) => {
    const { left, top, bottom } = element.getBoundingClientRect();
    return { left, top, bottom };
  });
  expect(tip.right).toBeLessThan(at.left);
  expect(at.left - tip.right).toBeLessThanOrEqual(10);
  expect(Math.abs((tip.top + tip.bottom) / 2 - (at.top + at.bottom) / 2)).toBeLessThanOrEqual(1);
  // Over none of the menu's items.
  for (const item of await page.locator('app-account-menu .item').all()) {
    const box = await item.evaluate((element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return { top, bottom };
    });
    expect(box.top >= tip.bottom || box.bottom <= tip.top).toBe(true);
  }

  // With the mouse on the tip, to read it, the trash it speaks of is still there.
  await page.mouse.move(tip.left + 6, tip.top + 4, { steps: 8 });
  await expect(tooltip).toHaveText('Eliminar mi cuenta');
  await expect.poll(async () => (await look(trash)).opacity).toBe('1');
});
