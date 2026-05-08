(function () {
  "use strict";

  const root = document.getElementById("imageflow-app");
  if (!root) {
    return;
  }

  const mount = root.querySelector(".imageflow-shell");
  const hasNextcloud = typeof window.OC !== "undefined" && typeof window.OC.generateUrl === "function";
  const appIcon =
    hasNextcloud && typeof window.OC.imagePath === "function"
      ? window.OC.imagePath("imageflow", "app.svg")
      : "./img/app.svg";
  const PRELOAD_RADIUS = 4;
  const THUMB_WINDOW = 16;
  const MAX_BUFFERED_IMAGES = 32;
  const PAGE_LIMIT = 48;
  const imageBuffer = new Map();
  let positionSaveTimer = null;

  const state = {
    page: root.dataset.page || "jobs",
    jobId: numberOrNull(root.dataset.jobId),
    jobs: [],
    sortState: null,
    imageIndex: 0,
    pageCursor: null,
    imagePage: null,
    bufferPlan: [],
    targets: [],
    toast: null,
    loading: false,
  };

  function numberOrNull(value) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function apiUrl(path) {
    return hasNextcloud ? window.OC.generateUrl(`/apps/imageflow${path}`) : path;
  }

  async function request(path, options = {}) {
    if (!hasNextcloud) {
      return mockRequest(path, options);
    }

    const response = await fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        requesttoken: window.OC.requestToken || "",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    }

    return payload;
  }

  async function mockRequest(path, options) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (path === "/api/v1/jobs" && (!options.method || options.method === "GET")) {
      return { jobs: mockJobs() };
    }
    if (path === "/api/v1/jobs" && options.method === "POST") {
      const job = {
        id: Date.now(),
        name: options.body.name || "Neue Sortierung",
        sourcePath: options.body.sourcePath || "/Photos",
        targetMode: options.body.targetMode || "album",
        targetPath: options.body.targetPath || null,
        albumName: options.body.albumName || null,
        status: "draft",
        safeMode: options.body.safeMode !== false,
        totalFiles: 0,
        sortedFiles: 0,
        skippedFiles: 0,
        queuedOperations: 0,
        executedOperations: 0,
        failedOperations: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [job, ...state.jobs];
      return { job };
    }
    if (/\/api\/v1\/jobs\/\d+\/discard$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      state.jobs = state.jobs.filter((job) => job.id !== jobId);
      return { deleted: true, jobId };
    }
    if (path.includes("/sort-state")) {
      return mockSortState(state.jobId || 1);
    }
    if (path.includes("/position")) {
      return {
        savedPosition: {
          cursor: options.body.cursor || 0,
          index: options.body.index || 0,
          fileId: options.body.fileId || null,
          savedAt: Math.floor(Date.now() / 1000),
        },
      };
    }
    if (path.includes("/assign")) {
      return {
        assignment: {
          id: Date.now(),
          sourcePath: options.body.sourcePath,
          targetLabel: options.body.target.label,
          hotkey: options.body.hotkey || "",
        },
      };
    }
    if (path.includes("/skip")) {
      return { assignment: { id: Date.now(), sourcePath: options.body.sourcePath, targetLabel: "Uebersprungen" } };
    }
    if (path.includes("/targets")) {
      return { targets: mockTargets() };
    }
    return {};
  }

  function mockJobs() {
    return [
      {
        id: 1,
        name: "Familienfotos 2025",
        sourcePath: "/Photos/Inbox",
        targetMode: "album",
        targetPath: null,
        albumName: null,
        status: "sorting",
        safeMode: true,
        totalFiles: 320,
        sortedFiles: 74,
        skippedFiles: 6,
        queuedOperations: 74,
        executedOperations: 0,
        failedOperations: 0,
        updatedAt: Math.floor(Date.now() / 1000) - 240,
      },
      {
        id: 2,
        name: "Import Kamera",
        sourcePath: "/Camera/Unsortiert",
        targetMode: "copy",
        targetPath: "/Photos/Sortiert",
        albumName: null,
        status: "ready",
        safeMode: true,
        totalFiles: 118,
        sortedFiles: 118,
        skippedFiles: 3,
        queuedOperations: 118,
        executedOperations: 0,
        failedOperations: 0,
        updatedAt: Math.floor(Date.now() / 1000) - 900,
      },
    ];
  }

  function mockSortState(jobId) {
    const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
    return {
      job,
      favorites: [
        { id: "family", label: "Familie", hotkey: "1", position: 1 },
        { id: "travel", label: "Reisen", hotkey: "2", position: 2 },
        { id: "archive", label: "Archiv", hotkey: "3", position: 3 },
        { id: "skip", label: "Ueberspringen", hotkey: "0", position: 10 },
      ],
      nextImages: [
        {
          fileId: 11,
          name: "IMG_4021.jpg",
          path: `${job.sourcePath}/IMG_4021.jpg`,
          mimeType: "image/jpeg",
          previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%231d1d1d'/%3E%3Cpath d='M80 650 380 310l190 230 150-160 400 270z' fill='%23b7eadf'/%3E%3Ccircle cx='880' cy='190' r='80' fill='%23f4a4b8'/%3E%3C/svg%3E",
          thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%231d1d1d'/%3E%3Cpath d='M20 185 105 80l50 70 44-50 100 85z' fill='%23b7eadf'/%3E%3C/svg%3E",
        },
        {
          fileId: 12,
          name: "IMG_4022.jpg",
          path: `${job.sourcePath}/IMG_4022.jpg`,
          mimeType: "image/jpeg",
          previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%232f3d46'/%3E%3Cpath d='M0 600 280 350l200 190 260-290 460 350v200H0z' fill='%23d94f70'/%3E%3Ccircle cx='980' cy='150' r='70' fill='%23ffe8a3'/%3E%3C/svg%3E",
          thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%232f3d46'/%3E%3Cpath d='M0 180 80 95l60 55 70-82 110 112v40H0z' fill='%23d94f70'/%3E%3C/svg%3E",
        },
        {
          fileId: 13,
          name: "IMG_4023.jpg",
          path: `${job.sourcePath}/IMG_4023.jpg`,
          mimeType: "image/jpeg",
          previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%2332254a'/%3E%3Cpath d='M120 620 360 260l180 250 140-130 380 240z' fill='%237357c8'/%3E%3Ccircle cx='930' cy='210' r='88' fill='%23b7eadf'/%3E%3C/svg%3E",
          thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%2332254a'/%3E%3Cpath d='M30 180 102 65l52 80 42-40 104 75z' fill='%237357c8'/%3E%3C/svg%3E",
        },
      ],
      imagePage: {
        cursor: 0,
        limit: PAGE_LIMIT,
        total: 3,
        returned: 3,
        hasPrevious: false,
        previousCursor: null,
        hasNext: false,
        nextCursor: null,
        mode: "mock",
      },
      savedPosition: {
        cursor: 0,
        index: 0,
        fileId: 11,
        savedAt: null,
      },
      recentAssignments: [],
      queue: [],
    };
  }

  function mockTargets() {
    return [
      { id: "family", label: "Familie", location: "Privat" },
      { id: "travel", label: "Reisen", location: "Jahresalben" },
      { id: "archive", label: "Archiv", location: "Langzeit" },
      { id: "work", label: "Projekte", location: "Arbeit" },
    ];
  }

  async function load() {
    state.loading = true;
    render();
    try {
      if (state.page === "sort" && state.jobId) {
        await loadImagePage(state.pageCursor, null, false);
      } else {
        const payload = await request("/api/v1/jobs");
        state.jobs = payload.jobs || [];
      }
    } catch (error) {
      state.toast = { type: "error", message: error.message || "ImageFlow konnte nicht geladen werden." };
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadImagePage(cursor = null, preferredIndex = null, renderLoading = true) {
    if (!state.jobId) {
      return;
    }
    if (renderLoading) {
      state.loading = true;
      render();
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor !== null && cursor !== undefined) {
      params.set("cursor", String(Math.max(0, Number(cursor) || 0)));
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`);
      state.sortState = payload;
      state.imagePage = payload.imagePage || defaultImagePage(payload.nextImages || []);
      state.pageCursor = Number(state.imagePage.cursor || 0);
      const saved = payload.savedPosition || {};
      const savedIndex = Number(saved.cursor || 0) === state.pageCursor ? Number(saved.index || 0) : 0;
      state.imageIndex = clampIndex(preferredIndex ?? savedIndex, sortImages(payload));
      await loadTargets(payload.job.targetMode);
      persistPositionSoon();
    } finally {
      if (renderLoading) {
        state.loading = false;
        render();
      }
    }
  }

  async function loadTargets(mode) {
    const payload = await request(`/api/v1/targets?mode=${encodeURIComponent(mode || "album")}&limit=100`);
    state.targets = payload.targets || payload.folders?.folders || [];
  }

  function render() {
    mount.setAttribute("aria-busy", state.loading ? "true" : "false");
    mount.innerHTML = `
      <div class="imageflow-app">
        ${renderTopbar()}
        <main class="imageflow-content">
          ${state.page === "sort" ? renderSortPage() : renderJobsPage()}
          ${renderToast()}
        </main>
      </div>
    `;
    bindActions();
    syncImageBuffer();
  }

  function renderTopbar() {
    return `
      <header class="imageflow-topbar">
        <img class="imageflow-mark" src="${escapeAttr(appIcon)}" alt="">
        <div class="imageflow-title">
          <h2>ImageFlow</h2>
          <p>Sortierjobs planen, Bilder schnell zuordnen und Schreibaktionen kontrolliert ausfuehren.</p>
        </div>
        <nav class="imageflow-tabs" aria-label="ImageFlow">
          <button class="imageflow-tab ${state.page === "jobs" ? "is-active" : ""}" data-action="go-jobs" type="button">Jobs</button>
          <button class="imageflow-tab ${state.page === "sort" ? "is-active" : ""}" data-action="go-sort" type="button" ${state.jobId ? "" : "disabled"}>Sortieren</button>
          <button class="imageflow-tab" data-action="show-log" type="button">Protokoll</button>
        </nav>
      </header>
    `;
  }

  function renderJobsPage() {
    const totals = summarizeJobs(state.jobs);
    return `
      <section class="imageflow-dashboard" aria-label="Sortierjobs">
        <form class="imageflow-panel accent-pink imageflow-form" id="imageflow-job-form">
          <div class="imageflow-panel-head">
            <div>
              <h3>Sortierjob anlegen</h3>
              <p>Alle Entscheidungen werden zuerst geplant. Kopieren, Verschieben oder Album-Zuordnung laufen erst nach Freigabe.</p>
            </div>
          </div>
          <div class="imageflow-field">
            <label for="ifl-name">Name</label>
            <input id="ifl-name" name="name" type="text" maxlength="160" placeholder="z. B. Urlaub Import">
          </div>
          <div class="imageflow-field">
            <label for="ifl-source">Quellordner</label>
            <input id="ifl-source" name="sourcePath" type="text" value="/Photos" autocomplete="off">
            <small>Ordnerauswahl per Nextcloud-Dialog folgt; Pfade werden serverseitig normalisiert.</small>
          </div>
          <div class="imageflow-field">
            <label for="ifl-mode">Sortierart</label>
            <select id="ifl-mode" name="targetMode">
              <option value="album">Nextcloud-Album zuordnen</option>
              <option value="move">In Ordner verschieben</option>
              <option value="copy">In Ordner kopieren</option>
            </select>
          </div>
          <div class="imageflow-field" data-target-path-field hidden>
            <label for="ifl-target">Zielordner</label>
            <input id="ifl-target" name="targetPath" type="text" value="/Photos/Sortiert" autocomplete="off">
          </div>
          <label class="imageflow-toggle">
            <input id="ifl-safe" name="safeMode" type="checkbox" checked>
            Sicherer Modus mit Pruefsummen
          </label>
          <div class="imageflow-actions">
            <button class="imageflow-button primary" type="submit">Job anlegen</button>
          </div>
        </form>
        <section class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Job-Uebersicht</h3>
              <p>Status, Fortschritt und Queue-Freigabe bleiben auf der Hauptseite.</p>
            </div>
            <button class="imageflow-button" data-action="refresh" type="button">Aktualisieren</button>
          </div>
          <div class="imageflow-status-grid">
            <div class="imageflow-stat"><strong>${totals.jobs}</strong><span>Jobs</span></div>
            <div class="imageflow-stat"><strong>${totals.sorted}</strong><span>Sortierte Bilder</span></div>
            <div class="imageflow-stat"><strong>${totals.queued}</strong><span>Geplante Operationen</span></div>
            <div class="imageflow-stat"><strong>${totals.failed}</strong><span>Fehler</span></div>
          </div>
          ${renderJobTable()}
        </section>
      </section>
    `;
  }

  function renderJobTable() {
    if (state.jobs.length === 0) {
      return `<div class="imageflow-empty">Noch keine Sortierjobs vorhanden.</div>`;
    }

    return `
      <div class="imageflow-table-wrap">
        <table class="imageflow-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Quelle</th>
              <th>Modus</th>
              <th>Status</th>
              <th>Fortschritt</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${state.jobs.map(renderJobRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderJobRow(job) {
    return `
      <tr>
        <td><strong>${escapeHtml(job.name)}</strong><br><span class="imageflow-badge safe">${job.safeMode ? "Sicher" : "Standard"}</span></td>
        <td>${escapeHtml(job.sourcePath || "/")}</td>
        <td>${modeLabel(job.targetMode)}</td>
        <td><span class="imageflow-badge ready">${statusLabel(job.status)}</span></td>
        <td>${Number(job.sortedFiles || 0)} sortiert<br>${Number(job.queuedOperations || 0)} geplant</td>
        <td>
          <div class="imageflow-actions">
            <button class="imageflow-button" data-action="open-sort" data-job-id="${job.id}" type="button">Sortieren</button>
            <button class="imageflow-button" data-action="pause-job" data-job-id="${job.id}" type="button">Pausieren</button>
            <button class="imageflow-button primary" data-action="queue-job" data-job-id="${job.id}" type="button">Ausfuehren</button>
            <button class="imageflow-button danger" data-action="discard-job" data-job-id="${job.id}" type="button">Verwerfen</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderSortPage() {
    const sortState = state.sortState || mockSortState(state.jobId || 1);
    const job = sortState.job;
    const images = sortImages(sortState);
    const currentIndex = clampIndex(state.imageIndex, images);
    const current = images[currentIndex] || {
      name: "Kein Bild geladen",
      path: job.sourcePath || "/",
      mimeType: "",
    };
    const bufferPlan = planImageBuffer(images, currentIndex);
    const filmstrip = filmstripWindow(images, currentIndex);
    const preview = imageUrl(current);
    const page = sortState.imagePage || state.imagePage || defaultImagePage(images);
    const pageStart = page.total > 0 ? Number(page.cursor || 0) + 1 : 0;
    const pageEnd = Math.min(Number(page.total || images.length), Number(page.cursor || 0) + images.length);

    return `
      <section class="imageflow-sort" aria-label="Sortieransicht">
        <header class="imageflow-job-head">
          <div>
            <h3>${escapeHtml(job.name || "Sortierjob")}</h3>
            <p>${escapeHtml(job.sourcePath || "/")} · ${modeLabel(job.targetMode)} · ${statusLabel(job.status)} · ${images.length ? currentIndex + 1 : 0}/${images.length}</p>
          </div>
          <div class="imageflow-toolbar">
            <span class="imageflow-badge safe">${job.safeMode ? "Sicherer Modus" : "Standardmodus"}</span>
            <span class="imageflow-badge">${Number(job.sortedFiles || 0)} sortiert</span>
            <span class="imageflow-badge">${Number(job.queuedOperations || 0)} geplant</span>
            <button class="imageflow-button" data-action="go-jobs" type="button">Zurueck</button>
          </div>
        </header>
        <div class="imageflow-sort-grid">
          <aside class="imageflow-rail">
            <h4>Favoriten</h4>
            <div class="imageflow-favorite-list">
              ${(sortState.favorites || []).map((favorite) => renderFavorite(favorite, current)).join("")}
            </div>
          </aside>
          <section class="imageflow-photo-stage">
            <div class="imageflow-photo">
              <div class="imageflow-photo-card">
                ${preview ? `<img class="imageflow-photo-img" src="${escapeAttr(preview)}" alt="${escapeAttr(current.name || "Bild")}" decoding="async" fetchpriority="high" draggable="false">` : '<div class="imageflow-photo-icon" aria-hidden="true"></div>'}
                <div class="imageflow-photo-meta">
                  <strong>${escapeHtml(current.name || "Bild")}</strong>
                  <span>${escapeHtml(current.path || "")}</span>
                </div>
              </div>
            </div>
            <div class="imageflow-hotkeys">
              <span class="imageflow-hotkey"><b>1-9</b> Favorit</span>
              <span class="imageflow-hotkey"><b>0</b> Ueberspringen</span>
              <span class="imageflow-hotkey"><b>Leertaste</b> Ueberspringen</span>
              <span class="imageflow-hotkey"><b>←/→</b> Filmstreifen</span>
            </div>
          </section>
          <aside class="imageflow-targets">
            <div class="imageflow-panel-head">
              <div>
                <h4>Ziele</h4>
                <p>${job.targetMode === "album" ? "Alben alphabetisch" : "Ordner alphabetisch"}</p>
              </div>
            </div>
            <div class="imageflow-target-list">
              ${(state.targets.length ? state.targets : mockTargets()).map((target, index) => renderTarget(target, current, index)).join("")}
            </div>
          </aside>
        </div>
        <footer class="imageflow-filmstrip">
          <div class="imageflow-filmstrip-head">
            <div>
              <strong>Filmstreifen</strong>
              <span>${pageStart}-${pageEnd} von ${Number(page.total || images.length)} · ${bufferPlan.length} im Puffer</span>
            </div>
            <div class="imageflow-page-actions">
              <button class="imageflow-icon-button" data-action="page-prev" type="button" ${page.hasPrevious ? "" : "disabled"}>Zurueck</button>
              <button class="imageflow-icon-button" data-action="page-next" type="button" ${page.hasNext ? "" : "disabled"}>Weiter</button>
            </div>
          </div>
          <div class="imageflow-strip" role="listbox" aria-label="Filmstreifen">
            ${filmstrip.items.map((image, offset) => renderThumb(image, filmstrip.start + offset, currentIndex, bufferPlan)).join("") || '<div class="imageflow-empty">Keine Vorschaubilder geladen.</div>'}
          </div>
        </footer>
      </section>
    `;
  }

  function renderFavorite(favorite, current) {
    return `
      <button class="imageflow-favorite" data-action="assign" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(favorite.targetId || favorite.id || "")}" data-target-label="${escapeAttr(favorite.label)}" data-hotkey="${escapeAttr(favorite.hotkey || "")}" type="button">
        <span class="imageflow-key">${escapeHtml(favorite.hotkey || String(favorite.position || ""))}</span>
        <span><strong>${escapeHtml(favorite.label)}</strong><small>Position ${escapeHtml(String(favorite.position || ""))}</small></span>
      </button>
    `;
  }

  function renderTarget(target, current, index) {
    return `
      <button class="imageflow-target" data-action="assign" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(target.id || target.path || "")}" data-target-label="${escapeAttr(target.label || target.name || "Ziel")}" data-target-path="${escapeAttr(target.path || "")}" type="button">
        <span class="imageflow-key">${index + 1}</span>
        <span><strong>${escapeHtml(target.label || target.name || "Ziel")}</strong><small>${escapeHtml(target.location || target.path || "")}</small></span>
      </button>
    `;
  }

  function renderThumb(image, index, currentIndex, bufferPlan) {
    const active = index === currentIndex;
    const buffered = bufferPlan.includes(index);
    const preview = image?.thumbnailUrl || imageUrl(image);
    return `
      <button class="imageflow-thumb ${active ? "is-active" : ""} ${buffered ? "is-buffered" : ""}" data-action="select-image" data-index="${index}" role="option" aria-selected="${active ? "true" : "false"}" type="button">
        ${preview ? `<img class="imageflow-thumb-img" src="${escapeAttr(preview)}" alt="" loading="lazy" decoding="async" draggable="false">` : ""}
        <strong>${escapeHtml(image.name || "Bild")}</strong>
        <span>${escapeHtml(image.mimeType || "")}</span>
      </button>
    `;
  }

  function renderToast() {
    if (!state.toast) {
      return "";
    }
    return `<div class="imageflow-toast ${state.toast.type === "error" ? "error" : ""}" role="status">${escapeHtml(state.toast.message)}</div>`;
  }

  function bindActions() {
    const form = document.getElementById("imageflow-job-form");
    if (form) {
      form.addEventListener("submit", createJob);
      const mode = document.getElementById("ifl-mode");
      mode?.addEventListener("change", toggleTargetPath);
      toggleTargetPath();
    }

    root.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", handleAction);
    });

    document.removeEventListener("keydown", handleHotkey);
    if (state.page === "sort") {
      document.addEventListener("keydown", handleHotkey);
    }
  }

  async function createJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      name: form.name.value.trim(),
      sourcePath: form.sourcePath.value.trim() || "/",
      targetMode: form.targetMode.value,
      targetPath: form.targetPath ? form.targetPath.value.trim() : "",
      safeMode: form.safeMode.checked,
    };

    try {
      const payload = await request("/api/v1/jobs", { method: "POST", body });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: "Sortierjob wurde angelegt." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Job konnte nicht angelegt werden." };
      render();
    }
  }

  function toggleTargetPath() {
    const mode = document.getElementById("ifl-mode");
    const targetField = root.querySelector("[data-target-path-field]");
    if (mode && targetField) {
      targetField.hidden = mode.value === "album";
    }
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    const jobId = numberOrNull(event.currentTarget.dataset.jobId);
    if (action === "refresh") {
      load();
    } else if (action === "go-jobs") {
      state.page = "jobs";
      state.sortState = null;
      state.imagePage = null;
      state.pageCursor = null;
      await load();
    } else if (action === "go-sort" && state.jobId) {
      state.page = "sort";
      state.pageCursor = null;
      await load();
    } else if (action === "open-sort" && jobId) {
      state.page = "sort";
      state.jobId = jobId;
      state.imageIndex = 0;
      state.imagePage = null;
      state.pageCursor = null;
      await load();
    } else if (action === "pause-job" && jobId) {
      await changeJobStatus(jobId, "pause");
    } else if (action === "queue-job" && jobId) {
      await changeJobStatus(jobId, "queue-execution");
    } else if (action === "discard-job" && jobId) {
      await discardJob(jobId);
    } else if (action === "assign") {
      await assignFromButton(event.currentTarget);
    } else if (action === "select-image") {
      setImageIndex(numberOrNull(event.currentTarget.dataset.index) ?? state.imageIndex);
    } else if (action === "page-next") {
      await goToImagePage(pageInfo().nextCursor, 0);
    } else if (action === "page-prev") {
      await goToImagePage(pageInfo().previousCursor, PAGE_LIMIT - 1);
    } else if (action === "show-log") {
      state.toast = { type: "info", message: "Das Protokoll wird als eigene Ansicht ausgebaut; API und Datenmodell sind vorbereitet." };
      render();
    }
  }

  async function changeJobStatus(jobId, operation) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/${operation}`, { method: "POST", body: {} });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.toast = { type: "info", message: "Jobstatus wurde aktualisiert." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Jobstatus konnte nicht aktualisiert werden." };
      render();
    }
  }

  async function discardJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    const label = job?.name || `Job ${jobId}`;
    if (typeof window.confirm === "function" && !window.confirm(`Sortierjob "${label}" verwerfen?`)) {
      return;
    }

    try {
      await request(`/api/v1/jobs/${jobId}/discard`, { method: "POST", body: {} });
      state.jobs = state.jobs.filter((item) => item.id !== jobId);
      state.toast = { type: "info", message: "Sortierjob wurde verworfen." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Sortierjob konnte nicht verworfen werden." };
      render();
    }
  }

  async function assignFromButton(button) {
    const sourcePath = button.dataset.sourcePath || "";
    const target = {
      id: button.dataset.targetId || "",
      label: button.dataset.targetLabel || "Ziel",
      path: button.dataset.targetPath || "",
    };
    try {
      await request(`/api/v1/jobs/${state.jobId}/assign`, {
        method: "POST",
        body: {
          sourcePath,
          target,
          hotkey: button.dataset.hotkey || "",
          fileId: button.dataset.fileId || null,
          fileName: button.dataset.fileName || "",
          mimeType: button.dataset.mimeType || "",
        },
      });
      state.toast = { type: "info", message: `Geplant: ${target.label}` };
      completeCurrentDecision("assign");
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Sortierentscheidung konnte nicht gespeichert werden." };
      render();
    }
  }

  async function handleHotkey(event) {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }
    const sortState = state.sortState || mockSortState(state.jobId || 1);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      await moveImage(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await moveImage(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      await goToImagePage(0, 0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const page = pageInfo(sortState);
      await goToImagePage(Math.max(0, Number(page.total || 0) - Number(page.limit || PAGE_LIMIT)), PAGE_LIMIT - 1);
      return;
    }
    if (event.key === " " || event.key === "0") {
      event.preventDefault();
      await skipCurrent(currentImage(sortState));
      return;
    }
    const favorite = (sortState.favorites || []).find((item) => item.hotkey === event.key);
    if (favorite) {
      event.preventDefault();
      const current = currentImage(sortState);
      const button = {
        dataset: {
          fileId: current?.fileId || "",
          fileName: current?.name || "",
          mimeType: current?.mimeType || "",
          sourcePath: current?.path || "",
          targetId: favorite.targetId || favorite.id || "",
          targetLabel: favorite.label,
          targetPath: favorite.path || "",
          hotkey: favorite.hotkey || "",
        },
      };
      await assignFromButton(button);
    }
  }

  async function skipCurrent(current) {
    try {
      await request(`/api/v1/jobs/${state.jobId}/skip`, {
        method: "POST",
        body: {
          sourcePath: current?.path || "",
          hotkey: "0",
          fileId: current?.fileId || null,
          fileName: current?.name || "",
          mimeType: current?.mimeType || "",
        },
      });
      state.toast = { type: "info", message: "Bild wurde uebersprungen." };
      completeCurrentDecision("skip");
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Bild konnte nicht uebersprungen werden." };
      render();
    }
  }

  function sortImages(sortState = state.sortState) {
    return Array.isArray(sortState?.nextImages) ? sortState.nextImages : [];
  }

  function clampIndex(index, images) {
    if (images.length === 0) {
      return 0;
    }
    return Math.max(0, Math.min(images.length - 1, Number.isFinite(index) ? index : 0));
  }

  function currentImage(sortState = state.sortState) {
    const images = sortImages(sortState);
    return images[clampIndex(state.imageIndex, images)] || null;
  }

  function setImageIndex(index) {
    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const nextIndex = clampIndex(index, images);
    if (nextIndex === state.imageIndex) {
      syncImageBuffer();
      persistPositionSoon();
      return;
    }
    state.imageIndex = nextIndex;
    render();
    persistPositionSoon();
  }

  async function moveImage(delta) {
    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const page = pageInfo();
    const nextIndex = state.imageIndex + delta;
    if (nextIndex >= images.length && page.hasNext) {
      await goToImagePage(page.nextCursor, 0);
      return;
    }
    if (nextIndex < 0 && page.hasPrevious) {
      await goToImagePage(page.previousCursor, PAGE_LIMIT - 1);
      return;
    }

    setImageIndex(nextIndex);
  }

  async function goToImagePage(cursor, preferredIndex) {
    if (cursor === null || cursor === undefined) {
      return;
    }
    await loadImagePage(Math.max(0, Number(cursor) || 0), preferredIndex);
  }

  function completeCurrentDecision(type) {
    const sortState = state.sortState;
    if (!sortState) {
      return;
    }

    const images = sortImages(sortState);
    if (images.length > 0) {
      images.splice(clampIndex(state.imageIndex, images), 1);
    }
    state.imageIndex = clampIndex(state.imageIndex, images);
    if (type === "skip") {
      sortState.job.skippedFiles = Number(sortState.job.skippedFiles || 0) + 1;
    } else {
      sortState.job.sortedFiles = Number(sortState.job.sortedFiles || 0) + 1;
      sortState.job.queuedOperations = Number(sortState.job.queuedOperations || 0) + 1;
    }
    if (sortState.job.status === "draft") {
      sortState.job.status = "sorting";
    }
    persistPositionSoon();
  }

  function filmstripWindow(images, currentIndex) {
    if (images.length <= THUMB_WINDOW) {
      return { start: 0, items: images };
    }

    const half = Math.floor(THUMB_WINDOW / 2);
    const start = Math.max(0, Math.min(images.length - THUMB_WINDOW, currentIndex - half));
    return { start, items: images.slice(start, start + THUMB_WINDOW) };
  }

  function planImageBuffer(images, currentIndex) {
    const first = Math.max(0, currentIndex - PRELOAD_RADIUS);
    const last = Math.min(images.length - 1, currentIndex + PRELOAD_RADIUS);
    state.bufferPlan = [];
    for (let index = first; index <= last; index += 1) {
      state.bufferPlan.push(index);
    }
    return state.bufferPlan;
  }

  function syncImageBuffer() {
    if (state.page !== "sort") {
      imageBuffer.clear();
      return;
    }

    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const indexes = planImageBuffer(images, clampIndex(state.imageIndex, images));
    const keepKeys = new Set();
    indexes.forEach((index) => {
      const image = images[index];
      const key = imageKey(image, index);
      keepKeys.add(key);
      preloadImage(image, key);
    });

    Array.from(imageBuffer.keys()).forEach((key) => {
      if (!keepKeys.has(key) || imageBuffer.size > MAX_BUFFERED_IMAGES) {
        imageBuffer.delete(key);
      }
    });
  }

  function preloadImage(image, key) {
    const url = imageUrl(image);
    if (!url || imageBuffer.has(key) || typeof window.Image !== "function") {
      return;
    }

    const loader = new window.Image();
    loader.decoding = "async";
    const entry = { status: "loading", url, loader };
    imageBuffer.set(key, entry);
    loader.onload = () => {
      entry.status = "ready";
    };
    loader.onerror = () => {
      entry.status = "failed";
    };
    loader.src = url;
    if (typeof loader.decode === "function") {
      loader.decode().then(() => {
        entry.status = "ready";
      }).catch(() => {
        entry.status = "failed";
      });
    }
  }

  function imageKey(image, index) {
    return String(image?.fileId || image?.path || image?.name || index);
  }

  function imageUrl(image) {
    return image?.previewUrl || image?.thumbnailUrl || image?.url || "";
  }

  function pageInfo(sortState = state.sortState) {
    return sortState?.imagePage || state.imagePage || defaultImagePage(sortImages(sortState));
  }

  function defaultImagePage(images) {
    return {
      cursor: 0,
      limit: PAGE_LIMIT,
      total: images.length,
      returned: images.length,
      hasPrevious: false,
      previousCursor: null,
      hasNext: false,
      nextCursor: null,
      mode: "local",
    };
  }

  function persistPositionSoon() {
    if (state.page !== "sort" || !state.jobId || !state.sortState) {
      return;
    }
    if (positionSaveTimer) {
      window.clearTimeout(positionSaveTimer);
    }
    positionSaveTimer = window.setTimeout(() => {
      savePosition().catch(() => {});
    }, 350);
  }

  async function savePosition() {
    const page = pageInfo();
    const current = currentImage();
    await request(`/api/v1/jobs/${state.jobId}/position`, {
      method: "POST",
      body: {
        cursor: Number(page.cursor || 0),
        index: state.imageIndex,
        fileId: current?.fileId || null,
      },
    });
  }

  function summarizeJobs(jobs) {
    return jobs.reduce(
      (summary, job) => ({
        jobs: summary.jobs + 1,
        sorted: summary.sorted + Number(job.sortedFiles || 0),
        queued: summary.queued + Number(job.queuedOperations || 0),
        failed: summary.failed + Number(job.failedOperations || 0),
      }),
      { jobs: 0, sorted: 0, queued: 0, failed: 0 },
    );
  }

  function modeLabel(mode) {
    return {
      album: "Album",
      move: "Verschieben",
      copy: "Kopieren",
    }[mode] || escapeHtml(mode || "");
  }

  function statusLabel(status) {
    return {
      draft: "Entwurf",
      sorting: "Sortierung laeuft",
      paused: "Pausiert",
      ready: "Bereit",
      queued: "Ausfuehrung geplant",
      executing: "Ausfuehrung laeuft",
      done: "Abgeschlossen",
      error: "Fehler",
    }[status] || escapeHtml(status || "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  load();
})();
