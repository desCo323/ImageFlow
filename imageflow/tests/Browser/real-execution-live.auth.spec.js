const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const realPrefix = 'ImageFlow V1 Real';
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lYfJ4wAAAABJRU5ErkJggg==';

test('executes real copy, move, album and background cron safely as albentest', async ({ page }) => {
  test.skip(process.env.IMAGEFLOW_AUTH_TESTS !== '1', 'Authenticated live tests are opt-in.');
  test.skip(process.env.IMAGEFLOW_REAL_WRITE_TESTS !== '1', 'Real file-write tests are separately opt-in.');
  test.setTimeout(360000);

  const baseUrl = process.env.IMAGEFLOW_BASE_URL;
  const username = process.env.IMAGEFLOW_TEST_USER;
  const password = process.env.IMAGEFLOW_TEST_PASSWORD;
  if (!baseUrl || !username || !password) {
    throw new Error('IMAGEFLOW_BASE_URL, IMAGEFLOW_TEST_USER and IMAGEFLOW_TEST_PASSWORD are required.');
  }
  if (username !== 'albentest') {
    throw new Error('Real ImageFlow tests may only run as albentest.');
  }

  const root = baseUrl.replace(/\/$/, '');
  const stamp = Date.now();
  const runName = `${realPrefix} ${stamp}`;
  const runRoot = `/Photos/${runName}`;
  const sourceCopy = `${runRoot}/Quelle Kopieren`;
  const sourceMove = `${runRoot}/Quelle Verschieben`;
  const sourceAlbum = `${runRoot}/Quelle Album`;
  const sourceCron = `${runRoot}/Quelle Cron`;
  const targetCopy = `${runRoot}/Ziele Kopieren`;
  const targetMove = `${runRoot}/Ziele Verschieben`;
  const targetCron = `${runRoot}/Ziele Cron`;
  const copyDone = `${targetCopy}/Fertig`;
  const moveDone = `${targetMove}/Fertig`;
  const cronDone = `${targetCron}/Fertig`;
  const copyImage = `${sourceCopy}/copy.png`;
  const moveImage = `${sourceMove}/move.png`;
  const albumImage = `${sourceAlbum}/album.png`;
  const cronImage = `${sourceCron}/cron.png`;
  const jobIds = [];
  let previousSettings = null;

  try {
    await login(page, root, username, password);
    await page.goto(`${root}/apps/imageflow/?real=${stamp}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible({ timeout: 15000 });

    const health = await api(page, '/api/v1/health');
    expect(health.diagnostics?.isAdmin).toBe(true);
    previousSettings = (await api(page, '/api/v1/admin/settings')).settings;

    await cleanupJobs(page);
    await cleanupAlbums();
    await cleanupDavRealRoots(page, username);
    await deleteDavPath(page, username, runRoot);
    await prepareDavFolders(page, username, [runRoot, sourceCopy, sourceMove, sourceAlbum, sourceCron, targetCopy, targetMove, targetCron, copyDone, moveDone, cronDone]);
    await putDavImage(page, username, copyImage, 'copy');
    await putDavImage(page, username, moveImage, 'move');
    await putDavImage(page, username, albumImage, 'album');
    await putDavImage(page, username, cronImage, 'cron');

    await enableRealWritesThroughUi(page);

    const copyJob = await createJob(page, `${runName} Copy`, sourceCopy, 'copy', targetCopy, false);
    jobIds.push(copyJob.id);
    await assignFirstImage(page, copyJob.id, copyDone, 'Fertig');
    await processFromDashboard(page, copyJob.name);
    await expectDavExists(page, username, copyImage, true);
    await expectDavExists(page, username, `${copyDone}/copy.png`, true);

    const moveJob = await createJob(page, `${runName} Move`, sourceMove, 'move', targetMove, false);
    jobIds.push(moveJob.id);
    await assignFirstImage(page, moveJob.id, moveDone, 'Fertig');
    await processFromDashboard(page, moveJob.name);
    await expectDavExists(page, username, moveImage, false);
    await expectDavExists(page, username, `${moveDone}/move.png`, true);

    const albumTarget = await api(page, '/api/v1/targets', {
      method: 'POST',
      body: { mode: 'album', name: `${runName} Album` },
    });
    const albumJob = await createJob(page, `${runName} Album`, sourceAlbum, 'album', null, false);
    jobIds.push(albumJob.id);
    await assignFirstImage(page, albumJob.id, albumTarget.target.id, albumTarget.target.label, albumTarget.target.id);
    await processFromDashboard(page, albumJob.name);
    await expectAlbumContainsFile(albumTarget.target.id, albumImage);

    const cronJob = await createJob(page, `${runName} Cron`, sourceCron, 'copy', targetCron, true);
    jobIds.push(cronJob.id);
    await assignFirstImage(page, cronJob.id, cronDone, 'Fertig');
    await api(page, `/api/v1/jobs/${cronJob.id}/queue-execution`, { method: 'POST', body: { autoProcess: true } });
    await api(page, '/api/v1/admin/settings', {
      method: 'PUT',
      body: {
        realExecutionEnabled: true,
        backgroundProcessingEnabled: true,
        backgroundLowLoadOnly: false,
        backgroundMaxLoad1m: 128,
        quietHoursEnabled: false,
        quietHoursStart: '00:00',
        quietHoursEnd: '23:59',
      },
    });
    await expectOperationSettings(page, {
      realExecutionEnabled: true,
      backgroundProcessingEnabled: true,
      backgroundLowLoadOnly: false,
      backgroundMaxLoad1m: 128,
      quietHoursEnabled: false,
    });
    executeImageFlowBackgroundJob();
    await expectDavExists(page, username, `${cronDone}/cron.png`, true);

    const logs = await api(page, '/api/v1/logs?limit=500');
    const events = (logs.logs || []).map((entry) => entry.event);
    expect(events).toContain('queue_manual_run_started');
    expect(events).toContain('queue_background_run_started');
    expect(events).toContain('queue_execution_item_executed');

    const diagnostics = await api(page, '/api/v1/support/export');
    expect(diagnostics.settings.realExecutionEnabled).toBe(true);
    expect(Array.isArray(diagnostics.logs)).toBe(true);
  } finally {
    if (previousSettings) {
      await api(page, '/api/v1/admin/settings', { method: 'PUT', body: previousSettings }).catch(() => {});
    }
    forceSafeImageFlowConfig();
    for (const jobId of jobIds) {
      await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} }).catch(() => {});
    }
    await cleanupJobs(page).catch(() => {});
    await cleanupAlbums().catch(() => {});
    await cleanupDavRealRoots(page, username).catch(() => {});
    await deleteDavPath(page, username, runRoot).catch(() => {});
    await scanAlbentest();
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

async function enableRealWritesThroughUi(page) {
  await page.getByRole('button', { name: 'Betrieb' }).click();
  await expect(page.getByRole('heading', { name: 'Betrieb' })).toBeVisible();
  await page.getByLabel('Echte Dateiänderungen erlauben').check();
  await page.getByLabel('Automatisch im Hintergrund ablegen').uncheck();
  await page.getByLabel('Nur bei ruhigem Server laufen lassen').uncheck();
  await page.getByLabel('Maximale Serverlast').fill('128');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Betriebseinstellungen wurden gespeichert.')).toBeVisible({ timeout: 15000 });
  await expectOperationSettings(page, {
    realExecutionEnabled: true,
    backgroundProcessingEnabled: false,
    backgroundLowLoadOnly: false,
    backgroundMaxLoad1m: 128,
    quietHoursEnabled: false,
  });
}

async function expectOperationSettings(page, expected) {
  const keys = Object.keys(expected);
  await expect.poll(async () => {
    const settings = (await api(page, '/api/v1/admin/settings')).settings || {};
    return JSON.stringify(Object.fromEntries(keys.map((key) => [key, settings[key]])));
  }, { timeout: 15000, message: `ImageFlow operation settings should match ${JSON.stringify(expected)}` }).toBe(JSON.stringify(expected));
}

async function createJob(page, name, sourcePath, targetMode, targetPath, autoProcess) {
  const payload = await api(page, '/api/v1/jobs', {
    method: 'POST',
    body: {
      name,
      sourcePath,
      targetMode,
      targetPath,
      recursiveSource: false,
      safeMode: true,
      autoProcess,
      preloadMode: 'turbo',
      targetOrdering: 'alphabetical',
      hotkeys: 'number-row',
      customHotkeys: [],
    },
  });
  return payload.job;
}

async function assignFirstImage(page, jobId, targetPathOrId, targetLabel, albumId = null) {
  const state = await api(page, `/api/v1/jobs/${jobId}/sort-state?start=begin&limit=5`);
  const image = (state.nextImages || [])[0];
  if (!image) {
    throw new Error(`No image found for job ${jobId}`);
  }
  await api(page, `/api/v1/jobs/${jobId}/assign`, {
    method: 'POST',
    body: {
      sourcePath: image.path,
      fileId: image.fileId || null,
      fileName: image.name || 'Bild',
      mimeType: image.mimeType || 'image/png',
      hotkey: '1',
      target: albumId
        ? { id: String(albumId), label: targetLabel, path: null }
        : { id: targetPathOrId, label: targetLabel, path: targetPathOrId },
    },
  });
}

async function processFromDashboard(page, jobName) {
  await page.getByRole('button', { name: 'Übersicht' }).click();
  const row = page.locator('tr', { hasText: jobName });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: 'Ablage prüfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(dialog).toContainText('Dateiänderungen aktiv', { timeout: 15000 });
  const queueButton = dialog.locator('[data-action="confirm-queue-job"]');
  const processButton = dialog.locator('[data-action="process-job-now"]');
  await expect(queueButton).toBeEnabled({ timeout: 15000 });
  await queueButton.click();
  await expect(page.getByText(/Ablage wartet|Ablage darf|Ablage wurde/)).toBeVisible({ timeout: 15000 });
  await expect(processButton).toBeEnabled({ timeout: 15000 });
  await processButton.click();
  await expect(page.getByText(/Die vorgemerkte Ablage wurde abgelegt|Keine wartenden Bilder/)).toBeVisible({ timeout: 20000 });
  await dialog.getByRole('button', { name: 'Schließen' }).click();
}

async function cleanupJobs(page) {
  const payload = await api(page, '/api/v1/jobs');
  const jobs = (payload.jobs || []).filter((job) => String(job.name || '').startsWith(realPrefix));
  for (const job of jobs) {
    await api(page, `/api/v1/jobs/${job.id}/discard`, { method: 'POST', body: {} }).catch(() => {});
  }
}

async function cleanupDavRealRoots(page, username) {
  const payload = await api(page, `/api/v1/targets?mode=copy&path=/Photos&query=${encodeURIComponent(realPrefix)}&limit=200&ordering=alphabetical`);
  const folders = (payload.folders?.folders || payload.folders || []).filter((folder) => {
    const path = String(folder.path || '');
    return path.startsWith(`/Photos/${realPrefix}`);
  });
  const roots = [...new Set(folders.map((folder) => String(folder.path).split('/').slice(0, 3).join('/')))]
    .filter((path) => path.startsWith(`/Photos/${realPrefix}`))
    .sort((a, b) => b.length - a.length);
  for (const path of roots) {
    await deleteDavPath(page, username, path).catch(() => {});
  }
}

async function prepareDavFolders(page, username, displayPaths) {
  for (const displayPath of displayPaths) {
    await mkcolDavPath(page, username, displayPath);
  }
}

async function mkcolDavPath(page, username, displayPath) {
  const response = await davRequest(page, username, displayPath, { method: 'MKCOL' });
  if (![200, 201, 204, 405].includes(response.status)) {
    throw new Error(`Could not create test folder ${displayPath}: HTTP ${response.status}`);
  }
}

async function putDavImage(page, username, destinationPath, marker) {
  const response = await page.evaluate(async ({ username, destinationPath, pngBase64, marker }) => {
    const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
    const result = await fetch(davUrl(username, destinationPath), {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-ImageFlow-Real-Test': marker,
        requesttoken: window.OC.requestToken || '',
      },
      body: bytes,
      credentials: 'same-origin',
    });
    return { status: result.status };

    function davUrl(user, displayPath) {
      const encodedUser = encodeURIComponent(user);
      const encodedPath = String(displayPath || '/').split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
      return `${window.location.origin}/remote.php/dav/files/${encodedUser}/${encodedPath}`;
    }
  }, { username, destinationPath, pngBase64, marker });

  if (![200, 201, 204].includes(response.status)) {
    throw new Error(`Could not upload ${destinationPath}: HTTP ${response.status}`);
  }
}

async function expectDavExists(page, username, displayPath, expected) {
  await expect.poll(async () => {
    const response = await davRequest(page, username, displayPath, { method: 'GET' });
    return response.status !== 404;
  }, { timeout: 20000, message: `${displayPath} existence should be ${expected}` }).toBe(expected);
}

async function deleteDavPath(page, username, displayPath) {
  const response = await davRequest(page, username, displayPath, { method: 'DELETE' });
  if (![200, 202, 204, 207, 404].includes(response.status)) {
    throw new Error(`Could not delete test folder ${displayPath}: HTTP ${response.status}`);
  }
}

async function davRequest(page, username, displayPath, options = {}) {
  return page.evaluate(async ({ username, displayPath, options }) => {
    const encodedUser = encodeURIComponent(username);
    const encodedPath = String(displayPath || '/').split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
    const result = await fetch(`${window.location.origin}/remote.php/dav/files/${encodedUser}/${encodedPath}`, {
      method: options.method || 'GET',
      headers: { requesttoken: window.OC.requestToken || '' },
      credentials: 'same-origin',
    });
    return { ok: result.ok, status: result.status };
  }, { username, displayPath, options });
}

async function expectAlbumContainsFile(albumId, imagePath) {
  const sql = `
    SELECT COUNT(*) AS cnt
    FROM __PREFIX__photos_albums_files f
    JOIN __PREFIX__filecache c ON c.fileid = f.file_id
    WHERE f.album_id = ${Number(albumId)}
      AND c.path LIKE '%${sqlLikeLiteral(imagePath.replace(/^\//, ''))}'
  `;
  const count = Number(runSql(sql).trim() || '0');
  expect(count).toBeGreaterThan(0);
}

async function cleanupAlbums() {
  runSql(`
    DELETE f FROM __PREFIX__photos_albums_files f
    JOIN __PREFIX__photos_albums a ON a.album_id = f.album_id
    WHERE a.user = 'albentest' AND a.name LIKE '${realPrefix}%';
    DELETE FROM __PREFIX__photos_albums
    WHERE user = 'albentest' AND name LIKE '${realPrefix}%';
  `);
}

function executeImageFlowBackgroundJob() {
  runShell(`
    set -euo pipefail
    job_id=$(sudo -n -u www-data php /var/www/nextcloud/occ background-job:list --limit=1000 --output=json | php -r '$jobs=json_decode(stream_get_contents(STDIN), true); foreach($jobs as $job){ if(($job["class"]??"")==="OCA\\\\\\\\ImageFlow\\\\\\\\BackgroundJob\\\\\\\\QueueExecutionJob" || ($job["class"]??"")==="OCA\\\\ImageFlow\\\\BackgroundJob\\\\QueueExecutionJob"){ echo $job["id"]; exit; }} exit(2);')
    sudo -n -u www-data php /var/www/nextcloud/occ background-job:execute --force-execute "$job_id" >/dev/null
  `);
}

function forceSafeImageFlowConfig() {
  runShell(`
    sudo -n -u www-data php /var/www/nextcloud/occ config:app:set imageflow real_execution_enabled --value=0 >/dev/null
    sudo -n -u www-data php /var/www/nextcloud/occ config:app:set imageflow background_processing_enabled --value=0 >/dev/null
  `);
}

async function scanAlbentest() {
  runShell('sudo -n -u www-data php /var/www/nextcloud/occ files:scan albentest --quiet >/dev/null 2>&1 || true');
}

function runSql(sql) {
  return runShell(`
    set -euo pipefail
    defaults=$(mktemp)
    trap 'rm -f "$defaults"' EXIT
    php -r '
    $CONFIG=[]; include "/var/www/nextcloud/config/config.php";
    $dbhost=(string)($CONFIG["dbhost"] ?? "localhost"); $host=$dbhost; $port=null; $socket=null;
    if (str_contains($dbhost, ":")) { [$host,$tail]=explode(":", $dbhost, 2); if ($tail !== "" && ctype_digit($tail)) { $port=$tail; } elseif ($tail !== "") { $socket=$tail; } }
    echo "[client]\\n";
    echo "user=" . (string)($CONFIG["dbuser"] ?? "") . "\\n";
    echo "password=" . (string)($CONFIG["dbpassword"] ?? "") . "\\n";
    if ($host !== "") echo "host=$host\\n";
    if ($port !== null) echo "port=$port\\n";
    if ($socket !== null) echo "socket=$socket\\n";
    ' > "$defaults"
    chmod 600 "$defaults"
    db_name=$(php -r '$CONFIG=[]; include "/var/www/nextcloud/config/config.php"; echo (string)($CONFIG["dbname"] ?? "nextcloud");')
    prefix=$(php -r '$CONFIG=[]; include "/var/www/nextcloud/config/config.php"; echo (string)($CONFIG["dbtableprefix"] ?? "oc_");')
    mysql --defaults-extra-file="$defaults" --batch --skip-column-names "$db_name" -e "${sql.replaceAll('__PREFIX__', '${prefix}').replaceAll('"', '\\"')}"
  `);
}

function runShell(command) {
  return execFileSync('bash', ['-lc', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sqlLikeLiteral(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "''");
}
