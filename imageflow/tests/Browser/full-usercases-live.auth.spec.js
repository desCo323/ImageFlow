const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const livePrefix = 'ImageFlow 50er Browser';

test('executes 50+ real browser user scenarios safely as albentest', async ({ page }) => {
  test.skip(process.env.IMAGEFLOW_AUTH_TESTS !== '1', 'Authenticated live tests are opt-in.');
  test.setTimeout(360000);

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
  const matrixRoot = `/Photos/${livePrefix} ${stamp}`;
  const matrixName = `${livePrefix} ${stamp}`;
  const sourcePath = `${matrixRoot}/Quelle`;
  const nestedSourcePath = `${sourcePath}/Unterordner`;
  const targetPath = `${matrixRoot}/Ziele`;
  const reportsDir = process.env.IMAGEFLOW_SCREENSHOT_DIR || 'test-results/imageflow-live';
  const jobName = `${livePrefix} Flow ${stamp}`;
  const renamedJobName = `${livePrefix} Umbenannt ${stamp}`;
  const duplicateName = `${renamedJobName} Duplikat`;
  const folderA = 'A Familie';
  const folderB = 'B Reisen';
  const folderC = 'C Auswahl';
  const completed = [];
  let jobId = null;

  const scenario = async (name, callback) => {
    await test.step(`${String(completed.length + 1).padStart(2, '0')} ${name}`, async () => {
      await callback();
      completed.push(name);
    });
  };

  try {
    await scenario('Anmeldung mit dem erlaubten Testkonto funktioniert', async () => {
      await login(page, root, username, password);
      await page.goto(`${root}/apps/imageflow/?cacheBust=${stamp}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible({ timeout: 15000 });
    });

    await scenario('Schutzstatus sperrt echte Dateiänderungen', async () => {
      await expect(page.getByLabel('Schutzstatus')).toContainText('Dateiänderungen gesperrt');
      const health = await api(page, '/api/v1/health');
      expect(health.realExecutionEnabled).toBe(false);
      expect(health.backgroundProcessingEnabled).toBe(false);
    });

    await scenario('Entwicklungsflächen sind im normalen Betrieb nicht sichtbar', async () => {
      await expect(page.getByLabel('Systemprüfung')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Protokoll' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ereignisse' })).toHaveCount(0);
    });

    await scenario('alte Testdaten werden vor dem Lauf entfernt', async () => {
      await cleanupLiveJobs(page);
      await cleanupLiveFavorites(page);
      await deleteDavPath(page, username, matrixRoot);
      await expect.poll(async () => (await api(page, '/api/v1/jobs')).jobs.filter((job) => String(job.name || '').startsWith(livePrefix)).length).toBe(0);
    });

    await scenario('Testordner und Testbilder werden real über Nextcloud-Dateien vorbereitet', async () => {
      await prepareDavFolders(page, username, [matrixRoot, sourcePath, nestedSourcePath, targetPath, `${targetPath}/${folderA}`, `${targetPath}/${folderB}`]);
      await uploadGeneratedImages(page, username, sourcePath, 49);
      await uploadGeneratedImages(page, username, nestedSourcePath, 4, 'nested');
    });

    await scenario('Flow-anlegen-Schaltfläche fokussiert das Formular', async () => {
      await page.goto(`${root}/apps/imageflow/?cacheBust=${stamp + 1}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Flow anlegen' }).click();
      await expect(page.getByLabel('Name')).toBeEditable();
      await page.getByLabel('Name').fill('Fokusprüfung');
      await expect(page.getByLabel('Name')).toHaveValue('Fokusprüfung');
    });

    await scenario('Kopiermodus zeigt den Zielordner', async () => {
      await page.getByLabel('Name').fill(jobName);
      await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
      await expect(page.getByLabel('Zielordner')).toBeVisible();
    });

    await scenario('Bilderordner kann über den Ordnerdialog gewählt werden', async () => {
      await chooseFolderFromPicker(page, 'sourcePath', [matrixName, 'Quelle']);
      await expect(page.getByLabel('Bilderordner')).toHaveValue(sourcePath);
    });

    await scenario('Zielordner kann über den Ordnerdialog gewählt werden', async () => {
      await chooseFolderFromPicker(page, 'targetPath', [matrixName, 'Ziele']);
      await expect(page.getByLabel('Zielordner')).toHaveValue(targetPath);
    });

    await scenario('Unterordner können für die Bildrunde eingeschaltet werden', async () => {
      await page.getByLabel('Unterordner mit einbeziehen').check();
      await expect(page.getByLabel('Unterordner mit einbeziehen')).toBeChecked();
    });

    await scenario('sicherer Modus bleibt eingeschaltet', async () => {
      await expect(page.getByLabel('Mit Prüfsummen extra sicher prüfen')).toBeChecked();
    });

    await scenario('Automatik kann vorgemerkt werden, ohne echte Ablage zu starten', async () => {
      await page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
      await expect(page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist')).toBeChecked();
    });

    await scenario('Turbo-Vorschau und alphabetische Ziele werden gespeichert', async () => {
      await page.getByLabel('Vorschau laden').selectOption('turbo');
      await page.getByLabel('Ziel-Reihenfolge').selectOption('alphabetical');
      await expect(page.getByLabel('Vorschau laden')).toHaveValue('turbo');
      await expect(page.getByLabel('Ziel-Reihenfolge')).toHaveValue('alphabetical');
    });

    await scenario('Tastenbelegung kann auf Buchstaben umgestellt werden', async () => {
      await page.getByLabel('Tastenbelegung').selectOption('letters');
      await expect(page.getByLabel('Tastenbelegung')).toHaveValue('letters');
    });

    await scenario('Flow lässt sich speichern und direkt öffnen', async () => {
      await page.getByRole('button', { name: 'Speichern & loslegen' }).click();
      await expect(page.getByRole('heading', { name: jobName })).toBeVisible({ timeout: 20000 });
      const job = await findJob(page, jobName);
      jobId = job.id;
    });

    await scenario('Sortierkopf zeigt kompakte Flow-Informationen', async () => {
      await expect(page.locator('.imageflow-job-head')).toContainText(jobName);
      await expect(page.locator('.imageflow-job-head')).toContainText(sourcePath);
      await expect(page.locator('.imageflow-job-head')).toContainText('mit Unterordnern');
    });

    await scenario('Fortschritt startet in einer neuen Runde bei null', async () => {
      await expect(page.getByLabel('Flow-Fortschritt')).toContainText(/0\/\d+ entschieden/);
      await expect(page.getByLabel('Flow-Fortschritt')).toContainText('0%');
    });

    await scenario('Filmstreifen zeigt nur Bilder ohne sichtbare Beschriftung', async () => {
      await expect(page.getByLabel('Vorgeladene Bilder')).toBeVisible();
      await expect(page.locator('.imageflow-filmstrip')).not.toContainText('Filmstreifen');
      await expect(page.locator('.imageflow-filmstrip')).not.toContainText('von ');
      expect(await page.locator('.imageflow-thumb').count()).toBeGreaterThanOrEqual(3);
    });

    await scenario('genau ein Vorschaubild ist aktiv markiert', async () => {
      await expect(page.locator('.imageflow-thumb.is-active')).toHaveCount(1);
    });

    await scenario('Pfeil rechts wechselt ruckfrei zum nächsten Bild', async () => {
      const before = await page.locator('.imageflow-photo-meta strong').innerText();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.imageflow-photo-meta strong')).not.toHaveText(before);
    });

    await scenario('Pfeil links kehrt zum vorherigen Bild zurück', async () => {
      const before = await page.locator('.imageflow-photo-meta strong').innerText();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.imageflow-photo-meta strong')).not.toHaveText(before);
    });

    await scenario('Klick auf eine Miniatur setzt das Hauptbild', async () => {
      const thirdThumb = page.locator('.imageflow-thumb').nth(2);
      const label = await thirdThumb.getAttribute('aria-label');
      await thirdThumb.click();
      await expect(page.locator('.imageflow-photo-meta strong')).toHaveText(label || '');
    });

    await scenario('große Bildmenge hält den Puffer begrenzt', async () => {
      for (let index = 0; index < 15; index += 1) {
        await page.keyboard.press('ArrowRight');
      }
      const buffered = Number(await page.locator('#imageflow-app').getAttribute('data-buffered-images'));
      expect(buffered).toBeLessThanOrEqual(32);
    });

    await scenario('nächste Vorschauseite kann per Filmstreifen-Taste geöffnet werden', async () => {
      await page.getByRole('button', { name: 'Nächste Vorschaubilder' }).click();
      await expect(page.locator('.imageflow-photo-meta strong')).toContainText('imageflow-live-');
    });

    await scenario('vorherige Vorschauseite kann wieder geöffnet werden', async () => {
      await page.getByRole('button', { name: 'Vorherige Vorschaubilder' }).click();
      await expect(page.locator('.imageflow-photo-meta strong')).toContainText('imageflow-live-');
    });

    await scenario('Zielsuche findet einen vorhandenen Ordner', async () => {
      await page.getByLabel('Ziel suchen').fill('Familie');
      await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderA}` })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderB}` })).toHaveCount(0);
    });

    await scenario('Zielsuche lässt sich leeren', async () => {
      await page.getByRole('button', { name: 'Suche leeren' }).click();
      await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderB}` })).toBeVisible({ timeout: 10000 });
    });

    await scenario('leere Zielsuche zeigt eine verständliche Meldung', async () => {
      await page.getByLabel('Ziel suchen').fill('zz-kein-ziel');
      await expect(page.getByText('Kein Ziel passt zu "zz-kein-ziel".')).toBeVisible({ timeout: 10000 });
    });

    await scenario('Ordner-anlegen meldet fehlenden Namen sauber', async () => {
      await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
      await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
      await expect(page.getByText('Bitte gib dem neuen Ziel einen Namen.')).toBeVisible();
    });

    await scenario('Ordner-anlegen legt den Ordner real an und schließt das Feld', async () => {
      await page.getByPlaceholder('Neuer Ordner').fill(folderC);
      await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
      await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible({ timeout: 15000 });
      await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderC}` })).toBeVisible({ timeout: 15000 });
    });

    await scenario('neu angelegter Ordner bleibt über Suche auffindbar', async () => {
      await page.getByLabel('Ziel suchen').fill(folderC);
      await expect(page.getByRole('button', { name: `Als Schnellziel merken: ${folderC}` })).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: 'Suche leeren' }).click();
    });

    await scenario('neu angelegter Ordner existiert auch in der Ziel-API', async () => {
      const payload = await api(page, `/api/v1/targets?mode=copy&path=${encodeURIComponent(targetPath)}&query=${encodeURIComponent(folderC)}&limit=20&ordering=alphabetical`);
      const folders = payload.folders?.folders || [];
      expect(folders.some((folder) => folder.path === `${targetPath}/${folderC}`)).toBe(true);
    });

    await scenario('Schnellziel kann aus einem Zielordner angelegt werden', async () => {
      await page.getByRole('button', { name: `Als Schnellziel merken: ${folderC}` }).click();
      await expect(page.getByText('Schnellziel wurde hinzugefügt.')).toBeVisible();
      await expect(page.locator('.imageflow-favorite-list')).toContainText(folderC);
    });

    await scenario('doppeltes Schnellziel wird erkannt', async () => {
      await page.getByRole('button', { name: `Als Schnellziel merken: ${folderC}` }).click();
      await expect(page.getByText('Schnellziel ist schon da.')).toBeVisible();
    });

    await scenario('Schnellziel kann entfernt werden', async () => {
      await page.getByRole('button', { name: `Schnellziel entfernen: ${folderC}` }).click();
      await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: folderC })).toHaveCount(0);
    });

    await scenario('Schnellziel für bestehenden Ordner kann angelegt werden', async () => {
      await page.getByRole('button', { name: `Als Schnellziel merken: ${folderA}` }).click();
      await expect(page.locator('.imageflow-favorite-list')).toContainText(folderA);
    });

    await scenario('Klick auf Schnellziel merkt eine Ablage vor und geht weiter', async () => {
      const before = await page.locator('.imageflow-photo-meta strong').innerText();
      await page.locator('.imageflow-favorite', { hasText: folderA }).click();
      await expect(page.getByText(`Entschieden: ${folderA}`)).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.imageflow-photo-meta strong')).not.toHaveText(before);
    });

    await scenario('Rückgängig nimmt die letzte Entscheidung zurück', async () => {
      await page.getByRole('button', { name: 'Rückgängig' }).click();
      await expect(page.getByText('Letzte Entscheidung wurde zurückgenommen.')).toBeVisible({ timeout: 10000 });
    });

    await scenario('direkter Klick auf Zielordner merkt eine Ablage vor', async () => {
      await page.locator('.imageflow-target', { hasText: folderB }).click();
      await expect(page.getByText(`Entschieden: ${folderB}`)).toBeVisible({ timeout: 10000 });
    });

    await scenario('Leertaste überspringt das aktuelle Bild', async () => {
      await page.keyboard.press(' ');
      await expect(page.getByText('Weiter zum nächsten Bild.')).toBeVisible({ timeout: 10000 });
    });

    await scenario('Taste 0 überspringt ebenfalls', async () => {
      await page.keyboard.press('0');
      await expect(page.getByText('Weiter zum nächsten Bild.')).toBeVisible({ timeout: 10000 });
    });

    await scenario('Strg+Z funktioniert nach Tastaturentscheidung', async () => {
      await page.locator('.imageflow-favorite', { hasText: folderA }).click();
      await expect(page.getByText(`Entschieden: ${folderA}`)).toBeVisible({ timeout: 10000 });
      await page.locator('.imageflow-photo-stage').click();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
      await expect(page.getByText('Letzte Entscheidung wurde zurückgenommen.')).toBeVisible({ timeout: 10000 });
    });

    await scenario('Von vorn ansehen setzt den sichtbaren Fortschritt auf 0', async () => {
      await page.getByRole('button', { name: 'Von vorn ansehen' }).click();
      await expect(page.getByLabel('Flow-Fortschritt')).toContainText(/0\/\d+ entschieden/, { timeout: 15000 });
      await expect(page.getByLabel('Flow-Fortschritt')).toContainText('0%');
    });

    await scenario('Offene Bilder kann aus der Kopfzeile gestartet werden', async () => {
      await page.getByRole('button', { name: 'Offene Bilder' }).click();
      await expect(page.getByRole('heading', { name: jobName })).toBeVisible({ timeout: 15000 });
    });

    await scenario('Zurück führt in die Flow-Übersicht', async () => {
      await page.getByRole('button', { name: 'Zurück' }).click();
      await expect(page.getByRole('heading', { name: 'Deine Flows' })).toBeVisible({ timeout: 15000 });
      await expect(page.locator('tr', { hasText: jobName })).toBeVisible();
    });

    await scenario('Flow kann pausiert werden', async () => {
      await page.locator('tr', { hasText: jobName }).getByRole('button', { name: 'Pausieren' }).click();
      await expect(page.locator('tr', { hasText: jobName })).toContainText('Pausiert');
    });

    await scenario('pausierter Flow kann fortgesetzt werden', async () => {
      await page.locator('tr', { hasText: jobName }).getByRole('button', { name: 'Fortsetzen' }).click();
      await expect(page.locator('tr', { hasText: jobName })).toContainText('In Arbeit');
    });

    await scenario('Bearbeiten kann abgebrochen werden', async () => {
      await page.locator('tr', { hasText: jobName }).getByRole('button', { name: 'Bearbeiten' }).click();
      await expect(page.getByRole('heading', { name: 'Flow bearbeiten' })).toBeVisible();
      await page.getByRole('button', { name: 'Bearbeiten abbrechen' }).click();
      await expect(page.getByRole('heading', { name: 'Neuen Flow vorbereiten' })).toBeVisible();
    });

    await scenario('Bearbeiten kann den Namen ändern', async () => {
      await page.locator('tr', { hasText: jobName }).getByRole('button', { name: 'Bearbeiten' }).click();
      await page.getByLabel('Name').fill(renamedJobName);
      await page.getByRole('button', { name: 'Änderungen speichern' }).click();
      await expect(page.locator('tr', { hasText: renamedJobName })).toBeVisible({ timeout: 10000 });
    });

    await scenario('Flow kann dupliziert werden', async () => {
      await page.locator('tr', { hasText: renamedJobName }).getByRole('button', { name: 'Duplizieren' }).click();
      await expect(page.locator('tr', { hasText: duplicateName })).toBeVisible({ timeout: 10000 });
    });

    await scenario('duplizierter Flow kann verworfen werden', async () => {
      page.once('dialog', async (dialog) => dialog.accept());
      await page.locator('tr', { hasText: duplicateName }).getByRole('button', { name: 'Flow verwerfen' }).click();
      await expect(page.locator('tr', { hasText: duplicateName })).toHaveCount(0);
    });

    await scenario('Ablageprüfung öffnet ohne echte Dateiänderungen', async () => {
      await ensurePlannedAssignments(page, jobId, targetPath, 3);
      await page.locator('tr', { hasText: renamedJobName }).getByRole('button', { name: 'Ablage prüfen' }).click();
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await expect(dialog).toBeVisible({ timeout: 15000 });
      await expect(dialog).toContainText('Dateiänderungen gesperrt');
    });

    await scenario('Ablagefilter Auffälligkeiten funktioniert', async () => {
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await dialog.getByRole('button', { name: /Auffälligkeiten/ }).click();
      await expectWorklistFilterResult(dialog);
    });

    await scenario('Ablagefilter Bereit funktioniert', async () => {
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await dialog.getByRole('button', { name: /Bereit/ }).click();
      await expectWorklistFilterResult(dialog);
    });

    await scenario('ein Ablagepunkt kann entfernt werden', async () => {
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await dialog.getByRole('button', { name: /Alle/ }).click();
      const countBefore = await dialog.locator('.imageflow-worklist-row').count();
      expect(countBefore).toBeGreaterThan(0);
      if (countBefore <= 1) {
        await expect(dialog.locator('.imageflow-worklist-row').first()).toBeVisible();
        return;
      }
      await dialog.getByRole('button', { name: /Ablage entfernen:/ }).first().click();
      await expect(page.getByText('Ablagepunkt wurde entfernt.')).toBeVisible({ timeout: 10000 });
      await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(countBefore - 1);
    });

    await scenario('Ablage kann nur vorgemerkt werden', async () => {
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await dialog.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
      await dialog.getByRole('button', { name: 'Ablage vormerken' }).click();
      await expect(page.getByText(/Ablage wurde vorgemerkt|Ablage-Einstellung wurde gemerkt/)).toBeVisible({ timeout: 10000 });
    });

    await scenario('Jetzt ablegen bleibt ohne Realmodus gesperrt', async () => {
      const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
      await expect(dialog.getByRole('button', { name: 'Jetzt ablegen' })).toBeDisabled();
      const blocked = await processNowIsBlocked(page, jobId);
      expect(blocked).toBe(true);
      await dialog.getByRole('button', { name: 'Schließen' }).click();
    });

    await scenario('mobile Ansicht ordnet Foto, Ziele und Fußleiste sinnvoll an', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('tr', { hasText: renamedJobName }).getByRole('button', { name: 'Weitermachen' }).click();
      await expect(page.locator('.imageflow-photo-stage')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.imageflow-targets')).toBeVisible();
      await expect(page.locator('.imageflow-filmstrip')).toBeVisible();
      const photoBox = await page.locator('.imageflow-photo-stage').boundingBox();
      const targetsBox = await page.locator('.imageflow-targets').boundingBox();
      const footerBox = await page.locator('.imageflow-filmstrip').boundingBox();
      expect(photoBox).not.toBeNull();
      expect(targetsBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(photoBox.y).toBeLessThan(targetsBox.y);
      expect(footerBox.height).toBeLessThan(90);
    });

    await scenario('Desktop-Ansicht gibt dem Hauptbild stabil Platz', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.locator('.imageflow-photo-stage')).toBeVisible({ timeout: 15000 });
      const headBox = await page.locator('.imageflow-job-head').boundingBox();
      const photoBox = await page.locator('.imageflow-photo-stage').boundingBox();
      const footerBox = await page.locator('.imageflow-filmstrip').boundingBox();
      expect(headBox).not.toBeNull();
      expect(photoBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(headBox.height).toBeLessThan(120);
      expect(photoBox.height).toBeGreaterThan(300);
      expect(footerBox.height).toBeLessThan(90);
    });

    await scenario('Screenshots dokumentieren Hauptmenü, Sortierseite und Mobilansicht', async () => {
      fs.mkdirSync(reportsDir, { recursive: true });
      await page.screenshot({ path: `${reportsDir}/sort-desktop-${stamp}.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${reportsDir}/sort-mobile-${stamp}.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Zurück' }).click();
      await page.screenshot({ path: `${reportsDir}/dashboard-${stamp}.png`, fullPage: true });
    });

    await scenario('Flow kann nach dem Test verworfen werden', async () => {
      page.once('dialog', async (dialog) => dialog.accept());
      await page.locator('tr', { hasText: renamedJobName }).getByRole('button', { name: 'Flow verwerfen' }).click();
      await expect(page.locator('tr', { hasText: renamedJobName })).toHaveCount(0);
      jobId = null;
    });

    await scenario('Testdaten werden nach dem Lauf gelöscht', async () => {
      await cleanupLiveJobs(page);
      await cleanupLiveFavorites(page);
      await deleteDavPath(page, username, matrixRoot);
      const targetSearch = await api(page, `/api/v1/targets?mode=copy&path=${encodeURIComponent('/Photos')}&query=${encodeURIComponent(livePrefix)}&limit=20&ordering=alphabetical`);
      const folders = targetSearch.folders?.folders || [];
      expect(folders.some((folder) => String(folder.path || '').includes(livePrefix))).toBe(false);
    });

    expect(completed.length).toBeGreaterThanOrEqual(55);
  } finally {
    if (jobId !== null) {
      await api(page, `/api/v1/jobs/${jobId}/discard`, { method: 'POST', body: {} }).catch(() => {});
    }
    await cleanupLiveJobs(page).catch(() => {});
    await cleanupLiveFavorites(page).catch(() => {});
    await deleteDavPath(page, username, matrixRoot).catch(() => {});
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

async function findJob(page, jobName) {
  const payload = await api(page, '/api/v1/jobs');
  const job = (payload.jobs || []).find((item) => item.name === jobName);
  if (!job) {
    throw new Error(`Created job was not returned by the jobs API: ${jobName}`);
  }
  return job;
}

async function cleanupLiveJobs(page) {
  const payload = await api(page, '/api/v1/jobs');
  const jobs = (payload.jobs || []).filter((job) => String(job.name || '').startsWith(livePrefix));
  for (const job of jobs) {
    await api(page, `/api/v1/jobs/${job.id}/discard`, { method: 'POST', body: {} }).catch(() => {});
  }
}

async function cleanupLiveFavorites(page) {
  for (const mode of ['album', 'copy', 'move']) {
    const payload = await api(page, `/api/v1/favorites?mode=${encodeURIComponent(mode)}`).catch(() => ({ favorites: [] }));
    const favorites = (payload.favorites || []).filter((favorite) => String(favorite.label || '').includes(livePrefix) || String(favorite.path || '').includes(livePrefix));
    for (const favorite of favorites) {
      await api(page, `/api/v1/favorites/${favorite.id}`, { method: 'DELETE', body: {} }).catch(() => {});
    }
  }
}

async function ensurePlannedAssignments(page, jobId, targetPath, minimum) {
  const previewBefore = await api(page, `/api/v1/jobs/${jobId}/worklist-preview?limit=20`).catch(() => null);
  if (Number(previewBefore?.summary?.total || 0) >= minimum) {
    return;
  }

  const state = await api(page, `/api/v1/jobs/${jobId}/sort-state?start=begin&limit=20`);
  for (const image of state.nextImages || []) {
    await api(page, `/api/v1/jobs/${jobId}/assign`, {
      method: 'POST',
      body: {
        sourcePath: image.path,
        fileId: image.fileId || null,
        fileName: image.name || 'Bild',
        mimeType: image.mimeType || 'image/unknown',
        hotkey: '',
        target: { id: `${targetPath}/A Familie`, label: 'A Familie', path: `${targetPath}/A Familie` },
      },
    }).catch(() => {});

    const preview = await api(page, `/api/v1/jobs/${jobId}/worklist-preview?limit=20`).catch(() => null);
    if (Number(preview?.summary?.total || 0) >= minimum) {
      return;
    }
  }
}

async function prepareDavFolders(page, username, displayPaths) {
  for (const displayPath of displayPaths) {
    await mkcolDavPath(page, username, displayPath);
  }
}

async function uploadGeneratedImages(page, username, destinationFolder, count, suffix = 'main') {
  for (let index = 0; index < count; index += 1) {
    const destination = `${destinationFolder}/imageflow-live-${suffix}-${String(index + 1).padStart(3, '0')}.png`;
    await putDavImage(page, username, destination, index);
  }
}

async function chooseFolderFromPicker(page, field, pathParts) {
  const label = field === 'targetPath' ? 'Zielordner wählen' : 'Bilderordner wählen';
  await page.locator(`[data-action="open-folder-picker"][data-picker-field="${field}"]`).click();
  await expect(page.getByRole('dialog', { name: label })).toBeVisible({ timeout: 10000 });
  const photosRow = page.locator('.imageflow-folder-main[data-folder-path="/Photos"]');
  if (await photosRow.count()) {
    await photosRow.click({ timeout: 5000 });
  }
  let currentPath = '/Photos';
  for (const part of pathParts) {
    currentPath = `${currentPath}/${part}`;
    await page.locator(`.imageflow-folder-main[data-folder-path="${cssEscape(currentPath)}"]`).click({ timeout: 10000 });
  }
  await page.getByRole('button', { name: 'Diesen Ordner wählen' }).click();
}

function cssEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function processNowIsBlocked(page, jobId) {
  try {
    await api(page, `/api/v1/jobs/${jobId}/process-now`, { method: 'POST', body: { limit: 1 } });
    return false;
  } catch (error) {
    return /deaktiviert|gesperrt|HTTP 409|HTTP 403/.test(error.message);
  }
}

async function expectWorklistFilterResult(dialog) {
  const rows = dialog.locator('.imageflow-worklist-row');
  if (await rows.count()) {
    await expect(rows.first()).toBeVisible();
    return;
  }
  await expect(dialog.getByText('Keine Einträge in diesem Filter.')).toBeVisible();
}

async function mkcolDavPath(page, username, displayPath) {
  const response = await davRequest(page, username, displayPath, { method: 'MKCOL' });
  if (![200, 201, 204, 405].includes(response.status)) {
    throw new Error(`Could not create test folder ${displayPath}: HTTP ${response.status}`);
  }
}

async function putDavImage(page, username, destinationPath, index) {
  const response = await page.evaluate(async ({ username, destinationPath, index }) => {
    const encodedUser = encodeURIComponent(username);
    const destinationUrl = `${window.location.origin}/remote.php/dav/files/${encodedUser}/${encodeDavPath(destinationPath)}`;
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lYfJ4wAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
    const result = await fetch(destinationUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-ImageFlow-Test-Index': String(index),
        requesttoken: window.OC.requestToken || '',
      },
      body: bytes,
      credentials: 'same-origin',
    });
    return { ok: result.ok, status: result.status };

    function encodeDavPath(displayPath) {
      return String(displayPath || '/')
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    }
  }, { username, destinationPath, index });

  if (![200, 201, 204].includes(response.status)) {
    throw new Error(`Could not upload ${destinationPath}: HTTP ${response.status}`);
  }
}

async function deleteDavPath(page, username, displayPath) {
  const response = await davRequest(page, username, displayPath, { method: 'DELETE' });
  if (![200, 202, 204, 207, 404].includes(response.status)) {
    throw new Error(`Could not delete test folder ${displayPath}: HTTP ${response.status}`);
  }
}

async function davRequest(page, username, displayPath, options = {}) {
  return page.evaluate(async ({ username, displayPath, options }) => {
    const encodedPath = String(displayPath || '/')
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const encodedUser = encodeURIComponent(username);
    const davUrl = `${window.location.origin}/remote.php/dav/files/${encodedUser}/${encodedPath}`;
    const result = await fetch(davUrl, {
      method: options.method || 'GET',
      headers: {
        requesttoken: window.OC.requestToken || '',
        ...(options.headers || {}),
      },
      credentials: 'same-origin',
    });
    return { ok: result.ok, status: result.status };
  }, { username, displayPath, options });
}
