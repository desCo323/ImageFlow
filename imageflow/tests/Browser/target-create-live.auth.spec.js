const { test, expect } = require('@playwright/test');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const smokePrefix = 'ImageFlow Ziel Live';

test('creates a folder target through the full live UI flow and shows it immediately', async ({ page }) => {
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

  const root = baseUrl.replace(/\/$/, '');
  const stamp = Date.now();
  const jobName = `${smokePrefix} ${stamp}`;
  const folderName = `${smokePrefix} Ordner ${stamp}`;
  const folderPath = `/Photos/${folderName}`;
  let jobId = null;

  try {
    await login(page, root, username, password);
    await page.goto(`${root}/apps/imageflow/?cacheBust=${stamp}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible({ timeout: 15000 });

    const health = await api(page, '/api/v1/health');
    expect(health.realExecutionEnabled).toBe(false);
    expect(health.backgroundProcessingEnabled).toBe(false);

    await cleanupSmokeJobs(page);
    await deleteDavPath(page, username, folderPath);

    await page.getByRole('button', { name: 'Flow anlegen' }).click();
    await page.getByLabel('Name').fill(jobName);
    await page.getByLabel('Bilderordner').fill('/Photos');
    await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
    await expect(page.getByLabel('Zielordner')).toHaveValue('/Photos');
    await page.getByRole('button', { name: 'Speichern & loslegen' }).click();
    await expect(page.getByRole('heading', { name: jobName })).toBeVisible({ timeout: 15000 });
    jobId = (await findJob(page, jobName)).id;
    await expect(page.getByText('/Photos', { exact: true })).toBeVisible({ timeout: 10000 });

    await createFolderTargetAndAssert(page, folderName, folderPath);
  } finally {
    if (jobId !== null) {
      await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} }).catch(() => {});
    }
    await deleteDavPath(page, username, folderPath).catch(() => {});
    await cleanupSmokeJobs(page).catch(() => {});
  }
});

test('falls back from a missing live target folder before creating a folder target', async ({ page }) => {
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

  const root = baseUrl.replace(/\/$/, '');
  const stamp = Date.now();
  const jobName = `${smokePrefix} Fehlender Zielordner ${stamp}`;
  const missingTargetPath = `/Photos/ImageFlow fehlt ${stamp}/Nicht vorhanden`;
  const folderName = `${smokePrefix} Fallback ${stamp}`;
  const folderPath = `/Photos/${folderName}`;
  let jobId = null;

  try {
    await login(page, root, username, password);
    await page.goto(`${root}/apps/imageflow/?cacheBust=${stamp}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible({ timeout: 15000 });

    const health = await api(page, '/api/v1/health');
    expect(health.realExecutionEnabled).toBe(false);
    expect(health.backgroundProcessingEnabled).toBe(false);

    await cleanupSmokeJobs(page);
    await deleteDavPath(page, username, folderPath);

    const created = await api(page, '/api/v1/jobs', {
      method: 'POST',
      body: {
        name: jobName,
        sourcePath: '/Photos',
        targetMode: 'copy',
        targetPath: missingTargetPath,
        recursiveSource: false,
        safeMode: true,
        autoProcess: false,
        preloadMode: 'balanced',
        targetOrdering: 'alphabetical',
        hotkeys: 'number-row',
        customHotkeys: [],
      },
    });
    jobId = created.job.id;

    await page.goto(`${root}/apps/imageflow/jobs/${jobId}?cacheBust=${stamp}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: jobName })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`Der Zielordner ${missingTargetPath} wurde nicht gefunden. Ich zeige /Photos.`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('/Photos', { exact: true })).toBeVisible({ timeout: 10000 });

    await createFolderTargetAndAssert(page, folderName, folderPath);
  } finally {
    if (jobId !== null) {
      await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} }).catch(() => {});
    }
    await deleteDavPath(page, username, folderPath).catch(() => {});
    await cleanupSmokeJobs(page).catch(() => {});
  }
});

async function login(page, root, username, password) {
  await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="user"], #user').first().fill(username);
  await page.locator('input[name="password"], #password').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
}

async function api(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(window.OC.generateUrl(`/apps/imageflow${path}`), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        requesttoken: window.OC.requestToken || '',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }, { path, options });
}

async function cleanupSmokeJobs(page) {
  const payload = await api(page, '/api/v1/jobs');
  const jobs = (payload.jobs || []).filter((job) => String(job.name || '').startsWith(smokePrefix));
  for (const job of jobs) {
    await api(page, `/api/v1/jobs/${job.id}/discard`, { method: 'POST', body: {} }).catch(() => {});
  }
}

async function findJob(page, jobName) {
  const payload = await api(page, '/api/v1/jobs');
  const job = (payload.jobs || []).find((item) => item.name === jobName);
  if (!job) {
    throw new Error(`Created job was not returned by the jobs API: ${jobName}`);
  }
  return job;
}

async function createFolderTargetAndAssert(page, folderName, folderPath) {
  await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
  await expect(page.getByPlaceholder('Neuer Ordner')).toBeFocused();
  await page.getByPlaceholder('Neuer Ordner').fill(folderName);
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();

  await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderName}` })).toBeVisible({ timeout: 15000 });

  await page.getByLabel('Ziel suchen').fill(folderName);
  await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderName}` })).toBeVisible({ timeout: 15000 });

  const targetSearch = await api(page, `/api/v1/targets?mode=copy&path=${encodeURIComponent('/Photos')}&query=${encodeURIComponent(folderName)}&limit=20&ordering=alphabetical`);
  const folders = targetSearch.folders?.folders || [];
  expect(folders.some((folder) => folder.path === folderPath)).toBe(true);
}

async function deleteDavPath(page, username, displayPath) {
  const response = await page.evaluate(async ({ username, displayPath }) => {
    const encodedPath = String(displayPath || '/')
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const encodedUser = encodeURIComponent(username);
    const davUrl = `${window.location.origin}/remote.php/dav/files/${encodedUser}/${encodedPath}`;
    const result = await fetch(davUrl, {
      method: 'DELETE',
      headers: {
        requesttoken: window.OC.requestToken || '',
      },
      credentials: 'same-origin',
    });
    return { ok: result.ok, status: result.status };
  }, { username, displayPath });

  if (![200, 202, 204, 207, 404].includes(response.status)) {
    throw new Error(`Could not delete test folder ${displayPath}: HTTP ${response.status}`);
  }
}
