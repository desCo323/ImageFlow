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

async function measuredBoxes(page, selectors) {
  let boxes = null;
  await expect.poll(async () => {
    boxes = await page.evaluate((queryMap) => {
      const result = {};
      for (const [name, selector] of Object.entries(queryMap)) {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
          return null;
        }
        result[name] = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }
      return result;
    }, selectors);
    return Boolean(boxes);
  }, { message: 'Layout hat messbare Boxen' }).toBe(true);
  return boxes;
}

test('renders the job dashboard and creates a local mock job', async ({ page }) => {
  await mount(page);

  await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible();
  await expect(page.getByLabel('Schutzstatus')).toContainText('Geschützter Testbetrieb');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Dateiänderungen gesperrt');
  await expect(page.getByLabel('Schutzstatus')).toContainText('Automatik aus');
  await expect(page.getByLabel('Systemprüfung')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Protokoll' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ereignisse' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Flow anlegen' })).toBeVisible();
  await page.getByRole('button', { name: 'Flow anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Neuen Flow vorbereiten' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flow speichern' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern & loslegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weitermachen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Von vorn ansehen' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offene Bilder' }).first()).toBeVisible();
  await expect(page.getByLabel('Zielordner')).toBeHidden();
  await expect(page.getByLabel('Vorschau laden')).toBeVisible();
  await expect(page.getByLabel('Ziel-Reihenfolge')).toBeVisible();
  await expect(page.getByLabel('Tastenbelegung')).toBeVisible();
  await expect(page.getByLabel('Unterordner mit einbeziehen')).toBeVisible();
  await expect(page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist')).toBeVisible();

  await page.getByLabel('Name').fill('Browser Smoke');
  await page.getByLabel('Bilderordner').fill('/Photos/Smoke');
  await page.getByLabel('Unterordner mit einbeziehen').check();
  await page.getByLabel('Vorschau laden').selectOption('turbo');
  await page.getByLabel('Ziel-Reihenfolge').selectOption('alphabetical');
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

  await page.locator('tr', { hasText: 'Browser Smoke Bearbeitet' }).getByRole('button', { name: 'Duplizieren' }).click();
  await expect(page.getByText('Browser Smoke Bearbeitet Duplikat')).toBeVisible();
});

test('shows the guided self-test as allowed for albentest', async ({ page }) => {
  await mount(page, 'data-page="jobs" data-mock-user="albentest" data-debug-ui="1"');

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
  await page.getByRole('button', { name: 'Diesen Ordner wählen' }).click();
  await expect(page.getByLabel('Bilderordner')).toHaveValue('/Photos');

  await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
  await page.getByLabel('Zielordner').fill('/');
  await page.locator('[data-action="open-folder-picker"][data-picker-field="targetPath"]').click();
  await expect(page.getByRole('dialog', { name: 'Zielordner wählen' })).toBeVisible();
  await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
  await page.locator('.imageflow-folder-row', { hasText: 'Sortiert' }).getByRole('button', { name: 'Wählen' }).click();
  await expect(page.getByLabel('Zielordner')).toHaveValue('/Photos/Sortiert');
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
  await dialog.getByRole('button', { name: 'Ablage vormerken' }).click();
  await expect(page.getByText('Ablage wurde vorgemerkt')).toBeVisible();
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

  const boxes = await measuredBoxes(page, {
    head: '.imageflow-job-head',
    photo: '.imageflow-photo-stage',
    footer: '.imageflow-filmstrip',
  });
  const { head: headBox, photo: photoBox, footer: footerBox } = boxes;
  expect(headBox.height).toBeLessThan(90);
  expect(photoBox.height).toBeGreaterThan(380);
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

  const boxes = await measuredBoxes(page, {
    root: '#imageflow-app',
    content: '#content',
    title: '.imageflow-head-title h3',
    create: '.imageflow-target-head-actions .imageflow-button.primary',
    photo: '.imageflow-photo-stage',
    footer: '.imageflow-filmstrip',
  });
  const { root: rootBox, content: contentBox, title: titleBox, create: createBox, photo: photoBox, footer: footerBox } = boxes;
  expect(rootBox.width).toBeGreaterThan(contentBox.width - 4);
  expect(titleBox.height).toBeLessThan(64);
  expect(createBox.y).toBeLessThan(260);
  expect(photoBox.height).toBeGreaterThan(190);
  expect(footerBox.height).toBeLessThan(100);
  expect(footerBox.y).toBeLessThan(720);
});

test('uses mobile space with the photo before target lists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountInNextcloudFrame(page, 'data-page="sort" data-job-id="1"');

  const boxes = await measuredBoxes(page, {
    topbar: '.imageflow-topbar',
    photo: '.imageflow-photo-stage',
    targets: '.imageflow-targets',
    rail: '.imageflow-rail',
    footer: '.imageflow-filmstrip',
  });
  const { topbar: topbarBox, photo: photoBox, targets: targetsBox, rail: railBox, footer: footerBox } = boxes;
  expect(topbarBox.height).toBeLessThan(150);
  expect(photoBox.height).toBeGreaterThan(260);
  expect(photoBox.y).toBeLessThan(targetsBox.y);
  expect(targetsBox.y).toBeLessThan(railBox.y);
  expect(footerBox.height).toBeLessThan(100);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(844);
});

test('keeps a large filmstrip bounded and responsive', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1" data-mock-image-count="1200"');

  const app = page.locator('#imageflow-app');
  const currentName = page.locator('.imageflow-photo-meta strong');
  const filmstrip = page.locator('.imageflow-filmstrip');

  await expect(currentName).toHaveText('IMG_0001.jpg');
  await expect(filmstrip).not.toContainText('von 1200');
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
  await expect(filmstrip).not.toContainText('49-96 von 1200');
  await expect(page.locator('.imageflow-thumb')).toHaveCount(16);
  await expect(app).toHaveAttribute('data-page-cache-hit', '1');
  expect(Number(await app.getAttribute('data-buffered-images'))).toBeLessThanOrEqual(32);
});

test('starts the visible progress at zero when viewing a flow from the beginning', async ({ page }) => {
  await mount(page);

  await page.locator('tr', { hasText: 'Familienfotos 2025' }).getByRole('button', { name: 'Von vorn ansehen' }).click();

  await expect(page.getByLabel('Flow-Fortschritt')).toContainText('0/320 entschieden');
  await expect(page.getByLabel('Flow-Fortschritt')).toContainText('0%');
  await expect(page.locator('#imageflow-app')).toHaveAttribute('data-progress-baseline', '80');
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
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByText('Album wurde angelegt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Tierpark' })).toBeVisible();

  await page.locator('.imageflow-favorite', { hasText: 'Familie' }).click();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('Letzte Entscheidung wurde zurückgenommen.')).toBeVisible();
  await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4021.jpg');
});

test('adds and removes favorites from the target rail', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByRole('button', { name: 'Als Schnellziel merken: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list')).toContainText('Projekte');
  await expect(page.getByText('Schnellziel wurde hinzugefügt.')).toBeVisible();

  await page.getByRole('button', { name: 'Schnellziel entfernen: Projekte' }).click();
  await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: 'Projekte' })).toHaveCount(0);
});

test('filters target lists while sorting', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="1"');

  await page.getByLabel('Ziel suchen').fill('Reis');
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Reisen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Familie' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Suche leeren' }).click();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Familie' })).toBeVisible();

  await mount(page, 'data-page="sort" data-job-id="2"');
  await page.getByRole('button', { name: 'Eine Ebene hoch' }).click();
  await page.getByLabel('Ziel suchen').fill('Inb');
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' })).toHaveCount(0);
});

test('browses folder targets in copy mode', async ({ page }) => {
  await mount(page, 'data-page="sort" data-job-id="2"');

  await expect(page.getByText('/Photos/Sortiert', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
  await page.getByPlaceholder('Neuer Ordner').fill('Neue Ablage');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Neue Ablage' })).toBeVisible();
  await page.getByRole('button', { name: 'Eine Ebene hoch' }).click();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' })).toBeVisible();
});

test('renders the debug protocol view', async ({ page }) => {
  await mount(page, 'data-debug-ui="1"');

  await page.getByRole('button', { name: 'Protokoll' }).click();

  await expect(page.getByRole('heading', { name: 'Protokoll' })).toBeVisible();
  await expect(page.getByText('assignment_planned')).toBeVisible();
  await page.getByLabel('Log-Level').selectOption('debug');
  await expect(page.getByText('image_buffer_synced')).toBeVisible();
});

test('covers 50 typical image sorting user scenarios', async ({ page }) => {
  test.setTimeout(120000);
  const completed = [];
  const scenario = async (name, callback) => {
    await test.step(`${String(completed.length + 1).padStart(2, '0')} ${name}`, async () => {
      await callback();
      completed.push(name);
    });
  };

  await scenario('dashboard starts in protected test mode', async () => {
    await mount(page);
    await expect(page.getByRole('heading', { name: 'ImageFlow' })).toBeVisible();
    await expect(page.getByLabel('Schutzstatus')).toContainText('Dateiänderungen gesperrt');
  });

  await scenario('new-flow button focuses the form', async () => {
    await page.getByRole('button', { name: 'Flow anlegen' }).click();
    await expect(page.getByLabel('Name')).toBeFocused();
  });

  await scenario('draft reset restores the empty name and default source', async () => {
    await page.getByLabel('Name').fill('Wird zurückgesetzt');
    await page.getByLabel('Bilderordner').fill('/Camera');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('');
    await expect(page.getByLabel('Bilderordner')).toHaveValue('/Photos');
  });

  await scenario('album flow can be saved from the dashboard', async () => {
    await page.getByLabel('Name').fill('Szenario Album');
    await page.getByRole('button', { name: 'Flow speichern' }).click();
    await expect(page.getByText('Szenario Album')).toBeVisible();
  });

  await scenario('copy mode shows the destination folder field', async () => {
    await page.getByLabel('Name').fill('Szenario Kopieren');
    await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
    await expect(page.getByLabel('Zielordner')).toBeVisible();
    await expect(page.getByLabel('Zielordner')).toHaveValue('/Photos');
  });

  await scenario('recursive and automation choices are stored on a flow', async () => {
    await page.getByLabel('Bilderordner').fill('/Photos');
    await page.getByLabel('Zielordner').fill('/Photos/Sortiert');
    await page.getByLabel('Unterordner mit einbeziehen').check();
    await page.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
    await page.getByLabel('Ziel-Reihenfolge').selectOption('alphabetical');
    await page.getByRole('button', { name: 'Flow speichern' }).click();
    const row = page.locator('tr', { hasText: 'Szenario Kopieren' });
    await expect(row).toContainText('Mit Unterordnern');
    await expect(row).toContainText('Automatik an');
    await expect(row).toContainText('Alphabetisch');
  });

  await scenario('flow editing changes the visible name', async () => {
    const row = page.locator('tr', { hasText: 'Szenario Album' });
    await row.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Name').fill('Szenario Album Bearbeitet');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByText('Szenario Album Bearbeitet')).toBeVisible();
  });

  await scenario('flow duplication creates a separate copy', async () => {
    const row = page.locator('tr', { hasText: 'Szenario Album Bearbeitet' });
    await row.getByRole('button', { name: 'Duplizieren' }).click();
    await expect(page.getByText('Szenario Album Bearbeitet Duplikat')).toBeVisible();
  });

  await scenario('flow can be paused without losing its row', async () => {
    const row = page.locator('tr', { hasText: 'Szenario Album Bearbeitet' }).first();
    await row.getByRole('button', { name: 'Pausieren' }).click();
    await expect(page.locator('tr', { hasText: 'Szenario Album Bearbeitet' }).first()).toContainText('Pausiert');
    await expect(page.locator('tr', { hasText: 'Szenario Album Bearbeitet' }).first().getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
  });

  await scenario('paused flow can be resumed', async () => {
    const row = page.locator('tr', { hasText: 'Szenario Album Bearbeitet' }).first();
    await row.getByRole('button', { name: 'Fortsetzen' }).click();
    await expect(page.locator('tr', { hasText: 'Szenario Album Bearbeitet' }).first()).toContainText('In Arbeit');
  });

  await scenario('a duplicate flow can be discarded after confirmation', async () => {
    page.once('dialog', async (dialog) => dialog.accept());
    await page.locator('tr', { hasText: 'Szenario Album Bearbeitet Duplikat' }).getByRole('button', { name: 'Flow verwerfen' }).click();
    await expect(page.getByText('Szenario Album Bearbeitet Duplikat')).toHaveCount(0);
  });

  await scenario('source folder picker selects a source path', async () => {
    await page.getByLabel('Bilderordner').fill('/');
    await page.locator('[data-action="open-folder-picker"][data-picker-field="sourcePath"]').click();
    await expect(page.getByRole('dialog', { name: 'Bilderordner wählen' })).toBeVisible();
    await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
    await page.getByRole('button', { name: 'Diesen Ordner wählen' }).click();
    await expect(page.getByLabel('Bilderordner')).toHaveValue('/Photos');
  });

  await scenario('target folder picker selects a nested destination', async () => {
    await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
    await page.getByLabel('Zielordner').fill('/');
    await page.locator('[data-action="open-folder-picker"][data-picker-field="targetPath"]').click();
    await expect(page.getByRole('dialog', { name: 'Zielordner wählen' })).toBeVisible();
    await page.locator('.imageflow-folder-main[data-folder-path="/Photos"]').click();
    await page.locator('.imageflow-folder-row', { hasText: 'Sortiert' }).getByRole('button', { name: 'Wählen' }).click();
    await expect(page.getByLabel('Zielordner')).toHaveValue('/Photos/Sortiert');
  });

  await scenario('save-and-open starts the sorting workspace', async () => {
    await mount(page);
    await page.getByLabel('Name').fill('Szenario Loslegen');
    await page.getByRole('button', { name: 'Speichern & loslegen' }).click();
    await expect(page.getByRole('heading', { name: 'Schnellziele' })).toBeVisible();
  });

  await scenario('sorting page keeps a compact head and visible footer', async () => {
    await expect(page.locator('.imageflow-job-head')).toBeVisible();
    await expect(page.locator('.imageflow-filmstrip')).toBeVisible();
    await expect(page.getByLabel('Vorgeladene Bilder')).toBeVisible();
  });

  await scenario('clicking a favorite stores a decision and advances', async () => {
    await page.locator('.imageflow-favorite', { hasText: 'Familie' }).click();
    await expect(page.getByText('Entschieden: Familie')).toBeVisible();
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  });

  await scenario('number hotkey stores a decision', async () => {
    await page.keyboard.press('2');
    await expect(page.getByText('Entschieden: Reisen')).toBeVisible();
    await expect(page.locator('.imageflow-flow-chip.accent-warm strong')).toHaveText('2');
  });

  await scenario('space skips the current image', async () => {
    await page.keyboard.press(' ');
    await expect(page.getByText('Weiter zum nächsten Bild.')).toBeVisible();
  });

  await scenario('zero key also skips', async () => {
    await mount(page, 'data-page="sort" data-job-id="1"');
    await page.keyboard.press('0');
    await expect(page.getByText('Weiter zum nächsten Bild.')).toBeVisible();
  });

  await scenario('undo restores the previous decision state', async () => {
    await page.locator('.imageflow-favorite', { hasText: 'Familie' }).click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
    await expect(page.getByText('Letzte Entscheidung wurde zurückgenommen.')).toBeVisible();
  });

  await scenario('arrow right moves through preloaded thumbnails', async () => {
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4022.jpg');
  });

  await scenario('arrow left moves back to the previous thumbnail', async () => {
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4021.jpg');
  });

  await scenario('clicking a thumbnail changes the main image', async () => {
    await page.getByRole('option', { name: /IMG_4023/ }).click();
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_4023.jpg');
  });

  await scenario('active thumbnail is the only one with active state', async () => {
    await expect(page.locator('.imageflow-thumb.is-active')).toHaveCount(1);
    await expect(page.locator('.imageflow-thumb.is-active')).toHaveAttribute('aria-label', 'IMG_4023.jpg');
  });

  await scenario('album search narrows the target list', async () => {
    await page.getByLabel('Ziel suchen').fill('Reis');
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Reisen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Familie' })).toHaveCount(0);
  });

  await scenario('clearing target search restores all targets', async () => {
    await page.getByRole('button', { name: 'Suche leeren' }).click();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Familie' })).toBeVisible();
  });

  await scenario('blank target creation shows a clear error and keeps the field', async () => {
    await page.getByRole('button', { name: 'Album anlegen' }).first().click();
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Bitte gib dem neuen Ziel einen Namen.')).toBeVisible();
    await expect(page.getByPlaceholder('Neues Album')).toBeVisible();
  });

  await scenario('new album appears in all targets and closes the create field', async () => {
    await page.getByPlaceholder('Neues Album').fill('Szenario Albumziel');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Album wurde angelegt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Szenario Albumziel' })).toBeVisible();
    await expect(page.getByPlaceholder('Neues Album')).toHaveCount(0);
  });

  await scenario('target can be added to quick targets', async () => {
    await page.getByRole('button', { name: 'Als Schnellziel merken: Projekte' }).click();
    await expect(page.getByText('Schnellziel wurde hinzugefügt.')).toBeVisible();
    await expect(page.locator('.imageflow-favorite-list')).toContainText('Projekte');
  });

  await scenario('adding the same quick target twice is treated as duplicate', async () => {
    await page.getByRole('button', { name: 'Als Schnellziel merken: Projekte' }).click();
    await expect(page.getByText('Schnellziel ist schon da.')).toBeVisible();
  });

  await scenario('quick target can be removed again', async () => {
    await page.getByRole('button', { name: 'Schnellziel entfernen: Projekte' }).click();
    await expect(page.locator('.imageflow-favorite-list .imageflow-favorite', { hasText: 'Projekte' })).toHaveCount(0);
  });

  await scenario('quick targets can be reordered with drag and drop', async () => {
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    const source = page.locator('.imageflow-favorite-row', { hasText: 'Familie' });
    const target = page.locator('.imageflow-favorite-row', { hasText: 'Archiv' });
    await source.dispatchEvent('dragstart', { dataTransfer });
    await target.dispatchEvent('dragover', { dataTransfer });
    await target.dispatchEvent('drop', { dataTransfer });
    await source.dispatchEvent('dragend', { dataTransfer });
    await expect(page.getByText('Reihenfolge der Schnellziele gespeichert.')).toBeVisible();
    await expect(page.locator('.imageflow-favorite-list .imageflow-favorite').first()).toContainText('Reisen');
  });

  await scenario('copy flow opens folder targets with current path context', async () => {
    await mount(page, 'data-page="sort" data-job-id="2"');
    await expect(page.getByRole('heading', { name: 'Alle Ziele' })).toBeVisible();
    await expect(page.getByText('/Photos/Sortiert', { exact: true })).toBeVisible();
  });

  await scenario('folder parent navigation shows sibling folders', async () => {
    await page.getByRole('button', { name: 'Eine Ebene hoch' }).click();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Inbox' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' })).toBeVisible();
  });

  await scenario('folder search finds recursive child folders', async () => {
    await page.getByLabel('Ziel suchen').fill('Inb');
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Inbox' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' })).toHaveCount(0);
  });

  await scenario('folder search can be cleared', async () => {
    await page.getByRole('button', { name: 'Suche leeren' }).click();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' })).toBeVisible();
  });

  await scenario('new folder appears immediately and closes the create field', async () => {
    await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
    await page.getByPlaceholder('Neuer Ordner').fill('Szenario Zielordner');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Szenario Zielordner' })).toBeVisible();
    await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
  });

  await scenario('new folder also appears when created from an active empty search', async () => {
    await page.getByLabel('Ziel suchen').fill('zz-no-match');
    await expect(page.getByText('Kein Ziel passt zu "zz-no-match".')).toBeVisible();
    await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
    await page.getByPlaceholder('Neuer Ordner').fill('Szenario Aus Suche');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Ordner wurde angelegt.')).toBeVisible();
    await expect(page.getByLabel('Ziel suchen')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Szenario Aus Suche' })).toBeVisible();
    await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
  });

  await scenario('duplicate folder creation reports duplicate and keeps a single row', async () => {
    await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
    await page.getByPlaceholder('Neuer Ordner').fill('Szenario Aus Suche');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByText('Dieses Ziel war schon vorhanden.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Szenario Aus Suche' })).toHaveCount(1);
    await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
  });

  await scenario('new folder can be added to quick targets', async () => {
    await page.getByRole('button', { name: 'Als Schnellziel merken: Szenario Zielordner' }).click();
    await expect(page.getByText('Schnellziel wurde hinzugefügt.')).toBeVisible();
    await expect(page.locator('.imageflow-favorite-list')).toContainText('Szenario Zielordner');
  });

  await scenario('folder target can receive a sorting decision', async () => {
    await page.getByRole('button', { name: 'Als Schnellziel merken: Sortiert' }).click();
    await page.locator('.imageflow-favorite', { hasText: 'Sortiert' }).click();
    await expect(page.getByText('Entschieden: Sortiert')).toBeVisible();
  });

  await scenario('worklist preview opens before execution', async () => {
    await mount(page);
    await page.locator('tr', { hasText: 'Familienfotos 2025' }).getByRole('button', { name: 'Ablage prüfen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Dateiänderungen gesperrt')).toBeVisible();
  });

  await scenario('worklist warning filter narrows the preview', async () => {
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await dialog.getByRole('button', { name: /Auffälligkeiten 1/ }).click();
    await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(1);
  });

  await scenario('worklist ready filter returns ready entries', async () => {
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await dialog.getByRole('button', { name: /Bereit 2/ }).click();
    await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(2);
  });

  await scenario('worklist item can be removed', async () => {
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await dialog.getByRole('button', { name: /Alle 3/ }).click();
    await dialog.getByRole('button', { name: /Ablage entfernen: .*IMG_4021/ }).click();
    await expect(page.getByText('Ablagepunkt wurde entfernt.')).toBeVisible();
    await expect(dialog.locator('.imageflow-worklist-row')).toHaveCount(2);
  });

  await scenario('worklist can be queued for later without real writes', async () => {
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await dialog.getByLabel('Automatisch ablegen, wenn der Server ruhig ist').check();
    await dialog.getByRole('button', { name: 'Ablage vormerken' }).click();
    await expect(page.getByText('Ablage wurde vorgemerkt')).toBeVisible();
  });

  await scenario('safe mode keeps immediate execution disabled', async () => {
    const dialog = page.getByRole('dialog', { name: 'Ablage prüfen' });
    await expect(dialog.getByRole('button', { name: 'Jetzt ablegen' })).toBeDisabled();
  });

  await scenario('debug protocol can be filtered', async () => {
    await page.getByRole('button', { name: 'Schließen' }).click();
    await mount(page, 'data-debug-ui="1"');
    await page.getByRole('button', { name: 'Protokoll' }).click();
    await page.getByLabel('Log-Level').selectOption('debug');
    await expect(page.getByText('image_buffer_synced')).toBeVisible();
  });

  await scenario('large stacks keep the image buffer bounded', async () => {
    await mount(page, 'data-page="sort" data-job-id="1" data-mock-image-count="1200"');
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_0021.jpg');
    expect(Number(await page.locator('#imageflow-app').getAttribute('data-buffered-images'))).toBeLessThanOrEqual(32);
  });

  await scenario('large stacks can jump to the next page', async () => {
    await page.getByRole('button', { name: 'Nächste Vorschaubilder' }).click();
    await expect(page.locator('.imageflow-photo-meta strong')).toHaveText('IMG_0049.jpg');
    await expect(page.locator('.imageflow-filmstrip')).not.toContainText('49-96 von 1200');
  });

  await scenario('desktop layout gives the main image enough stable space', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountInNextcloudFrame(page, 'data-page="sort" data-job-id="1"');
    const boxes = await measuredBoxes(page, {
      photo: '.imageflow-photo-stage',
      footer: '.imageflow-filmstrip',
    });
    expect(boxes.photo.height).toBeGreaterThan(300);
    expect(boxes.footer.height).toBeLessThan(100);
  });

  await scenario('mobile layout keeps photo, targets and footer visible', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountInNextcloudFrame(page, 'data-page="sort" data-job-id="1"');
    const boxes = await measuredBoxes(page, {
      photo: '.imageflow-photo-stage',
      targets: '.imageflow-targets',
      footer: '.imageflow-filmstrip',
    });
    expect(boxes.photo.y).toBeLessThan(boxes.targets.y);
    expect(boxes.footer.height).toBeLessThan(100);
  });

  await scenario('label audit keeps confusing old wording out of the main UI', async () => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mount(page);
    const visibleText = await page.locator('#imageflow-app').innerText();
    for (const outdated of ['Ablageordner', 'Bilder vorladen', 'Ziele anzeigen', 'Lieblingsziele', 'Zu Schnellzielen', 'Ziel finden', 'Erstellen', 'Self-Test']) {
      expect(visibleText).not.toContain(outdated);
    }
    await expect(page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?')).toBeVisible();
    await expect(page.getByLabel('Vorschau laden')).toBeVisible();
    await expect(page.getByLabel('Ziel-Reihenfolge')).toBeVisible();
  });

  await scenario('mode changes can be corrected before saving', async () => {
    await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('copy');
    await expect(page.getByLabel('Zielordner')).toBeVisible();
    await page.getByLabel('Wie sollen sortierte Bilder abgelegt werden?').selectOption('album');
    await expect(page.getByLabel('Zielordner')).toBeHidden();
  });

  await scenario('cancel editing returns to a clean new-flow form', async () => {
    await page.locator('tr', { hasText: 'Familienfotos 2025' }).getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page.getByRole('heading', { name: 'Flow bearbeiten' })).toBeVisible();
    await page.getByRole('button', { name: 'Bearbeiten abbrechen' }).click();
    await expect(page.getByRole('heading', { name: 'Neuen Flow vorbereiten' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('');
  });

  await scenario('folder picker close leaves the current form values untouched', async () => {
    await page.getByLabel('Bilderordner').fill('/Camera');
    await page.locator('[data-action="open-folder-picker"][data-picker-field="sourcePath"]').click();
    await expect(page.getByRole('dialog', { name: 'Bilderordner wählen' })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByLabel('Bilderordner')).toHaveValue('/Camera');
  });

  await scenario('empty flow name gets a useful automatic name', async () => {
    await page.getByLabel('Name').fill('');
    await page.getByRole('button', { name: 'Flow speichern' }).click();
    await expect(page.locator('tr', { hasText: 'Neuer Flow' }).first()).toBeVisible();
  });

  await scenario('custom duplicate hotkeys are ignored instead of assigned twice', async () => {
    await mount(page);
    await page.getByLabel('Name').fill('Szenario Eigene Tasten');
    await page.getByLabel('Tastenbelegung').selectOption('custom');
    await page.getByLabel('Taste für Schnellziel 1').fill('q');
    await page.getByLabel('Taste für Schnellziel 2').fill('q');
    await page.getByLabel('Taste für Schnellziel 3').fill('0');
    await page.getByRole('button', { name: 'Speichern & loslegen' }).click();
    await expect(page.locator('.imageflow-key').first()).toHaveText('q');
    await page.keyboard.press('q');
    await expect(page.getByText('Entschieden: Familie')).toBeVisible();
  });

  await scenario('target creation by Enter closes the field and shows the new album', async () => {
    await mount(page, 'data-page="sort" data-job-id="1"');
    await page.getByRole('button', { name: 'Album anlegen' }).first().click();
    await page.getByPlaceholder('Neues Album').fill('Enter Album');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Album wurde angelegt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Enter Album' })).toBeVisible();
    await expect(page.getByPlaceholder('Neues Album')).toHaveCount(0);
  });

  await scenario('target creation ignores accidental double submit', async () => {
    await mount(page, 'data-page="sort" data-job-id="2"');
    await page.getByRole('button', { name: 'Ordner anlegen' }).first().click();
    await page.getByPlaceholder('Neuer Ordner').fill('Doppelklick Ziel');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).dblclick();
    await expect(page.getByText(/Ordner wurde angelegt|Dieses Ziel war schon vorhanden/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Schnellziel merken: Doppelklick Ziel' })).toHaveCount(1);
    await expect(page.getByPlaceholder('Neuer Ordner')).toHaveCount(0);
  });

  await scenario('escape clears an active target search', async () => {
    await page.getByLabel('Ziel suchen').fill('Sort');
    await expect(page.getByLabel('Ziel suchen')).toHaveValue('Sort');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Ziel suchen')).toHaveValue('');
  });

  await scenario('page navigation buttons stay disabled at the first small page boundary', async () => {
    await mount(page, 'data-page="sort" data-job-id="1"');
    await expect(page.getByRole('button', { name: 'Vorherige Vorschaubilder' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Nächste Vorschaubilder' })).toBeDisabled();
  });

  await scenario('closed worklist preview can be reopened without losing safety copy', async () => {
    await mount(page);
    await page.locator('tr', { hasText: 'Familienfotos 2025' }).getByRole('button', { name: 'Ablage prüfen' }).click();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog', { name: 'Ablage prüfen' })).toHaveCount(0);
    await page.locator('tr', { hasText: 'Familienfotos 2025' }).getByRole('button', { name: 'Ablage prüfen' }).click();
    await expect(page.getByRole('dialog', { name: 'Ablage prüfen' })).toContainText('Dateiänderungen gesperrt');
  });

  expect(completed.length).toBeGreaterThanOrEqual(60);
});
