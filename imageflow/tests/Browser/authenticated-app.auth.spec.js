const { test, expect } = require('@playwright/test');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('creates and discards a job as the dedicated test user', async ({ page }) => {
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
  await discardSmokeJobs(page);

  const jobName = `ImageFlow Smoke ${Date.now()}`;
  await page.getByLabel('Name').fill(jobName);
  await page.getByLabel('Quellordner').fill('/Photos');
  await page.getByRole('button', { name: 'Job anlegen' }).click();
  await expect(page.getByText(jobName)).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  const row = page.locator('tr', { hasText: jobName });
  await row.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByText(jobName)).toHaveCount(0);
});

async function discardSmokeJobs(page) {
  for (let index = 0; index < 10; index += 1) {
    const row = page.locator('tr', { hasText: 'ImageFlow Smoke' }).first();
    if ((await row.count()) === 0) {
      return;
    }

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await row.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(row).toHaveCount(0);
  }

  throw new Error('Could not clean up existing ImageFlow Smoke jobs.');
}
