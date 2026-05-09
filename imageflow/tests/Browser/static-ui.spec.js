const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(appRoot, 'css/imageflow-main.css'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'js/imageflow-main.js'), 'utf8');

async function mount(page, attrs = 'data-page="jobs"') {
  await page.setContent(testDocument(`<div id="imageflow-app" ${attrs}><div class="imageflow-shell"></div></div>`));
}

async function mountInNextcloudFrame(page, attrs = 'data-page="jobs"') {
  await page.setContent(testDocument(`
    <div id="content">
      <div id="imageflow-app" ${attrs}><div class="imageflow-shell"></div></div>
    </div>
  `, '#content { display: flex; position: fixed; inset: 50px 8px 8px 8px; }'));
}

function testDocument(body, extraCss = '') {
  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          :root {
            --color-main-text: #222;
            --color-main-background: #fff;
            --color-border: #d8d8d8;
            --color-text-maxcontrast: #5f5f5f;
            --color-background-darker: #eeeeee;
            --color-background-dark: #202124;
            --color-primary-element: #00679e;
            --color-primary-element-text: #fff;
            --color-error: #b42318;
            --color-success: #1f7a4d;
          }
          html, body { height: 100%; }
          body { margin: 0; font-family: Arial, sans-serif; }
          ${extraCss}
          ${css}
        </style>
      </head>
      <body>
        ${body}
        <script>${js}</script>
      </body>
    </html>
  `;
}

test('renders the job dashboard and creates a local mock job', async ({ page }) => {
  await mount(page);

  await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible();
  await expect(page.getByLabel('Schutzstatus')).toContainText('Geschützter Testbetrieb');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Dateiänderungen gesperrt');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Automatik aus');
  await expect(page.getByLabel('Systemprüfung')).toContainText('Die App ist im geschützten Testbetrieb');
  await expect(page.getByLabel('Systemprüfung')).toContainText('Datenbank erreichbar');
  await expect(page.getByLabel('Systemprüfung')).toContainText('Nur mit albentest');
  await expect(page.getByLabel('Systemprüfung')).toContainText('Geführter Testlauf');
  await expect(page.getByRole('button', { name: 'Flow anlegen' })).toBeVisible();
  await page.getByRole('button', { name: 'Flow anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Neuen Flow vorbereiten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flow speichern' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern & loslegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weitermachen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorn ansehen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offene Bilder' }).first()).toBeVisible();
  await expect(page.getByLabel('Ablageordner')).toBeHidden();
  await expect(page.getByLabel('Bilder vorladen')).toBeVisible();
  await expect(page.getByLabel('Ziele anzeigen')).toBeVisible();
  await expect(page.getByLabel('Tastenbelegung')).toBeVisible();
  await expect(page.getByLabel('Unterordner mit einbeziehen')).toBeVisible();
  await expect(page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist')).toBeVisible();

  await page.getByLabel('Name').fill('Browser Smoke');
  await page.getByLabel('Bilderordner').fill('/Photos/Smoke');
  await page.getByLabel('Unterordner mit einbeziehen').check();
  await page.getByLabel('Bilder vorladen').selectOption('turbo');
  await page.getByLabel('Ziele anzeigen').selectOption('alphabetical');
  await page.getByLabel('Tastenbelegung').selectOption('letters');
  await page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
  await page.getByRole('button', { name: 'Flow speichern' }).click();
  await expect(page.getByText('Browser Smoke')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Automatik an');
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Mit Unterordnern');
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Alphabetisch');

  await page.locator('tr', { hasText: 'Browser Smoke' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('heading', { name: 'Flow bearbeiten' })).toBeVisible();
  await page.getByLabel('Name').fill('Browser Smoke Bearbeitet');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Browser Smoke Bearbeitet')).toBeVisible();

  await page.locator('tr', { hasText: 'Browser Smoke Bearbeitet' }).getByRole('button', { name: 'Kopie' }).click();
  await expect(page.getByText('Browser Smoke Bearbeitet Kopie')).toBeVisible();
});

test('shows the guided self-test as allowed for albentest', async ({ page }) => {
  await mount(page, 'data-page="jobs" data-mock-user="albentest"');

  const system = page.getByLabel('Systemprüfung');
  await expect(system).toContainText('Testkonto aktiv');
  await expect(system).toContainText('Der geführte Test darf mit diesem Konto durchgeführt werden.');
  await expect(system.locator('.imageflow-selftest-step.safe', { hasText: 'Mit albentest anmelden' })).toBeVisible();
  await expect(system).toContainText('Dateiänderungen gesperrt');
});

test('saves and opens a letter-hotkey round from the dashboard', async ({ page }) => {
  await mount(page);

  await page.getByLabel('Name').fill('Letter Hotkeys');
  await page.getByLabel('Tastenbelegung').selectOption('letters');
  await page.getByRole('button', { name: 'Speichern & loslegen' }).click();

  await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  await expect(page.locator('.imageflow-hotkey', { hasText: 'A-I' })).toBeVisible();
  await expect(page.locator('.imageflow-key').first()).toHaveText('a');
});

test('uses freely configured hotkeys while sorting', async ({ page }) => {
  await mount(page);

  await page.getByLabel('Name').fill('Custom Hotkeys');
  await page.getByLabel('Tastenbelegung').selectOption('custom');
  await page.getByLabel('Taste für Schnellziel 1').fill('q');
  await page.getByLabel('Taste für Schnellziel 2').fill('w');
  await page.getByLabel('Taste für Schnellziel 3').fill('e');
  await page.getByRole('button', { name: 'Speichern & loslegen' }).click();

  await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  await expect(page.locator('.imageflow-hotkey', { hasText: 'q w e' })).toBeVisible();
  await expect(page.locator('.imageflow-key').first()).toHaveText('q');

  await page.keyboard.press('q');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
});

test('selects source and target folders with the folder picker', async ({ page }) => {
  await mount(page);

  await page.getByLabel('Bilderordner').fill('/');
  await page.locator('[data-action="open-folder-picker"][data-picker-field="sourcePath"]').click();
  await expect(page.getByRole('dialog', { name: 'Bilderordner wählen' })).toBeVisible();
  await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
  await page.getByRole('button', { name: 'Ordner übernehmen' }).click();
  await expect(page.getByLabel('Bilderordner')).toHaveValue('/Photos');

  await page.getByLabel('Was soll mit passenden Bildern passieren?').selectOption('copy');
  await page.getByLabel('Ablageordner').fill('/');
  await page.locator('[data-action="open-folder-picker"][data-picker-field="targetPath"]').click();
  await expect(page.getByRole('dialog', { name: 'Ablageordner wählen' })).toBeVisible();
  await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
  await page.locator('.imageflow-folder-row', { hasText: 'Sortiert' }).getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByLabel('Ablageordner')).toHaveValue('/Photos/Sortiert');
});

test('opens the worklist preview before queueing execution', async ({ page }) => {
  await mount(page);

  const row = page.locator('tr', { hasText: 'Familienfotos 2025' });
  await row.getByRole('button', { name: 'Ablage prüfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Entscheidungen', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3 geprüft, 3 angezeigt.')).toBeVisible();
  await expect(dialog.getByText('Dateiänderungen gesperrt')).toBeVisible();
  await expect(dialog.getByText('Manuell')).toBeVisible();
  await dialog.getByRole('button', { name: /Auffälligkeiten 1/ }).click();
  await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(1);
  await expect(dialog.locator('.imageflow-worklist-row')).toContainText('IMG_4022');
  await dialog.getByRole('button', { name: /Bereit 2/ }).click();
  await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(2);
  await dialog.getByRole('button', { name: /Alle 3/ }).click();
  await dialog.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
  await dialog.getByRole('button', { name: 'Für später merken' }).click();
  await expect(page.getByText('Ablage wurde für später gemerkt')).toBeVisible();
});

test('summarizes a large worklist while showing a compact list', async ({ page }) => {
  await mount(page, 'data-page="jobs" data-mock-worklist-total="1200"');

  const row = page.locator('tr', { hasText: 'Familienfotos 2025' });
  await row.getByRole('button', { name: 'Ablage prüfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('1200 geprüft, 3 wichtige Einträge angezeigt. Die Summen und Fehlerprüfung gelten für die komplette Ablage.')).toBeVisible();
  await expect(dialog.getByText('3 sichtbar von 1200')).toBeVisible();
  await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(3);
});

test('shows the quiet-server gate when background processing is waiting', async ({ page }) => {
  await mount(page, 'data-page="jobs" data-mock-real-execution="1" data-mock-background-mode="cron-waiting"');

  await expect(page.getByLabel('Schutzstatus')).toContainText('Automatik wartet');
  const row = page.locator('tr', { hasText: 'Familienfotos 2025' });
  await row.getByRole('button', { name: 'Ablage prüfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Wartet auf Ruhe')).toBeVisible();
  await expect(dialog.getByText('Automatik wartet: Serverlast 3.40 liegt über 2.00.')).toBeVisible();
});

test('removes a planned item from the worklist preview', async ({ page }) => {
  await mount(page);

  const row = page.locator('tr', { hasText: 'Familienfotos 2025' });
  await row.getByRole('button', { name: 'Ablage prüfen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(3);

  await dialog.getByRole('button', { name: /Ablage entfernen: .*IMG_4021/ }).click();
  await expect(page.getByText('Ablagepunkt wurde entfernt.')).toBeVisible();
  await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(2);
});

test('renders the sorting workspace with hotkey targets and filmstrip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'data-page="sort" data-job-id="1"');

  await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alle Ziele' })).toBeVisible();
  await expect(page.getByLabel('Flow-Fortschritt')).toContainText('Serie');
  await expect(page.getByRole('button', { name: 'Album anlegen' }).first()).toBeVisible();
  await expect(page.locator('.imageflow-job-head').getByRole('button', { name: 'Album anlegen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Album anlegen' }).first().click();
  await expect(page.getByPlaceholder('Neues Album')).toBeFocused();
  await expect(page.getByLabel('Vorgeladene Bilder')).toBeVisible();
  await expect(page.getByText('Filmstreifen')).toHaveCount(0);
  await expect(page.locator('.imageflow-photo-img')).toBeVisible();
  await expect(page.locator('.imageflow-photo-meta strong', { hasText: 'IMG_4021.jpg' })).toBeVisible();
  await expect(page.getByText('Leertaste')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weitermachen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorn ansehen' })).toHaveAttribute('title', /Vorgemerkte Ablagen bleiben erhalten/);
  await expect(page.getByRole('button', { name: 'Offene Bilder' })).toBeVisible();

  const headBox = await page.locator('.imageflow-job-head').boundingBox();
  const photoBox = await page.locator('.imageflow-photo-stage').boundingBox();
  const footerBox = await page.locator('.imageflow-filmstrip').boundingBox();
  expect(headBox).not.toBeNull();
  expect(headBox.height).toBeLessThan(90);
  expect(photoBox).not.toBeNull();
  expect(photoBox.height).toBeGreaterThan(380);
  expect(footerBox).not.toBeNull();
  expect(footerBox.height).toBeLessThan(100);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(900);
  expect(await page.locator('.imageflow-thumb strong').first().boundingBox()).toBeNull();
});

test('moves through the filmstrip with arrow keys and thumbnail selection', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  await expect(page.locator('.imageflow-thumb.is-active')).toHaveAttribute('aria-label', 'IMG_4022.jpg');

  await page.getByRole('option', { name: /IMG_4023/ }).click();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4023.jpg');

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
});

test('keeps flow controls visible inside a narrow Nextcloud content area', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await mountInNextcloudFrame(page, 'data-page="sort" data-job-id="1"');

  const rootBox = await page.locator('#imageflow-app').boundingBox();
  const contentBox = await page.locator('#content').boundingBox();
  const titleBox = await page.getByRole('heading', { name: 'Familienfotos 2025' }).boundingBox();
  const createBox = await page.getByRole('button', { name: 'Album anlegen' }).first().boundingBox();
  const photoBox = await page.locator('.imageflow-photo-stage').boundingBox();
  const footerBox = await page.locator('.imageflow-filmstrip').boundingBox();

  expect(rootBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(rootBox.width).toBeGreaterThan(contentBox.width - 4);
  expect(titleBox).not.toBeNull();
  expect(titleBox.height).toBeLessThan(64);
  expect(createBox).not.toBeNull();
  expect(createBox.y).toBeLessThan(260);
  expect(photoBox).not.toBeNull();
  expect(photoBox.height).toBeGreaterThan(190);
  expect(footerBox).not.toBeNull();
  expect(footerBox.height).toBeLessThan(100);
  expect(footerBox.y).toBeLessThan(720);
});

test('uses mobile space with the photo before target lists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountInNextcloudFrame(page, 'data-page="sort" data-job-id="1"');

  const topbarBox = await page.locator('.imageflow-topbar').boundingBox();
  const photoBox = await page.locator('.imageflow-photo-stage').boundingBox();
  const targetsBox = await page.locator('.imageflow-targets').boundingBox();
  const railBox = await page.locator('.imageflow-rail').boundingBox();
  const footerBox = await page.locator('.imageflow-filmstrip').boundingBox();

  expect(topbarBox).not.toBeNull();
  expect(topbarBox.height).toBeLessThan(150);
  expect(photoBox).not.toBeNull();
  expect(photoBox.height).toBeGreaterThan(260);
  expect(targetsBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(photoBox.y).toBeLessThan(targetsBox.y);
  expect(targetsBox.y).toBeLessThan(railBox.y);
  expect(footerBox).not.toBeNull();
  expect(footerBox.height).toBeLessThan(100);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(844);
});

test('keeps a large filmstrip bounded and responsive', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1" data-mock-image-count="1200"');

  const app = page.locator('#imageflow-app');
  const currentName = page.locator('.imageflow-photo-meta strong');
  const filmstrip = page.locator('.imageflow-filmstrip');

  await expect(currentName).toHaveText('IMG_0001.jpg');
  await expect(filmstrip).toContainText('1-48 von 1200');
  await expect(page.locator('.imageflow-thumb')).toHaveCount(16);
  await expect(app).toHaveAttribute('data-buffer-plan', '9');

  const startedAt = Date.now();
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  expect(Date.now() - startedAt).toBeLessThan(5000);
  await expect(currentName).toHaveText('IMG_0021.jpg');
  await expect(app).toHaveAttribute('data-buffer-plan', '17');
  await expect(page.locator('.imageflow-thumb')).toHaveCount(16);

  const buffered = Number(await app.getAttribute('data-buffered-images'));
  expect(buffered).toBeLessThanOrEqual(32);

  for (let index = 0; index < 21; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(currentName).toHaveText('IMG_0042.jpg');
  await expect.poll(async () => Number(await app.getAttribute('data-page-cache-size'))).toBeGreaterThan(1);

  for (let index = 0; index < 7; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(currentName).toHaveText('IMG_0049.jpg');
  await expect(filmstrip).toContainText('49-96 von 1200');
  await expect(page.locator('.imageflow-thumb')).toHaveCount(16);
  await expect(app).toHaveAttribute('data-page-cache-hit', '1');
  expect(Number(await app.getAttribute('data-buffered-images'))).toBeLessThanOrEqual(32);
});

test('shows flow feedback after a sorting decision', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.locator('.imageflow-favorite', { hasText: 'Familie' }).click();

  await expect(page.locator('.imageflow-feedback-burst')).toContainText('+1');
  await expect(page.locator('.imageflow-feedback-burst')).toContainText('1er Serie');
  await expect(page.locator('.imageflow-flow-chip.accent-warm strong')).toHaveText('1');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
});

test('creates a target from the sorting rail and can undo the last decision', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByRole('button', { name: 'Album anlegen' }).first().click();
  await page.getByPlaceholder('Neues Album').fill('Tierpark');
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await expect(page.getByText('Album wurde angelegt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Tierpark' })).toBeVisible();

  await page.locator('.imageflow-favorite', { hasText: 'Familie' }).click();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('Letzte Entscheidung wurde zurückgenommen.')).toBeVisible();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4021.jpg');
});

test('adds and removes favorites from the target rail', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByRole('button', { name: 'Zu Schnellzielen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list')).toContainText('Projekte');
  await expect(page.getByText('Schnellziel wurde hinzugefügt.')).toBeVisible();

  await page.getByRole('button', { name: 'Schnellziel entfernen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: 'Projekte' })).toHaveCount(0);
});

test('filters target lists while sorting', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByLabel('Ziel finden').fill('Reis');
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Reisen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Familie' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Zielsuche leeren' }).click();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Familie' })).toBeVisible();

  await mount(page, 'data-page="sort" data-job-id="2"');
  await page.getByRole('button', { name: 'Eine Ebene hoch' }).click();
  await page.getByLabel('Ziel finden').fill('Inb');
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Sortiert' })).toHaveCount(0);
});

test('browses folder targets in copy mode', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="2"');

  await expect(page.getByText('/Photos/Sortiert', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
  await page.getByPlaceholder('Neuer Ordner').fill('Neue Ablage');
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Neue Ablage' })).toBeVisible();
  await page.getByRole('button', { name: 'Eine Ebene hoch' }).click();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Schnellzielen: Sortiert' })).toBeVisible();
});

test('renders the debug protocol view', async ({ page }) => {
  await mount(page);

  await page.getByRole('button', { name: 'Protokoll' }).click();

  await expect(page.getByRole('heading', { name: 'Protokoll' })).toBeVisible();
  await expect(page.getByText('assignment_planned')).toBeVisible();
  await page.getByLabel('Log-Level').selectOption('debug');
  await expect(page.getByText('image_buffer_synced')).toBeVisible();
});
