import type { Page } from '@playwright/test';

/**
 * The colours the screen shows inside a box, as `rgb(…)`: the screenshot's pixels, read by the
 * browser itself (it decodes the image), so what is measured is the drawing as it is shown.
 */
export async function coloursIn(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<string[]> {
  const shot = await page.screenshot({ clip: box });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to read the screenshot');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const colours = new Set<string>();
    for (let index = 0; index < data.length; index += 4) {
      colours.add(`rgb(${data.slice(index, index + 3).join(', ')})`);
    }
    return [...colours];
  }, shot.toString('base64'));
}
