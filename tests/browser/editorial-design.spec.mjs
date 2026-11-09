import { test, expect } from '@playwright/test';

test('editorial workbench is local, readable, and uses the unified visual system', async ({ page }) => {
  const outside = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) outside.push(request.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.CommentMasterLinear?.version === '7.3.1');
  await expect(page.locator('#linear-section-file')).toBeVisible();
  await expect(page.locator('.linear-sidebar')).toBeVisible();
  await expect(page.locator('#linear-download-grid, .linear-download-grid').first()).toBeVisible();
  await expect(page.locator('.linear-download-grid > button')).toHaveCount(2);

  const visual = await page.evaluate(async () => {
    const fontSamples = await Promise.all([
      document.fonts.load('400 16px "CM Plex Sans"'),
      document.fonts.load('500 24px "CM Source Serif"'),
      document.fonts.load('400 12px "CM Plex Mono"')
    ]);
    return {
      fonts: fontSamples.map((sample) => sample.length),
      page: getComputedStyle(document.body).backgroundColor,
      heading: getComputedStyle(document.querySelector('.linear-heading h2')).fontFamily,
      headerImage: getComputedStyle(document.querySelector('.app-header')).backgroundImage,
      corner: getComputedStyle(document.querySelector('.linear-section')).borderRadius
    };
  });
  expect(visual.fonts.every((count) => count > 0)).toBe(true);
  expect(visual.page).toBe('rgb(244, 241, 234)');
  expect(visual.heading).toContain('CM Source Serif');
  expect(visual.headerImage).toBe('none');
  expect(visual.corner).toBe('4px');
  expect(outside).toEqual([]);
});

test('editorial workflow and exports fit phone, tablet, and desktop widths', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.CommentMasterLinear?.version === '7.3.1');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 860 });
    const sizes = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(sizes.documentWidth, 'Horizontal overflow at ' + width + 'px').toBeLessThanOrEqual(sizes.viewportWidth + 1);
    await expect(page.locator('#linear-section-file summary')).toBeVisible();
    await expect(page.locator('#linear-download-document')).toBeAttached();
    await expect(page.locator('#linear-download-summary')).toBeAttached();
  }
});
