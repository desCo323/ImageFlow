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
  await expect(page.getByLabel('Sicherheitsstatus')).toContainText('Sicherer Testbetrieb');
  await expect(page.getByLabel('Sicherheitsstatus')).toContainText('Dateioperationen gesperrt');
  await expect(page.getByLabel('Sicherheitsstatus')).toContainText('Cron-Ablage aus');
  await expect(page.getByRole('heading', { name: 'Flow starten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flow starten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsetzen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorne' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offen' }).first()).toBeVisible();
  await expect(page.getByLabel('Zielordner')).toBeHidden();
  await expect(page.getByLabel('Bildpuffer')).toBeVisible();
  await expect(page.getByLabel('In ruhigen Serverphasen automatisch ablegen')).toBeVisible();

  await page.getByLabel('Name').fill('Browser Smoke');
  await page.getByLabel('Quellordner').fill('/Photos/Smoke');
  await page.getByLabel('Bildpuffer').selectOption('turbo');
  await page.getByLabel('In ruhigen Serverphasen automatisch ablegen').check();
  await page.getByRole('button', { name: 'Flow starten' }).click();
  await expect(page.getByText('Browser Smoke')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Browser Smoke' })).toContainText('Auto-Ablage');
});

test('selects source and target folders with the folder picker', async ({ page }) => {
  await mount(page);

  await page.getByLabel('Quellordner').fill('/');
  await page.locator('[data-action="open-folder-picker"][data-picker-field="sourcePath"]').click();
  await expect(page.getByRole('dialog', { name: 'Quellordner auswaehlen' })).toBeVisible();
  await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
  await page.getByRole('button', { name: 'Diesen Ordner waehlen' }).click();
  await expect(page.getByLabel('Quellordner')).toHaveValue('/Photos');

  await page.getByLabel('Sortierart').selectOption('copy');
  await page.getByLabel('Zielordner').fill('/');
  await page.locator('[data-action="open-folder-picker"][data-picker-field="targetPath"]').click();
  await expect(page.getByRole('dialog', { name: 'Zielordner auswaehlen' })).toBeVisible();
  await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
  await page.locator('.imageflow-folder-row', { hasText: 'Sortiert' }).getByRole('button', { name: 'Waehlen' }).click();
  await expect(page.getByLabel('Zielordner')).toHaveValue('/Photos/Sortiert');
});

test('opens the worklist preview before queueing execution', async ({ page }) => {
  await mount(page);

  const row = page.locator('tr', { hasText: 'Familienfotos 2025' });
  await row.getByRole('button', { name: 'Ablage pruefen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ablage pruefen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Ablagepunkte', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Dateioperationen gesperrt')).toBeVisible();
  await expect(dialog.getByText('Manuell')).toBeVisible();
  await dialog.getByLabel('Diese Ablage in ruhigen Serverphasen automatisch verarbeiten').check();
  await dialog.getByRole('button', { name: 'Ablage vormerken' }).click();
  await expect(page.getByText('Ablage wurde vorgemerkt')).toBeVisible();
});

test('renders the sorting workspace with hotkey targets and filmstrip', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ablageziele' })).toBeVisible();
  await expect(page.getByLabel('Flow-Fortschritt')).toContainText('Serie');
  await expect(page.locator('.imageflow-photo-img')).toBeVisible();
  await expect(page.locator('.imageflow-photo-meta strong', { hasText: 'IMG_4021.jpg' })).toBeVisible();
  await expect(page.getByText('Leertaste')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorne' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offen' })).toBeVisible();
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

  for (let index = 0; index < 28; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(currentName).toHaveText('IMG_0049.jpg');
  await expect(filmstrip).toContainText('49-96 von 1200');
  await expect(page.locator('.imageflow-thumb')).toHaveCount(16);
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

test('adds and removes favorites from the target rail', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByRole('button', { name: 'Zu Schnellzielen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list')).toContainText('Projekte');
  await expect(page.getByText('Schnellziel wurde hinzugefuegt.')).toBeVisible();

  await page.getByRole('button', { name: 'Schnellziel entfernen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: 'Projekte' })).toHaveCount(0);
});

test('browses folder targets in copy mode', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="2"');

  await expect(page.getByText('/Photos/Sortiert')).toBeVisible();
  await page.getByRole('button', { name: 'Hoeher' }).click();
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
