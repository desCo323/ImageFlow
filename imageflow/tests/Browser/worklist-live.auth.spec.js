const { test, expect } = require('@playwright/test');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const smokePrefix = 'ImageFlow Worklist Smoke';

test('previews and queues a worklist without file writes as albentest', async ({ page }) => {
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

  let jobId = null;
  try {
    await login(page, baseUrl, username, password);
    await page.goto(`${baseUrl.replace(/\/$/, '')}/apps/imageflow/`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible({ timeout: 15000 });
    await cleanupSmokeJobs(page);

    const jobName = `${smokePrefix} ${Date.now()}`;
    await page.getByLabel('Name').fill(jobName);
    await page.getByLabel('Quellordner').fill('/Photos');
    await page.getByLabel('Sortierart').selectOption('copy');
    await page.getByLabel('Zielordner').fill('/Photos');
    await page.getByRole('button', { name: 'Flow starten' }).click();
    await expect(page.getByText(jobName)).toBeVisible({ timeout: 10000 });

    const job = await findJob(page, jobName);
    jobId = job.id;

    const sortState = await api(page, `/api/v1/jobs/${jobId}/sort-state?start=begin&limit=5`);
    const image = (sortState.nextImages || [])[0];
    if (!image || !image.path) {
      throw new Error('No readable image was available in /Photos for albentest.');
    }

    await api(page, `/api/v1/jobs/${jobId}/assign`, {
      method: 'POST',
      body: {
        sourcePath: image.path,
        fileId: image.fileId || null,
        fileName: image.name || 'Bild',
        mimeType: image.mimeType || 'image/unknown',
        hotkey: '1',
        target: { id: '/Photos', label: 'Photos', path: '/Photos' },
      },
    });

    const preview = await api(page, `/api/v1/jobs/${jobId}/worklist-preview?limit=10`);
    expect(preview.executionMode).toBe('dry-run-only');
    expect(preview.canQueue).toBe(true);
    expect(preview.summary.total).toBeGreaterThan(0);
    expect(preview.summary.errors).toBe(0);

    const row = page.locator('tr', { hasText: jobName });
    await row.getByRole('button', { name: 'Ablage pruefen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ablage pruefen' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('Dateioperationen gesperrt')).toBeVisible();
    await dialog.getByRole('button', { name: 'Ablage vormerken' }).click();
    await expect(page.getByText('Ablage wurde vorgemerkt')).toBeVisible({ timeout: 10000 });

	    const afterQueue = await api(page, `/api/v1/jobs/${jobId}/worklist-preview?limit=10`);
	    expect(afterQueue.summary.queued).toBeGreaterThan(0);
	    expect(afterQueue.executionMode).toBe('dry-run-only');
	    expect(afterQueue.backgroundMode).toBe('manual-only');
	    let processNowBlocked = false;
	    try {
	      await api(page, `/api/v1/jobs/${jobId}/process-now`, { method: 'POST', body: { limit: 1 } });
	    } catch (error) {
	      processNowBlocked = /deaktiviert|HTTP 409/.test(error.message);
	    }
	    expect(processNowBlocked).toBe(true);

	    await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} });
    jobId = null;
    await cleanupSmokeJobs(page);
  } finally {
    if (jobId !== null) {
      await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} }).catch(() => {});
    }
  }
});

async function login(page, baseUrl, username, password) {
  const root = baseUrl.replace(/\/$/, '');
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

async function findJob(page, jobName) {
  const payload = await api(page, '/api/v1/jobs');
  const job = (payload.jobs || []).find((item) => item.name === jobName);
  if (!job) {
    throw new Error(`Created job was not returned by the jobs API: ${jobName}`);
  }
  return job;
}

async function cleanupSmokeJobs(page) {
  const payload = await api(page, '/api/v1/jobs');
  const jobs = (payload.jobs || []).filter((job) => String(job.name || '').startsWith(smokePrefix));
  for (const job of jobs) {
    await api(page, `/api/v1/jobs/${job.id}/discard`, { method: 'POST', body: {} }).catch(() => {});
  }
}
