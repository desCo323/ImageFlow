const { test, expect } = require('@playwright/test');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('opens ImageFlow as the dedicated test user', async ({ page }) => {
  test.skip(process.env.IMAGEFLOW_AUTH_TESTS !== '1', 'Authenticated live tests are opt-in.');

  const baseUrl = process.env.IMAGEFLOW_BASE_URL;
  const username = process.env.IMAGEFLOW_TEST_USER;
  const password = process.env.IMAGEFLOW_TEST_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error('IMAGEFLOW_BASE_URL, IMAGEFLOW_TEST_USER and IMAGEFLOW_TEST_PASSWORD are required.');
  }
  if (username !== 'albentest') {
    throw new Error('Authenticated ImageFlow tests may only run as albentest.');
  }

  await page.goto(`${baseUrl.replace(/\/$/, '')}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="user"], #user').first().fill(username);
  await page.locator('input[name="password"], #password').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });

  await page.goto(`${baseUrl.replace(/\/$/, '')}/apps/imageflow/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sortierjob anlegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Job anlegen' })).toBeVisible();
});
