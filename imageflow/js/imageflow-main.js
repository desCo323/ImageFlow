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

  const state = {
    page: root.dataset.page || "jobs",
    jobId: numberOrNull(root.dataset.jobId),
    jobs: [],
    sortState: null,
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
        { fileId: 11, name: "IMG_4021.jpg", path: `${job.sourcePath}/IMG_4021.jpg`, mimeType: "image/jpeg" },
        { fileId: 12, name: "IMG_4022.jpg", path: `${job.sourcePath}/IMG_4022.jpg`, mimeType: "image/jpeg" },
        { fileId: 13, name: "IMG_4023.jpg", path: `${job.sourcePath}/IMG_4023.jpg`, mimeType: "image/jpeg" },
      ],
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
        const payload = await request(`/api/v1/jobs/${state.jobId}/sort-state`);
        state.sortState = payload;
        await loadTargets(payload.job.targetMode);
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
    const current = sortState.nextImages?.[0] || {
      name: "Kein Bild geladen",
      path: job.sourcePath || "/",
      mimeType: "",
    };

    return `
      <section class="imageflow-sort" aria-label="Sortieransicht">
        <header class="imageflow-job-head">
          <div>
            <h3>${escapeHtml(job.name || "Sortierjob")}</h3>
            <p>${escapeHtml(job.sourcePath || "/")} · ${modeLabel(job.targetMode)} · ${statusLabel(job.status)}</p>
          </div>
          <div class="imageflow-toolbar">
            <span class="imageflow-badge safe">${job.safeMode ? "Sicherer Modus" : "Standardmodus"}</span>
            <span class="imageflow-badge">${Number(job.sortedFiles || 0)} sortiert</span>
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
                <div class="imageflow-photo-icon" aria-hidden="true"></div>
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
          <strong>Naechste Bilder</strong>
          <div class="imageflow-strip">
            ${(sortState.nextImages || []).slice(0, 12).map(renderThumb).join("") || '<div class="imageflow-empty">Keine Vorschaubilder geladen.</div>'}
          </div>
        </footer>
      </section>
    `;
  }

  function renderFavorite(favorite, current) {
    return `
      <button class="imageflow-favorite" data-action="assign" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(favorite.targetId || favorite.id || "")}" data-target-label="${escapeAttr(favorite.label)}" data-hotkey="${escapeAttr(favorite.hotkey || "")}" type="button">
        <span class="imageflow-key">${escapeHtml(favorite.hotkey || String(favorite.position || ""))}</span>
        <span><strong>${escapeHtml(favorite.label)}</strong><small>Position ${escapeHtml(String(favorite.position || ""))}</small></span>
      </button>
    `;
  }

  function renderTarget(target, current, index) {
    return `
      <button class="imageflow-target" data-action="assign" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(target.id || target.path || "")}" data-target-label="${escapeAttr(target.label || target.name || "Ziel")}" data-target-path="${escapeAttr(target.path || "")}" type="button">
        <span class="imageflow-key">${index + 1}</span>
        <span><strong>${escapeHtml(target.label || target.name || "Ziel")}</strong><small>${escapeHtml(target.location || target.path || "")}</small></span>
      </button>
    `;
  }

  function renderThumb(image) {
    return `<div class="imageflow-thumb"><strong>${escapeHtml(image.name || "Bild")}</strong><br>${escapeHtml(image.mimeType || "")}</div>`;
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

    if (state.page === "sort") {
      document.removeEventListener("keydown", handleHotkey);
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
      await load();
    } else if (action === "go-sort" && state.jobId) {
      state.page = "sort";
      await load();
    } else if (action === "open-sort" && jobId) {
      state.page = "sort";
      state.jobId = jobId;
      await load();
    } else if (action === "pause-job" && jobId) {
      await changeJobStatus(jobId, "pause");
    } else if (action === "queue-job" && jobId) {
      await changeJobStatus(jobId, "queue-execution");
    } else if (action === "discard-job" && jobId) {
      await discardJob(jobId);
    } else if (action === "assign") {
      await assignFromButton(event.currentTarget);
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
        },
      });
      state.toast = { type: "info", message: `Geplant: ${target.label}` };
      await load();
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
    if (event.key === " " || event.key === "0") {
      event.preventDefault();
      await skipCurrent(sortState.nextImages?.[0]);
      return;
    }
    const favorite = (sortState.favorites || []).find((item) => item.hotkey === event.key);
    if (favorite) {
      event.preventDefault();
      const current = sortState.nextImages?.[0];
      const button = {
        dataset: {
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
        },
      });
      state.toast = { type: "info", message: "Bild wurde uebersprungen." };
      await load();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Bild konnte nicht uebersprungen werden." };
      render();
    }
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
