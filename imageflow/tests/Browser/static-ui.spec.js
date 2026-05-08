const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(appRoot, 'css/imageflow-main.css'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'js/imageflow-main.js'), 'utf8');

async function mount(page, attrs = 'data-page="jobs"') {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
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
          body { margin: 0; font-family: Arial, sans-serif; }
          ${css}
        </style>
      </head>
      <body>
        <div id="imageflow-app" ${attrs}><div class="imageflow-shell"></div></div>
        <script>${js}</script>
      </body>
    </html>
  `);
}

test('renders the job dashboard and creates a local mock job', async ({ page }) => {
  await mount(page);

  await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible();
  await expect(page.getByLabel('Schutzstatus')).toContainText('Geschützter Testbetrieb');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Dateiänderungen gesperrt');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Automatik aus');
  await expect(page.getByRole('heading', { name: 'Neue Runde vorbereiten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Runde speichern' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern & sortieren' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weitermachen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neu anfangen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offene Bilder' }).first()).toBeVisible();
  await expect(page.getByLabel('Ablageordner')).toBeHidden();
  await expect(page.getByLabel('Bilder vorladen')).toBeVisible();
  await expect(page.getByLabel('Ziele anzeigen')).toBeVisible();
  await expect(page.getByLabel('Tastenbelegung')).toBeVisible();
  await expect(page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist')).toBeVisible();

  await page.getByLabel('Name').fill('Browser Smoke');
  await page.getByLabel('Bilderordner').fill('/Photos/Smoke');
  await page.getByLabel('Bilder vorladen').selectOption('turbo');
  await page.getByLabel('Ziele anzeigen').selectOption('alphabetical');
  await page.getByLabel('Tastenbelegung').selectOption('letters');
  await page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
  await page.getByRole('button', { name: 'Runde speichern' }).click();
  await expect(page.getByText('Browser Smoke')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Automatik an');
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Alphabetisch');

  await page.locator('tr', { hasText: 'Browser Smoke' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('heading', { name: 'Runde bearbeiten' })).toBeVisible();
  await page.getByLabel('Name').fill('Browser Smoke Bearbeitet');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Browser Smoke Bearbeitet')).toBeVisible();

  await page.locator('tr', { hasText: 'Browser Smoke Bearbeitet' }).getByRole('button', { name: 'Kopie' }).click();
  await expect(page.getByText('Browser Smoke Bearbeitet Kopie')).toBeVisible();
});

test('saves and opens a letter-hotkey round from the dashboard', async ({ page }) => {
  await mount(page);

  await page.getByLabel('Name').fill('Letter Hotkeys');
  await page.getByLabel('Tastenbelegung').selectOption('letters');
  await page.getByRole('button', { name: 'Speichern & sortieren' }).click();

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
  await page.getByRole('button', { name: 'Speichern & sortieren' }).click();

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
  await expect(dialog.getByText('Dateiänderungen gesperrt')).toBeVisible();
  await expect(dialog.getByText('Manuell')).toBeVisible();
  await dialog.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
  await dialog.getByRole('button', { name: 'Für später merken' }).click();
  await expect(page.getByText('Ablage wurde für später gemerkt')).toBeVisible();
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
  await mount(page, 'data-page="sort" data-job-id="1"');

  await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alle Ziele' })).toBeVisible();
  await expect(page.getByLabel('Rundenfortschritt')).toContainText('Serie');
  await expect(page.locator('.imageflow-photo-img')).toBeVisible();
  await expect(page.locator('.imageflow-photo-meta strong', { hasText: 'IMG_4021.jpg' })).toBeVisible();
  await expect(page.getByText('Leertaste')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weitermachen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neu anfangen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offene Bilder' })).toBeVisible();
});

test('moves through the filmstrip with arrow keys and thumbnail selection', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  await expect(page.locator('.imageflow-thumb.is-active')).toContainText('IMG_4022.jpg');

  await page.getByRole('option', { name: /IMG_4023/ }).click();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4023.jpg');

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
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

  await page.getByPlaceholder('Neues Album').fill('Tierpark');
  await page.getByRole('button', { name: 'Anlegen' }).click();
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

test('browses folder targets in copy mode', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="2"');

  await expect(page.getByText('/Photos/Sortiert', { exact: true })).toBeVisible();
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
