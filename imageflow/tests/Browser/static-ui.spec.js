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
  await expect(page.getByRole('heading', { name: 'Sortierjob anlegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Job anlegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsetzen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorne' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offen' }).first()).toBeVisible();
  await expect(page.getByLabel('Zielordner')).toBeHidden();

  await page.getByLabel('Name').fill('Browser Smoke');
  await page.getByLabel('Quellordner').fill('/Photos/Smoke');
  await page.getByRole('button', { name: 'Job anlegen' }).click();
  await expect(page.getByText('Browser Smoke')).toBeVisible();
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

test('renders the sorting workspace with hotkey targets and filmstrip', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await expect(page.getByRole('heading', { name: 'Favoriten' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ziele' })).toBeVisible();
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

test('adds and removes favorites from the target rail', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByRole('button', { name: 'Zu Favoriten: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list')).toContainText('Projekte');
  await expect(page.getByText('Favorit wurde hinzugefuegt.')).toBeVisible();

  await page.getByRole('button', { name: 'Favorit entfernen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: 'Projekte' })).toHaveCount(0);
});

test('browses folder targets in copy mode', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="2"');

  await expect(page.getByText('/Photos/Sortiert')).toBeVisible();
  await page.getByRole('button', { name: 'Hoeher' }).click();
  await expect(page.getByRole('button', { name: 'Zu Favoriten: Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zu Favoriten: Sortiert' })).toBeVisible();
});
