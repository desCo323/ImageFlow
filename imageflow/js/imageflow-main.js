(function () {
  "use strict";

  const root = document.getElementById("imageflow-app");
  if (!root) {
    return;
  }

  const mount = root.querySelector(".imageflow-shell");
  const hasNextcloud = typeof window.OC !== "undefined" && typeof window.OC.generateUrl === "function";
  const DEFAULT_PRELOAD_RADIUS = 4;
  const THUMB_WINDOW = 16;
  const MAX_BUFFERED_IMAGES = 32;
  const PAGE_LIMIT = 48;
  const imageBuffer = new Map();
  let positionSaveTimer = null;
  let feedbackTimer = null;
  let imagePageLoadPromise = null;

  const state = {
    page: root.dataset.page || "jobs",
    jobId: numberOrNull(root.dataset.jobId),
	    jobs: [],
	    sortState: null,
	    health: null,
    imageIndex: 0,
    pageCursor: null,
    imagePage: null,
    bufferPlan: [],
    targets: [],
    toast: null,
    feedback: null,
    decisionStreak: 0,
    decisionsThisSession: 0,
    sessionStartedAt: Date.now(),
    loading: false,
    startMode: null,
    logs: {
      loading: false,
      items: [],
      level: "",
      jobId: null,
      error: null,
    },
    mockFavorites: null,
    dragFavoriteId: null,
    jobDraft: {
      name: "",
      sourcePath: "/Photos",
      targetMode: "album",
      targetPath: "/Photos/Sortiert",
      safeMode: true,
      autoProcess: false,
      preloadMode: "balanced",
    },
    folderPicker: {
      open: false,
      field: null,
      path: "/",
      data: null,
      loading: false,
      error: null,
    },
    targetBrowsePath: null,
    targetFolderPage: null,
    worklist: {
      open: false,
      jobId: null,
      loading: false,
      preview: null,
      error: null,
      autoProcess: false,
    },
  };

  function numberOrNull(value) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDisplayPath(path) {
    const parts = String(path || "/")
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part && part !== ".");
    return parts.length ? `/${parts.filter((part) => part !== "..").join("/")}` : "/";
  }

  function parentPath(path) {
    const parts = normalizeDisplayPath(path).split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
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
	    if (path === "/api/v1/health") {
	      return mockHealth();
	    }
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
        options: {
          autoProcess: Boolean(options.body.autoProcess),
          preloadMode: options.body.preloadMode || "balanced",
        },
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
    if (/\/api\/v1\/jobs\/\d+\/worklist-preview/.test(path)) {
      const jobId = Number.parseInt(path.split("/").at(4), 10) || state.jobId || 1;
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      return mockWorklistPreview(job);
    }
    if (/\/api\/v1\/jobs\/\d+\/queue-execution$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      const queued = {
        ...job,
        status: "queued",
        queuedOperations: Math.max(1, Number(job.queuedOperations || 0)),
        options: {
          ...(job.options || {}),
          autoProcess: Boolean(options.body?.autoProcess),
        },
      };
      state.jobs = state.jobs.map((item) => (item.id === jobId ? queued : item));
      return { job: queued, preview: mockWorklistPreview(queued) };
    }
    if (/\/api\/v1\/jobs\/\d+\/process-now$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      const processed = { ...job, status: "done", executedOperations: Number(job.queuedOperations || 0), queuedOperations: 0 };
      state.jobs = state.jobs.map((item) => (item.id === jobId ? processed : item));
      return {
        result: { processed: processed.executedOperations, realExecutionEnabled: true, message: "Ablage-Batch wurde verarbeitet." },
        job: processed,
        preview: mockWorklistPreview(processed),
      };
    }
    if (path.includes("/sort-state")) {
      const jobId = Number.parseInt(path.split("/").at(4), 10) || state.jobId || 1;
      const query = new URLSearchParams(path.split("?")[1] || "");
      return mockSortState(jobId, {
        cursor: query.has("cursor") ? Number.parseInt(query.get("cursor") || "0", 10) : null,
        limit: query.has("limit") ? Number.parseInt(query.get("limit") || String(PAGE_LIMIT), 10) : PAGE_LIMIT,
        start: query.get("start"),
      });
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
    if (path === "/api/v1/favorites" && options.method === "POST") {
      const favorites = mockRealFavorites();
      const duplicate = favorites.find((favorite) => favorite.targetId === options.body.targetId || (favorite.path && favorite.path === options.body.targetPath));
      if (duplicate) {
        return { favorite: duplicate, favorites: mockFavoritesWithSkip(favorites), duplicate: true };
      }
      const favorite = {
        id: Date.now(),
        label: options.body.targetLabel || options.body.label || "Favorit",
        path: options.body.targetPath || options.body.path || null,
        targetId: options.body.targetId || options.body.id || null,
        hotkey: String(Math.min(9, favorites.length + 1)),
        position: favorites.length + 1,
        locked: false,
      };
      state.mockFavorites = [...favorites, favorite].slice(0, 9).map((item, index) => ({
        ...item,
        position: index + 1,
        hotkey: String(index + 1),
      }));
      return { favorite, favorites: mockFavoritesWithSkip(state.mockFavorites), duplicate: false };
    }
    if (path === "/api/v1/favorites/reorder" && options.method === "POST") {
      const ids = Array.isArray(options.body.favoriteIds) ? options.body.favoriteIds.map(String) : [];
      const favorites = mockRealFavorites();
      const byId = new Map(favorites.map((favorite) => [String(favorite.id), favorite]));
      const ordered = [];
      ids.forEach((id) => {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      });
      favorites.forEach((favorite) => {
        if (byId.has(String(favorite.id))) {
          ordered.push(favorite);
        }
      });
      state.mockFavorites = ordered.map((item, index) => ({ ...item, position: index + 1, hotkey: String(index + 1) }));
      return { favorites: mockFavoritesWithSkip(state.mockFavorites) };
    }
    if (/\/api\/v1\/favorites\/\d+$/.test(path) && options.method === "DELETE") {
      const favoriteId = path.split("/").at(-1);
      state.mockFavorites = mockRealFavorites()
        .filter((favorite) => String(favorite.id) !== String(favoriteId))
        .map((item, index) => ({ ...item, position: index + 1, hotkey: String(index + 1) }));
      return { deleted: true, favoriteId, favorites: mockFavoritesWithSkip(state.mockFavorites) };
    }
    if (path.includes("/folders")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      return mockFolderPage(query.get("path") || "/");
    }
    if (path.includes("/targets")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const mode = query.get("mode") || "album";
      if (mode !== "album") {
        return { mode, ordering: "alphabetical", folders: mockFolderPage(query.get("path") || "/") };
      }
      return { targets: mockTargets() };
    }
    if (path.includes("/logs")) {
      return { logs: mockLogs() };
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
        options: {
          autoProcess: false,
          preloadMode: "turbo",
        },
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
        options: {
          autoProcess: true,
          preloadMode: "balanced",
        },
        updatedAt: Math.floor(Date.now() / 1000) - 900,
      },
    ];
	  }

	  function mockHealth() {
	    return {
	      app: "imageflow",
	      version: "0.1.0",
	      status: "safe-testing",
	      processingMode: "locked",
	      destructiveWritesEnabled: false,
	      realExecutionEnabled: false,
	      backgroundProcessingEnabled: false,
	      safeModeDefault: true,
	    };
	  }

  function mockSortState(jobId, pageOptions = {}) {
    const baseJob = state.jobs.find((item) => item.id === jobId) || mockJobs().find((item) => item.id === jobId) || mockJobs()[0];
    const total = mockImageCount();
    const limit = Math.max(1, Math.min(PAGE_LIMIT, Number(pageOptions.limit || PAGE_LIMIT)));
    const cursor = Math.max(0, Math.min(Math.max(0, total - 1), Number(pageOptions.cursor || 0)));
    const images = mockImagesForPage(baseJob, cursor, limit);
    const job = {
      ...baseJob,
      totalFiles: Math.max(Number(baseJob.totalFiles || 0), total),
    };
    return {
      job,
      favorites: mockFavoritesWithSkip(mockRealFavorites()),
      nextImages: images,
      imagePage: {
        cursor,
        limit,
        total,
        returned: images.length,
        hasPrevious: cursor > 0,
        previousCursor: cursor > 0 ? Math.max(0, cursor - limit) : null,
        hasNext: cursor + images.length < total,
        nextCursor: cursor + images.length < total ? cursor + images.length : null,
        mode: "mock",
      },
      start: {
        mode: pageOptions.start || "resume",
        cursor,
        index: 0,
        fileId: images[0]?.fileId || null,
      },
      savedPosition: {
        cursor,
        index: 0,
        fileId: images[0]?.fileId || null,
        savedAt: null,
      },
      recentAssignments: [],
      queue: [],
    };
  }

  function mockImageCount() {
    const count = Number.parseInt(root.dataset.mockImageCount || "3", 10);
    return Math.max(3, Math.min(5000, Number.isFinite(count) ? count : 3));
  }

  function mockImagesForPage(job, cursor, limit) {
    if (mockImageCount() <= 3) {
      return mockBaseImages(job);
    }

    const total = mockImageCount();
    const end = Math.min(total, cursor + limit);
    const images = [];
    for (let index = cursor; index < end; index += 1) {
      images.push(mockGeneratedImage(job, index));
    }
    return images;
  }

  function mockBaseImages(job) {
    return [
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
    ];
  }

  function mockGeneratedImage(job, index) {
    const number = String(index + 1).padStart(4, "0");
    const palette = [
      ["#1d1d1d", "#b7eadf", "#f4a4b8"],
      ["#2f3d46", "#d94f70", "#ffe8a3"],
      ["#33254a", "#7357c8", "#b7eadf"],
      ["#163f3a", "#ffd36e", "#d94f70"],
    ][index % 4];
    return {
      fileId: 10000 + index,
      name: `IMG_${number}.jpg`,
      path: `${job.sourcePath}/IMG_${number}.jpg`,
      mimeType: "image/jpeg",
      previewUrl: mockSvgDataUrl(1200, 800, palette, number),
      thumbnailUrl: mockSvgDataUrl(320, 220, palette, number),
    };
  }

  function mockSvgDataUrl(width, height, palette, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${palette[0]}"/><path d="M0 ${height * 0.82} ${width * 0.25} ${height * 0.45} ${width * 0.42} ${height * 0.68} ${width * 0.62} ${height * 0.36} ${width} ${height * 0.82}V${height}H0z" fill="${palette[1]}"/><circle cx="${width * 0.8}" cy="${height * 0.23}" r="${Math.max(18, width * 0.06)}" fill="${palette[2]}"/><text x="${width * 0.06}" y="${height * 0.18}" fill="#ffffff" font-family="Arial" font-size="${Math.max(22, width * 0.06)}" font-weight="700">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function mockRealFavorites() {
    if (state.mockFavorites) {
      return state.mockFavorites;
    }
    return [
      { id: "family", label: "Familie", targetId: "family", hotkey: "1", position: 1, locked: false },
      { id: "travel", label: "Reisen", targetId: "travel", hotkey: "2", position: 2, locked: false },
      { id: "archive", label: "Archiv", targetId: "archive", hotkey: "3", position: 3, locked: false },
    ];
  }

  function mockFavoritesWithSkip(favorites) {
    return [
      ...favorites,
      { id: "skip", label: "Weiter", hotkey: "0", position: 10, locked: true, targetType: "skip" },
    ];
  }

  function mockTargets() {
    return [
      { id: "family", label: "Familie", location: "Privat" },
      { id: "travel", label: "Reisen", location: "Jahresalben" },
      { id: "archive", label: "Archiv", location: "Langzeit" },
      { id: "work", label: "Projekte", location: "Arbeit" },
    ];
  }

  function mockFolderPage(path) {
    const normalized = normalizeDisplayPath(path || "/");
    const tree = {
      "/": [
        { name: "Camera", path: "/Camera", hasChildren: true },
        { name: "Photos", path: "/Photos", hasChildren: true },
        { name: "Projects", path: "/Projects", hasChildren: false },
      ],
      "/Camera": [
        { name: "Unsortiert", path: "/Camera/Unsortiert", hasChildren: false },
      ],
      "/Photos": [
        { name: "Inbox", path: "/Photos/Inbox", hasChildren: false },
        { name: "Sortiert", path: "/Photos/Sortiert", hasChildren: false },
      ],
    };
    const folders = tree[normalized] || [];
    return {
      current: {
        name: normalized === "/" ? "Dateien" : normalized.split("/").filter(Boolean).at(-1),
        path: normalized,
      },
      parent: parentPath(normalized),
      folders,
      imageCount: normalized === "/Photos" ? 3 : 0,
      total: folders.length,
      limit: 150,
      truncated: false,
    };
  }

  function mockWorklistPreview(job) {
    const mode = job.targetMode || "album";
    const queued = job.status === "queued";
    const itemStatus = queued ? "queued" : "planned";
    return {
      job: {
        id: job.id,
        name: job.name,
        targetMode: mode,
          safeMode: job.safeMode !== false,
          status: job.status || "sorting",
          options: job.options || {},
        },
      summary: {
        total: 3,
        planned: queued ? 0 : 3,
        queued: queued ? 3 : 0,
        executing: 0,
        blocked: 0,
        executed: 0,
        failed: 0,
        ready: 2,
        warnings: 1,
        errors: 0,
      },
      canQueue: !queued,
      executionMode: "dry-run-only",
      backgroundMode: "manual-only",
      autoProcess: Boolean(job.options?.autoProcess),
      message: "Dateioperationen sind weiterhin gesperrt. Diese Vorschau prueft die Worklist vor der spaeteren Freigabe realer Writes.",
      items: [
        {
          id: 1,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4021.jpg`,
          targetPath: mode === "album" ? null : (job.targetPath || "/Photos/Sortiert"),
          targetAlbumId: mode === "album" ? "family" : null,
          status: itemStatus,
          safeMode: true,
          readiness: "ready",
          messages: ["Bereit fuer sichere Pruefung mit Checksumme."],
        },
        {
          id: 2,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4022.jpg`,
          targetPath: mode === "album" ? null : (job.targetPath || "/Photos/Sortiert"),
          targetAlbumId: mode === "album" ? "travel" : null,
          status: itemStatus,
          safeMode: true,
          readiness: "warning",
          messages: ["Zieldatei existiert bereits; die spaetere Ablage muss das Duplikat sicher ueberspringen."],
        },
        {
          id: 3,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4023.jpg`,
          targetPath: mode === "album" ? null : (job.targetPath || "/Photos/Sortiert"),
          targetAlbumId: mode === "album" ? "archive" : null,
          status: itemStatus,
          safeMode: true,
          readiness: "ready",
          messages: ["Bereit fuer sichere Pruefung mit Checksumme."],
        },
      ],
    };
  }

  function mockLogs() {
    const now = Math.floor(Date.now() / 1000);
    return [
      {
        id: 1003,
        level: "debug",
        event: "image_buffer_synced",
        jobId: state.jobId || 1,
        message: "Bildpuffer wurde rund um die aktuelle Position aufgebaut.",
        context: { bufferedImages: state.bufferPlan.length || 9, preloadMode: "turbo" },
        createdAt: now - 8,
      },
      {
        id: 1002,
        level: "info",
        event: "job_execution_queued",
        jobId: 1,
        message: "Ablage wurde vorgemerkt.",
        context: { safeMode: true, autoProcess: false },
        createdAt: now - 80,
      },
      {
        id: 1001,
        level: "debug",
        event: "assignment_planned",
        jobId: 1,
        message: "Sortierentscheidung wurde als geplante Operation gespeichert.",
        context: { sourcePath: "/Photos/Inbox/IMG_4021.jpg", targetLabel: "Familie" },
        createdAt: now - 160,
      },
    ];
  }

  async function load() {
    state.loading = true;
    render();
    try {
      if (state.page === "sort" && state.jobId) {
        await loadImagePage(state.pageCursor, null, false, state.startMode);
      } else if (state.page === "logs") {
        const params = new URLSearchParams({ limit: "120" });
        const payload = await request(`/api/v1/logs?${params.toString()}`);
        state.logs.items = payload.logs || [];
	      } else {
	        const payload = await request("/api/v1/jobs");
	        state.jobs = payload.jobs || [];
	        await loadHealth();
	      }
    } catch (error) {
      state.toast = { type: "error", message: error.message || "ImageFlow konnte nicht geladen werden." };
    } finally {
      state.loading = false;
      render();
	  }

	  async function loadHealth() {
	    try {
	      state.health = await request("/api/v1/health");
	    } catch (error) {
	      state.health = null;
	    }
	  }
  }

  async function loadImagePage(cursor = null, preferredIndex = null, renderLoading = true, startMode = null) {
    if (!state.jobId) {
      return;
    }
    if (renderLoading) {
      state.loading = true;
      render();
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    const requestedStart = cursor === null || cursor === undefined ? startMode || state.startMode : null;
    if (cursor !== null && cursor !== undefined) {
      params.set("cursor", String(Math.max(0, Number(cursor) || 0)));
    } else if (requestedStart) {
      params.set("start", requestedStart);
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`);
      state.sortState = payload;
      state.imagePage = payload.imagePage || defaultImagePage(payload.nextImages || []);
      state.pageCursor = Number(state.imagePage.cursor || 0);
      const saved = payload.savedPosition || {};
      const start = payload.start || {};
      const startCursor = Number(start.cursor || 0);
      const savedIndex = Number(saved.cursor || 0) === state.pageCursor ? Number(saved.index || 0) : 0;
      const startIndex = requestedStart && startCursor === state.pageCursor ? Number(start.index || 0) : null;
      state.imageIndex = clampIndex(preferredIndex ?? startIndex ?? savedIndex, sortImages(payload));
      state.startMode = null;
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
    const targetMode = mode || "album";
    const params = new URLSearchParams({ mode: targetMode, limit: "100" });
    if (targetMode !== "album") {
      if (!state.targetBrowsePath) {
        state.targetBrowsePath = state.sortState?.job?.targetPath || "/";
      }
      params.set("path", state.targetBrowsePath);
    }

    const payload = await request(`/api/v1/targets?${params.toString()}`);
    state.targetFolderPage = payload.folders || null;
    state.targets = payload.targets || payload.folders?.folders || [];
  }

  function render() {
    mount.setAttribute("aria-busy", state.loading ? "true" : "false");
    mount.innerHTML = `
      <div class="imageflow-app">
        ${renderTopbar()}
        <main class="imageflow-content">
          ${state.page === "sort" ? renderSortPage() : (state.page === "logs" ? renderLogsPage() : renderJobsPage())}
          ${renderToast()}
          ${renderFolderPicker()}
          ${renderWorklistPreview()}
        </main>
      </div>
    `;
    bindActions();
    syncImageBuffer();
  }

  function renderTopbar() {
    return `
      <header class="imageflow-topbar">
        <span class="imageflow-mark" aria-hidden="true"><span></span></span>
        <div class="imageflow-title">
          <h2>ImageFlow</h2>
          <p>Bildstapel in einen schnellen, sicheren Flow bringen.</p>
        </div>
        <nav class="imageflow-tabs" aria-label="ImageFlow">
          <button class="imageflow-tab ${state.page === "jobs" ? "is-active" : ""}" data-action="go-jobs" type="button">Flows</button>
          <button class="imageflow-tab ${state.page === "sort" ? "is-active" : ""}" data-action="go-sort" type="button" ${state.jobId ? "" : "disabled"}>Sortieren</button>
          <button class="imageflow-tab ${state.page === "logs" ? "is-active" : ""}" data-action="show-log" type="button">Protokoll</button>
        </nav>
      </header>
    `;
  }

	  function renderJobsPage() {
	    const totals = summarizeJobs(state.jobs);
	    const draft = state.jobDraft;
	    return `
	      <section class="imageflow-dashboard" aria-label="Flows">
	        ${renderSafetyStrip()}
	        <form class="imageflow-panel accent-pink imageflow-form" id="imageflow-job-form">
          <div class="imageflow-panel-head">
            <div>
              <h3>Flow starten</h3>
              <p>Waehle deinen Bildstapel, leg die Ablage fest und sammle Entscheidungen in einem schnellen Lauf.</p>
            </div>
          </div>
          <div class="imageflow-field">
            <label for="ifl-name">Name</label>
            <input id="ifl-name" name="name" type="text" maxlength="160" placeholder="z. B. Urlaub Import" value="${escapeAttr(draft.name)}">
          </div>
          <div class="imageflow-field">
            <label for="ifl-source">Quellordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-source" name="sourcePath" type="text" value="${escapeAttr(draft.sourcePath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="sourcePath" type="button">Auswaehlen</button>
            </div>
            <small>Pfade werden serverseitig normalisiert und bleiben auf deinen Nextcloud-Dateibaum begrenzt.</small>
          </div>
          <div class="imageflow-field">
            <label for="ifl-mode">Sortierart</label>
            <select id="ifl-mode" name="targetMode">
              <option value="album" ${draft.targetMode === "album" ? "selected" : ""}>Nextcloud-Album zuordnen</option>
              <option value="move" ${draft.targetMode === "move" ? "selected" : ""}>In Ordner verschieben</option>
              <option value="copy" ${draft.targetMode === "copy" ? "selected" : ""}>In Ordner kopieren</option>
            </select>
          </div>
          <div class="imageflow-field" data-target-path-field hidden>
            <label for="ifl-target">Zielordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-target" name="targetPath" type="text" value="${escapeAttr(draft.targetPath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="targetPath" type="button">Auswaehlen</button>
            </div>
          </div>
          <label class="imageflow-toggle">
            <input id="ifl-safe" name="safeMode" type="checkbox" ${draft.safeMode ? "checked" : ""}>
            Sicherer Modus mit Pruefsummen
          </label>
          <label class="imageflow-toggle">
            <input id="ifl-auto" name="autoProcess" type="checkbox" ${draft.autoProcess ? "checked" : ""}>
            In ruhigen Serverphasen automatisch ablegen
          </label>
          <div class="imageflow-field">
            <label for="ifl-preload">Bildpuffer</label>
            <select id="ifl-preload" name="preloadMode">
              <option value="light" ${draft.preloadMode === "light" ? "selected" : ""}>Schonend</option>
              <option value="balanced" ${draft.preloadMode === "balanced" ? "selected" : ""}>Ausgewogen</option>
              <option value="turbo" ${draft.preloadMode === "turbo" ? "selected" : ""}>Turbo fuer grosse Bildstapel</option>
            </select>
          </div>
          <div class="imageflow-actions">
            <button class="imageflow-button primary" type="submit">Flow starten</button>
          </div>
        </form>
        <section class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Flow-Zentrale</h3>
              <p>Fortschritt, Tempo und Ablagefreigabe bleiben an einem Ort.</p>
            </div>
            <button class="imageflow-button" data-action="refresh" type="button">Aktualisieren</button>
          </div>
          <div class="imageflow-status-grid">
            <div class="imageflow-stat"><strong>${totals.jobs}</strong><span>Flows</span></div>
            <div class="imageflow-stat"><strong>${totals.sorted}</strong><span>Eingesammelt</span></div>
            <div class="imageflow-stat"><strong>${totals.queued}</strong><span>In der Ablage</span></div>
            <div class="imageflow-stat"><strong>${totals.failed}</strong><span>Fehler</span></div>
          </div>
          ${renderJobTable()}
        </section>
      </section>
	    `;
	  }

	  function renderSafetyStrip() {
	    const health = state.health || mockHealth();
	    const realWrites = Boolean(health.realExecutionEnabled || health.destructiveWritesEnabled);
	    const background = Boolean(health.backgroundProcessingEnabled);
	    const title = realWrites ? "Dateioperationen aktiv" : "Sicherer Testbetrieb";
	    const message = realWrites
	      ? "Reale Dateioperationen sind serverseitig freigeschaltet. Worklists koennen Dateien veraendern."
	      : "Reale Dateioperationen sind serverseitig gesperrt. Worklists koennen geprueft und vorgemerkt werden, ohne Dateien zu veraendern.";
	    return `
	      <section class="imageflow-safety-strip ${realWrites ? "is-live" : ""}" aria-label="Sicherheitsstatus">
	        <div>
	          <h3>${escapeHtml(title)}</h3>
	          <p>${escapeHtml(message)}</p>
	        </div>
	        <div class="imageflow-safety-badges">
	          <span class="imageflow-badge ${realWrites ? "warning" : "safe"}">${realWrites ? "Dateioperationen aktiv" : "Dateioperationen gesperrt"}</span>
	          <span class="imageflow-badge ${background ? "warning" : ""}">${background ? "Cron-Ablage aktiv" : "Cron-Ablage aus"}</span>
	          <span class="imageflow-badge safe">Safe Mode Standard</span>
	        </div>
	      </section>
	    `;
	  }

  function renderJobTable() {
    if (state.jobs.length === 0) {
      return `<div class="imageflow-empty">Noch keine Flows vorhanden.</div>`;
    }

    return `
      <div class="imageflow-table-wrap">
        <table class="imageflow-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Bildstapel</th>
              <th>Ablage</th>
              <th>Status</th>
              <th>Stand</th>
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
    const options = job.options || {};
    return `
      <tr>
        <td>
          <strong>${escapeHtml(job.name)}</strong><br>
          <span class="imageflow-badge safe">${job.safeMode ? "Sicher" : "Standard"}</span>
          <span class="imageflow-badge ${options.autoProcess ? "ready" : ""}">${options.autoProcess ? "Auto-Ablage" : "Warten"}</span>
        </td>
        <td>${escapeHtml(job.sourcePath || "/")}</td>
        <td>${modeLabel(job.targetMode)}</td>
        <td><span class="imageflow-badge ready">${statusLabel(job.status)}</span></td>
        <td>${Number(job.sortedFiles || 0)} eingesammelt<br>${Number(job.queuedOperations || 0)} in Ablage</td>
        <td>
          <div class="imageflow-actions">
            <button class="imageflow-button primary" data-action="open-sort" data-start-mode="resume" data-job-id="${job.id}" type="button">Fortsetzen</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="begin" data-job-id="${job.id}" type="button">Von vorne</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="unsorted" data-job-id="${job.id}" type="button">Offen</button>
            <button class="imageflow-button" data-action="pause-job" data-job-id="${job.id}" type="button">Pausieren</button>
            <button class="imageflow-button primary" data-action="queue-job" data-job-id="${job.id}" type="button">Ablage pruefen</button>
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
    const targetFolder = state.targetFolderPage;
    const isFolderMode = job.targetMode === "move" || job.targetMode === "copy";
    const progress = progressStats(job, page, images);
    const tempo = sessionTempo();
    const milestone = flowMilestone(progress.percent, state.decisionStreak);

    return `
      <section class="imageflow-sort" aria-label="Sortieransicht">
        <header class="imageflow-job-head">
          <div>
            <h3>${escapeHtml(job.name || "Flow")}</h3>
            <p>${escapeHtml(job.sourcePath || "/")} · ${modeLabel(job.targetMode)} · ${statusLabel(job.status)} · Bild ${images.length ? currentIndex + 1 : 0}/${images.length}</p>
          </div>
          <div class="imageflow-toolbar">
            <span class="imageflow-badge safe">${job.safeMode ? "Sicherer Modus" : "Standardmodus"}</span>
            <span class="imageflow-badge">${Number(job.sortedFiles || 0)} eingesammelt</span>
            <span class="imageflow-badge">${Number(job.queuedOperations || 0)} in Ablage</span>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="resume" type="button">Fortsetzen</button>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="begin" type="button">Von vorne</button>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="unsorted" type="button">Offen</button>
            <button class="imageflow-button" data-action="go-jobs" type="button">Zurueck</button>
          </div>
        </header>
        <section class="imageflow-gamebar" aria-label="Flow-Fortschritt">
          <div class="imageflow-flow-meter">
            <div class="imageflow-flow-meter-head">
              <strong>${progress.done}/${progress.total} im Flow</strong>
              <span>${progress.percent}%</span>
            </div>
            <div class="imageflow-progress-track" aria-hidden="true">
              <span class="imageflow-progress-fill" style="width: ${progress.percent}%"></span>
            </div>
          </div>
          <div class="imageflow-flow-chip accent-warm">
            <strong>${state.decisionStreak}</strong>
            <span>Serie</span>
          </div>
          <div class="imageflow-flow-chip accent-cool">
            <strong>${state.decisionsThisSession}</strong>
            <span>Jetzt gesammelt</span>
          </div>
          <div class="imageflow-flow-chip accent-violet">
            <strong>${tempo}</strong>
            <span>Bilder/min</span>
          </div>
          <div class="imageflow-flow-chip accent-cool">
            <strong>${bufferPlan.length}</strong>
            <span>Puffer</span>
          </div>
          <div class="imageflow-flow-milestone">${escapeHtml(milestone)}</div>
        </section>
        <div class="imageflow-sort-grid">
          <aside class="imageflow-rail">
            <h4>Schnellziele</h4>
            <div class="imageflow-favorite-list">
              ${(sortState.favorites || []).map((favorite) => renderFavorite(favorite, current)).join("")}
            </div>
          </aside>
          <section class="imageflow-photo-stage">
            <div class="imageflow-photo">
              <div class="imageflow-photo-card ${state.feedback ? "is-celebrating" : ""}">
                ${preview ? `<img class="imageflow-photo-img" src="${escapeAttr(preview)}" alt="${escapeAttr(current.name || "Bild")}" decoding="async" fetchpriority="high" draggable="false">` : '<div class="imageflow-photo-icon" aria-hidden="true"></div>'}
                <div class="imageflow-photo-meta">
                  <strong>${escapeHtml(current.name || "Bild")}</strong>
                  <span>${escapeHtml(current.path || "")}</span>
                </div>
                ${renderFeedbackBurst()}
              </div>
            </div>
            <div class="imageflow-hotkeys">
              <span class="imageflow-hotkey"><b>1-9</b> Schnellziel</span>
              <span class="imageflow-hotkey"><b>0</b> Weiter</span>
              <span class="imageflow-hotkey"><b>Leertaste</b> Weiter</span>
              <span class="imageflow-hotkey"><b>←/→</b> Bildband</span>
            </div>
          </section>
          <aside class="imageflow-targets">
            <div class="imageflow-panel-head">
              <div>
                <h4>Ablageziele</h4>
                <p>${job.targetMode === "album" ? "Alben alphabetisch" : escapeHtml(targetFolder?.current?.path || state.targetBrowsePath || "/")}</p>
              </div>
              ${isFolderMode ? `<button class="imageflow-button" data-action="browse-target-parent" type="button" ${targetFolder?.parent ? "" : "disabled"}>Hoeher</button>` : ""}
            </div>
            <div class="imageflow-target-list">
              ${(state.targets.length ? state.targets : (isFolderMode ? [] : mockTargets())).map((target, index) => renderTarget(target, current, index, isFolderMode)).join("") || '<div class="imageflow-empty">Keine Ablageziele in diesem Ordner.</div>'}
            </div>
          </aside>
        </div>
        <footer class="imageflow-filmstrip">
          <div class="imageflow-filmstrip-head">
            <div>
              <strong>Bildband</strong>
              <span>${pageStart}-${pageEnd} von ${Number(page.total || images.length)} · ${bufferPlan.length} im Puffer</span>
            </div>
            <div class="imageflow-page-actions">
              <button class="imageflow-icon-button" data-action="page-prev" type="button" ${page.hasPrevious ? "" : "disabled"}>Zurueck</button>
              <button class="imageflow-icon-button" data-action="page-next" type="button" ${page.hasNext ? "" : "disabled"}>Weiter</button>
            </div>
          </div>
          <div class="imageflow-strip" role="listbox" aria-label="Bildband">
            ${filmstrip.items.map((image, offset) => renderThumb(image, filmstrip.start + offset, currentIndex, bufferPlan)).join("") || '<div class="imageflow-empty">Keine Vorschaubilder geladen.</div>'}
          </div>
        </footer>
      </section>
    `;
  }

  function renderFavorite(favorite, current) {
    const isSkip = favorite.locked || favorite.targetType === "skip" || favorite.id === "skip";
    const favoriteId = String(favorite.id || "");
    const rowAttrs = isSkip
      ? ""
      : `draggable="true" data-favorite-id="${escapeAttr(favoriteId)}"`;
    const action = isSkip ? "skip-current" : "assign";
    const remove = isSkip
      ? '<span class="imageflow-mini-spacer" aria-hidden="true"></span>'
      : `<button class="imageflow-mini-button danger" data-action="remove-favorite" data-favorite-id="${escapeAttr(favoriteId)}" aria-label="Schnellziel entfernen: ${escapeAttr(favorite.label)}" title="Schnellziel entfernen" type="button">x</button>`;
    return `
      <div class="imageflow-favorite-row ${isSkip ? "is-fixed" : ""}" ${rowAttrs}>
        <span class="imageflow-drag-handle" aria-hidden="true">::</span>
        <button class="imageflow-favorite" data-action="${action}" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(favorite.targetId || favorite.id || "")}" data-target-label="${escapeAttr(favorite.label)}" data-target-path="${escapeAttr(favorite.path || "")}" data-hotkey="${escapeAttr(favorite.hotkey || "")}" type="button">
          <span class="imageflow-key">${escapeHtml(favorite.hotkey || String(favorite.position || ""))}</span>
          <span><strong>${escapeHtml(favorite.label)}</strong><small>Position ${escapeHtml(String(favorite.position || ""))}</small></span>
        </button>
        ${remove}
      </div>
    `;
  }

  function renderTarget(target, current, index, isFolderMode = false) {
    const label = target.label || target.name || "Ziel";
    const targetId = target.id || target.path || "";
    const targetPath = target.path || "";
    const browse = isFolderMode && target.hasChildren
      ? `<button class="imageflow-mini-button" data-action="browse-target-folder" data-target-path="${escapeAttr(targetPath)}" aria-label="Ordner oeffnen: ${escapeAttr(label)}" title="Ordner oeffnen" type="button">›</button>`
      : "";
    return `
      <div class="imageflow-target-row">
        <button class="imageflow-target" data-action="assign" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(targetId)}" data-target-label="${escapeAttr(label)}" data-target-path="${escapeAttr(targetPath)}" type="button">
          <span class="imageflow-key">${index + 1}</span>
          <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(target.location || target.path || "")}</small></span>
        </button>
        ${browse}
        <button class="imageflow-mini-button" data-action="add-favorite" data-target-id="${escapeAttr(targetId)}" data-target-label="${escapeAttr(label)}" data-target-path="${escapeAttr(targetPath)}" aria-label="Zu Schnellzielen: ${escapeAttr(label)}" title="Zu Schnellzielen" type="button">+</button>
      </div>
    `;
  }

  function renderFeedbackBurst() {
    const feedback = state.feedback;
    if (!feedback) {
      return "";
    }

    const title = feedback.type === "skip" ? "Weiter" : (feedback.type === "duplicate" ? "Schon da" : "+1");
    const label = feedback.label ? `zu ${feedback.label}` : "gesammelt";
    return `
      <div class="imageflow-feedback-burst ${feedback.type === "skip" ? "skip" : ""}" role="status">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(label)}</span>
        <small>${Number(feedback.streak || 0)}er Serie</small>
      </div>
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

  function renderFolderPicker() {
    if (!state.folderPicker.open) {
      return "";
    }
    const picker = state.folderPicker;
    const fallback = {
      current: { name: "Dateien", path: picker.path || "/" },
      parent: parentPath(picker.path || "/"),
      folders: [],
      imageCount: 0,
    };
    const data = picker.data || (hasNextcloud ? fallback : mockFolderPage(picker.path || "/"));
    const currentPath = data.current?.path || picker.path || "/";
    const title = picker.field === "targetPath" ? "Zielordner auswaehlen" : "Quellordner auswaehlen";
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
          <header class="imageflow-modal-head">
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(currentPath)} · ${Number(data.imageCount || 0)} Bilder direkt in diesem Ordner</p>
            </div>
            <button class="imageflow-icon-button" data-action="close-folder-picker" type="button">Schliessen</button>
          </header>
          <div class="imageflow-folder-actions">
            <button class="imageflow-button" data-action="folder-picker-parent" type="button" ${data.parent ? "" : "disabled"}>Hoeher</button>
            <button class="imageflow-button primary" data-action="choose-folder" data-folder-path="${escapeAttr(currentPath)}" type="button" ${picker.loading ? "disabled" : ""}>Diesen Ordner waehlen</button>
          </div>
          ${picker.error ? `<div class="imageflow-empty">${escapeHtml(picker.error)}</div>` : ""}
          <div class="imageflow-folder-list">
            ${picker.loading && hasNextcloud ? '<div class="imageflow-empty">Ordner werden geladen.</div>' : ((data.folders || []).map(renderFolderPickerRow).join("") || '<div class="imageflow-empty">Keine Unterordner vorhanden.</div>')}
          </div>
        </section>
      </div>
    `;
  }

  function renderFolderPickerRow(folder) {
    return `
      <div class="imageflow-folder-row">
        <button class="imageflow-folder-main" data-action="folder-picker-open" data-folder-path="${escapeAttr(folder.path)}" type="button">
          <strong>${escapeHtml(folder.name)}</strong>
          <span>${escapeHtml(folder.path)}${folder.hasChildren ? " · Unterordner" : ""}</span>
        </button>
        <button class="imageflow-button" data-action="choose-folder" data-folder-path="${escapeAttr(folder.path)}" type="button">Waehlen</button>
      </div>
    `;
  }

  function renderWorklistPreview() {
    if (!state.worklist.open) {
      return "";
    }
    const preview = state.worklist.preview;
    const summary = preview?.summary || {};
    const items = preview?.items || [];
    const queuedCount = Number(summary.queued || 0) + Number(summary.executing || 0);
    const canSaveQueueSettings = queuedCount > 0 && !preview?.canQueue;
    const queueButtonEnabled = Boolean(preview?.canQueue || canSaveQueueSettings);
    const queueButtonLabel = canSaveQueueSettings
      ? "Einstellung speichern"
      : (preview?.executionMode === "real-writes-enabled" ? "Ablage freigeben" : "Ablage vormerken");
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal imageflow-worklist-modal" role="dialog" aria-modal="true" aria-label="Ablage pruefen">
          <header class="imageflow-modal-head">
            <div>
              <h3>Ablage pruefen</h3>
              <p>${escapeHtml(preview?.job?.name || "Flow")} | ${modeLabel(preview?.job?.targetMode || "")}</p>
            </div>
            ${preview ? `<span class="imageflow-badge ${executionModeClass(preview.executionMode)}">${executionModeLabel(preview.executionMode)}</span>` : ""}
            ${preview ? `<span class="imageflow-badge ${preview.backgroundMode === "cron-enabled" ? "ready" : "safe"}">${backgroundModeLabel(preview.backgroundMode)}</span>` : ""}
            <button class="imageflow-icon-button" data-action="close-worklist-preview" type="button">Schliessen</button>
          </header>
          ${state.worklist.loading ? '<div class="imageflow-empty">Worklist wird geprueft.</div>' : ""}
          ${state.worklist.error ? `<div class="imageflow-empty">${escapeHtml(state.worklist.error)}</div>` : ""}
          ${preview ? `
            <div class="imageflow-status-grid">
              <div class="imageflow-stat"><strong>${Number(summary.total || 0)}</strong><span>Ablagepunkte</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.ready || 0)}</strong><span>Bereit</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.warnings || 0)}</strong><span>Warnungen</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.errors || 0)}</strong><span>Fehler</span></div>
              <div class="imageflow-stat"><strong>${queuedCount}</strong><span>Vorgemerkt</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.executed || 0)}</strong><span>Erledigt</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.blocked || 0) + Number(summary.failed || 0)}</strong><span>Geblockt</span></div>
            </div>
            <div class="imageflow-worklist-note">${escapeHtml(preview.message || "")}</div>
            <label class="imageflow-toggle imageflow-worklist-toggle">
              <input id="ifl-worklist-auto" data-action="toggle-worklist-auto" type="checkbox" ${state.worklist.autoProcess ? "checked" : ""}>
              Diese Ablage in ruhigen Serverphasen automatisch verarbeiten
            </label>
            <div class="imageflow-worklist-table">
              ${items.map(renderWorklistItem).join("") || '<div class="imageflow-empty">Noch keine Ablagepunkte vorhanden.</div>'}
            </div>
            <div class="imageflow-folder-actions">
              <button class="imageflow-button" data-action="refresh-worklist-preview" type="button">Neu pruefen</button>
              <button class="imageflow-button primary" data-action="confirm-queue-job" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${queueButtonEnabled ? "" : "disabled"}>${queueButtonLabel}</button>
              <button class="imageflow-button" data-action="process-job-now" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${preview.executionMode === "real-writes-enabled" && queuedCount > 0 ? "" : "disabled"}>Jetzt verarbeiten</button>
            </div>
          ` : ""}
        </section>
      </div>
    `;
  }

  function renderWorklistItem(item) {
    const badgeClass = item.readiness === "error" ? "danger" : item.readiness === "warning" ? "ready" : "safe";
    return `
      <div class="imageflow-worklist-row">
        <div>
          <strong>${escapeHtml(modeLabel(item.operationType))}</strong>
          <span>${escapeHtml(item.sourcePath || "")}</span>
          <small>${escapeHtml(item.targetPath || item.targetAlbumId || "")}</small>
          <small>${escapeHtml(queueStatusLabel(item.status))}${item.safeMode ? " | Safe Mode" : ""}</small>
        </div>
        <span class="imageflow-badge ${badgeClass}">${readinessLabel(item.readiness)}</span>
        <p>${(item.messages || []).map(escapeHtml).join(" ")}</p>
      </div>
    `;
  }

  function renderLogsPage() {
    const logs = state.logs.items || [];
    return `
      <section class="imageflow-log-page" aria-label="Protokoll">
        <div class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Protokoll</h3>
              <p>Debug- und Sicherheitsereignisse fuer deine Flows.</p>
            </div>
            <div class="imageflow-actions">
              <select class="imageflow-select-compact" data-action="change-log-level" aria-label="Log-Level">
                <option value="" ${state.logs.level === "" ? "selected" : ""}>Alle Level</option>
                <option value="debug" ${state.logs.level === "debug" ? "selected" : ""}>Debug</option>
                <option value="info" ${state.logs.level === "info" ? "selected" : ""}>Info</option>
                <option value="warning" ${state.logs.level === "warning" ? "selected" : ""}>Warnung</option>
                <option value="error" ${state.logs.level === "error" ? "selected" : ""}>Fehler</option>
              </select>
              <button class="imageflow-button" data-action="refresh-logs" type="button">Aktualisieren</button>
            </div>
          </div>
          ${state.logs.loading ? '<div class="imageflow-empty">Protokoll wird geladen.</div>' : ""}
          ${state.logs.error ? `<div class="imageflow-empty">${escapeHtml(state.logs.error)}</div>` : ""}
          <div class="imageflow-log-list">
            ${logs.map(renderLogRow).join("") || '<div class="imageflow-empty">Noch keine Protokolleintraege vorhanden.</div>'}
          </div>
        </div>
      </section>
    `;
  }

  function renderLogRow(log) {
    return `
      <article class="imageflow-log-row">
        <span class="imageflow-badge ${log.level === "error" ? "danger" : log.level === "warning" ? "ready" : "safe"}">${escapeHtml(log.level || "info")}</span>
        <div>
          <strong>${escapeHtml(log.event || "event")}</strong>
          <span>${escapeHtml(log.message || "")}</span>
          <small>${formatTime(log.createdAt)}${log.jobId ? ` · Flow ${escapeHtml(String(log.jobId))}` : ""}</small>
          ${log.context ? `<code>${escapeHtml(JSON.stringify(log.context))}</code>` : ""}
        </div>
      </article>
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
      form.addEventListener("input", updateJobDraft);
      form.addEventListener("change", updateJobDraft);
      const mode = document.getElementById("ifl-mode");
      mode?.addEventListener("change", toggleTargetPath);
      toggleTargetPath();
    }

    root.querySelectorAll("[data-action]").forEach((button) => {
      const eventName = ["SELECT", "INPUT"].includes(button.tagName) ? "change" : "click";
      button.addEventListener(eventName, handleAction);
    });
    bindFavoriteDragAndDrop();

    document.removeEventListener("keydown", handleHotkey);
    if (state.page === "sort") {
      document.addEventListener("keydown", handleHotkey);
    }
  }

  async function createJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    readJobDraft(form);
    const body = {
      name: state.jobDraft.name.trim(),
      sourcePath: state.jobDraft.sourcePath.trim() || "/",
      targetMode: state.jobDraft.targetMode,
      targetPath: state.jobDraft.targetPath.trim(),
      safeMode: state.jobDraft.safeMode,
      autoProcess: state.jobDraft.autoProcess,
      preloadMode: state.jobDraft.preloadMode,
    };

    try {
      const payload = await request("/api/v1/jobs", { method: "POST", body });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: "Flow wurde gestartet." };
      state.jobDraft.name = "";
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow konnte nicht gestartet werden." };
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

  function updateJobDraft(event) {
    const form = event.currentTarget.closest ? event.currentTarget.closest("form") : document.getElementById("imageflow-job-form");
    readJobDraft(form);
    if (event.target?.name === "targetMode") {
      toggleTargetPath();
    }
  }

  function readJobDraft(form = document.getElementById("imageflow-job-form")) {
    if (!form) {
      return;
    }
    state.jobDraft = {
      name: form.name?.value || "",
      sourcePath: form.sourcePath?.value || "/",
      targetMode: form.targetMode?.value || "album",
      targetPath: form.targetPath?.value || "/Photos/Sortiert",
      safeMode: Boolean(form.safeMode?.checked),
      autoProcess: Boolean(form.autoProcess?.checked),
      preloadMode: form.preloadMode?.value || "balanced",
    };
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
      await openSort(state.jobId, "resume");
    } else if (action === "open-sort" && jobId) {
      await openSort(jobId, event.currentTarget.dataset.startMode || "resume");
    } else if (action === "start-sort") {
      await restartSort(event.currentTarget.dataset.startMode || "resume");
    } else if (action === "pause-job" && jobId) {
      await changeJobStatus(jobId, "pause");
    } else if (action === "queue-job" && jobId) {
      await openWorklistPreview(jobId);
    } else if (action === "discard-job" && jobId) {
      await discardJob(jobId);
    } else if (action === "assign") {
      await assignFromButton(event.currentTarget);
    } else if (action === "skip-current") {
      await skipCurrent(currentImage());
    } else if (action === "add-favorite") {
      await addFavoriteFromButton(event.currentTarget);
    } else if (action === "remove-favorite") {
      await removeFavorite(numberOrNull(event.currentTarget.dataset.favoriteId));
    } else if (action === "open-folder-picker") {
      await openFolderPicker(event.currentTarget.dataset.pickerField);
    } else if (action === "close-folder-picker") {
      closeFolderPicker();
    } else if (action === "folder-picker-open") {
      await loadFolderPicker(event.currentTarget.dataset.folderPath || "/");
    } else if (action === "folder-picker-parent") {
      await loadFolderPicker(state.folderPicker.data?.parent || "/");
    } else if (action === "choose-folder") {
      chooseFolder(event.currentTarget.dataset.folderPath || state.folderPicker.path || "/");
    } else if (action === "browse-target-folder") {
      await browseTargetFolder(event.currentTarget.dataset.targetPath || "/");
    } else if (action === "browse-target-parent") {
      await browseTargetFolder(state.targetFolderPage?.parent || "/");
    } else if (action === "close-worklist-preview") {
      closeWorklistPreview();
    } else if (action === "refresh-worklist-preview") {
      await loadWorklistPreview(state.worklist.jobId);
    } else if (action === "toggle-worklist-auto") {
      state.worklist.autoProcess = Boolean(event.currentTarget.checked);
      render();
    } else if (action === "confirm-queue-job" && jobId) {
      await confirmQueueJob(jobId);
    } else if (action === "process-job-now" && jobId) {
      await processJobNow(jobId);
    } else if (action === "select-image") {
      setImageIndex(numberOrNull(event.currentTarget.dataset.index) ?? state.imageIndex);
    } else if (action === "page-next") {
      await goToImagePage(pageInfo().nextCursor, 0);
    } else if (action === "page-prev") {
      await goToImagePage(pageInfo().previousCursor, PAGE_LIMIT - 1);
    } else if (action === "refresh-logs") {
      await loadLogs();
    } else if (action === "change-log-level") {
      state.logs.level = event.currentTarget.value || "";
      await loadLogs();
    } else if (action === "show-log") {
      await openLogs();
    }
  }

  function bindFavoriteDragAndDrop() {
    root.querySelectorAll(".imageflow-favorite-row[draggable='true']").forEach((row) => {
      row.addEventListener("dragstart", handleFavoriteDragStart);
      row.addEventListener("dragover", handleFavoriteDragOver);
      row.addEventListener("drop", handleFavoriteDrop);
      row.addEventListener("dragend", handleFavoriteDragEnd);
    });
  }

  function handleFavoriteDragStart(event) {
    const id = event.currentTarget.dataset.favoriteId;
    state.dragFavoriteId = id;
    event.currentTarget.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id || "");
    }
  }

  function handleFavoriteDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  async function handleFavoriteDrop(event) {
    event.preventDefault();
    const targetId = event.currentTarget.dataset.favoriteId;
    const sourceId = event.dataTransfer?.getData("text/plain") || state.dragFavoriteId;
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const ids = realFavorites().map((favorite) => String(favorite.id));
    const sourceIndex = ids.indexOf(String(sourceId));
    const targetIndex = ids.indexOf(String(targetId));
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, String(sourceId));
    await reorderFavorites(ids);
  }

  function handleFavoriteDragEnd(event) {
    state.dragFavoriteId = null;
    event.currentTarget.classList.remove("is-dragging");
  }

  async function openFolderPicker(field) {
    readJobDraft();
    const path = field === "targetPath" ? state.jobDraft.targetPath : state.jobDraft.sourcePath;
    state.folderPicker = {
      open: true,
      field: field || "sourcePath",
      path: normalizeDisplayPath(path || "/"),
      data: null,
      loading: true,
      error: null,
    };
    render();
    await loadFolderPicker(state.folderPicker.path);
  }

  async function loadFolderPicker(path) {
    state.folderPicker.loading = true;
    state.folderPicker.error = null;
    render();
    try {
      const data = await request(`/api/v1/folders?path=${encodeURIComponent(normalizeDisplayPath(path || "/"))}&limit=150`);
      state.folderPicker = {
        ...state.folderPicker,
        path: data.current?.path || normalizeDisplayPath(path || "/"),
        data,
        loading: false,
        error: null,
      };
      render();
    } catch (error) {
      state.folderPicker = {
        ...state.folderPicker,
        loading: false,
        error: error.message || "Ordner konnte nicht geladen werden.",
      };
      render();
    }
  }

  function closeFolderPicker() {
    state.folderPicker = {
      open: false,
      field: null,
      path: "/",
      data: null,
      loading: false,
      error: null,
    };
    render();
  }

  function chooseFolder(path) {
    const selected = normalizeDisplayPath(path || "/");
    if (state.folderPicker.field === "targetPath") {
      state.jobDraft.targetPath = selected;
    } else {
      state.jobDraft.sourcePath = selected;
    }
    closeFolderPicker();
  }

  async function browseTargetFolder(path) {
    if (!state.sortState?.job) {
      return;
    }
    state.targetBrowsePath = normalizeDisplayPath(path || "/");
    await loadTargets(state.sortState.job.targetMode);
    render();
  }

  async function openWorklistPreview(jobId) {
    state.worklist = {
      open: true,
      jobId,
      loading: true,
      preview: null,
      error: null,
      autoProcess: Boolean((state.jobs.find((job) => job.id === jobId)?.options || {}).autoProcess),
    };
    render();
    await loadWorklistPreview(jobId);
  }

  async function loadWorklistPreview(jobId) {
    if (!jobId) {
      return;
    }
    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      const preview = await request(`/api/v1/jobs/${jobId}/worklist-preview?limit=250`);
      state.worklist = {
        ...state.worklist,
        jobId,
        loading: false,
        preview,
        autoProcess: Boolean(preview.autoProcess ?? preview.job?.options?.autoProcess ?? state.worklist.autoProcess),
        error: null,
      };
      render();
    } catch (error) {
      state.worklist = {
        ...state.worklist,
        loading: false,
        error: error.message || "Worklist konnte nicht geprueft werden.",
      };
      render();
    }
  }

  function closeWorklistPreview() {
    state.worklist = {
      open: false,
      jobId: null,
      loading: false,
      preview: null,
      error: null,
      autoProcess: false,
    };
    render();
  }

  async function openLogs() {
    state.page = "logs";
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    await loadLogs();
  }

  async function loadLogs() {
    state.logs.loading = true;
    state.logs.error = null;
    render();
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (state.logs.level) {
        params.set("level", state.logs.level);
      }
      if (state.logs.jobId) {
        params.set("jobId", String(state.logs.jobId));
      }
      const payload = await request(`/api/v1/logs?${params.toString()}`);
      state.logs = {
        ...state.logs,
        loading: false,
        items: payload.logs || [],
        error: null,
      };
      render();
    } catch (error) {
      state.logs = {
        ...state.logs,
        loading: false,
        error: error.message || "Protokoll konnte nicht geladen werden.",
      };
      render();
    }
  }

  async function confirmQueueJob(jobId) {
    try {
      const wasQueued = Number(state.worklist.preview?.summary?.queued || 0) > 0 && !state.worklist.preview?.canQueue;
      const payload = await request(`/api/v1/jobs/${jobId}/queue-execution`, {
        method: "POST",
        body: {
          autoProcess: state.worklist.autoProcess,
        },
      });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.worklist.preview = payload.preview || state.worklist.preview;
      const realWrites = state.worklist.preview?.executionMode === "real-writes-enabled";
      state.toast = {
        type: "info",
        message: wasQueued
          ? "Ablage-Einstellung wurde gespeichert."
          : realWrites
          ? (state.worklist.autoProcess
            ? "Ablage wurde fuer ruhige Serverphasen freigegeben."
            : "Ablage wurde vorgemerkt und wartet auf manuelle Verarbeitung.")
          : "Ablage wurde vorgemerkt. Reale Dateioperationen bleiben bis zur Freigabe blockiert.",
      };
      render();
    } catch (error) {
      state.worklist.error = error.message || "Ablage konnte nicht vorgemerkt werden.";
      render();
    }
  }

  async function processJobNow(jobId) {
    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/process-now`, { method: "POST", body: { limit: 25 } });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.worklist.preview = payload.preview || state.worklist.preview;
      state.worklist.loading = false;
      state.toast = { type: "info", message: payload.result?.message || "Ablage-Batch wurde verarbeitet." };
      render();
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Ablage konnte nicht verarbeitet werden.";
      render();
    }
  }

  async function openSort(jobId, startMode) {
    state.page = "sort";
    state.jobId = jobId;
    state.imageIndex = 0;
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    state.startMode = startMode;
    state.targetBrowsePath = null;
    state.targetFolderPage = null;
    resetSessionFlow();
    await load();
  }

  async function restartSort(startMode) {
    state.imageIndex = 0;
    state.imagePage = null;
    state.pageCursor = null;
    state.startMode = startMode;
    resetSessionFlow();
    await loadImagePage(null, null, true, startMode);
  }

  async function changeJobStatus(jobId, operation) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/${operation}`, { method: "POST", body: {} });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.toast = { type: "info", message: "Flowstatus wurde aktualisiert." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flowstatus konnte nicht aktualisiert werden." };
      render();
    }
  }

  async function discardJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    const label = job?.name || `Flow ${jobId}`;
    if (typeof window.confirm === "function" && !window.confirm(`Flow "${label}" verwerfen?`)) {
      return;
    }

    try {
      await request(`/api/v1/jobs/${jobId}/discard`, { method: "POST", body: {} });
      state.jobs = state.jobs.filter((item) => item.id !== jobId);
      state.toast = { type: "info", message: "Flow wurde verworfen." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow konnte nicht verworfen werden." };
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
      const payload = await request(`/api/v1/jobs/${state.jobId}/assign`, {
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
      state.toast = {
        type: "info",
        message: payload.duplicate ? `Schon in der Ablage: ${target.label}` : `Gesammelt: ${target.label}`,
      };
      completeCurrentDecision(payload.duplicate ? "duplicate" : "assign", target.label);
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Sortierentscheidung konnte nicht gespeichert werden." };
      render();
    }
  }

  async function addFavoriteFromButton(button) {
    if (!state.sortState?.job) {
      return;
    }

    try {
      const payload = await request("/api/v1/favorites", {
        method: "POST",
        body: {
          mode: state.sortState.job.targetMode,
          targetId: button.dataset.targetId || "",
          targetLabel: button.dataset.targetLabel || "Ziel",
          targetPath: button.dataset.targetPath || "",
        },
      });
      applyFavorites(payload.favorites);
      state.toast = {
        type: "info",
        message: payload.duplicate ? "Schnellziel ist bereits vorhanden." : "Schnellziel wurde hinzugefuegt.",
      };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Schnellziel konnte nicht gespeichert werden." };
      render();
    }
  }

  async function removeFavorite(favoriteId) {
    if (!favoriteId) {
      return;
    }

    try {
      const payload = await request(`/api/v1/favorites/${favoriteId}`, { method: "DELETE", body: {} });
      applyFavorites(payload.favorites);
      state.toast = { type: "info", message: "Schnellziel wurde entfernt." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Schnellziel konnte nicht entfernt werden." };
      render();
    }
  }

  async function reorderFavorites(favoriteIds) {
    if (!state.sortState?.job) {
      return;
    }

    const previous = state.sortState.favorites || [];
    applyFavorites(reorderedFavorites(favoriteIds));
    render();

    try {
      const payload = await request("/api/v1/favorites/reorder", {
        method: "POST",
        body: {
          mode: state.sortState.job.targetMode,
          favoriteIds,
        },
      });
      applyFavorites(payload.favorites);
      state.toast = { type: "info", message: "Schnellziel-Reihenfolge gespeichert." };
      render();
    } catch (error) {
      state.sortState.favorites = previous;
      state.toast = { type: "error", message: error.message || "Schnellziel-Reihenfolge konnte nicht gespeichert werden." };
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
      state.toast = { type: "info", message: "Weiter zum naechsten Bild." };
      completeCurrentDecision("skip", "naechstes Bild");
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Bild konnte nicht uebersprungen werden." };
      render();
    }
  }

  function sortImages(sortState = state.sortState) {
    return Array.isArray(sortState?.nextImages) ? sortState.nextImages : [];
  }

  function realFavorites(sortState = state.sortState) {
    return (sortState?.favorites || []).filter((favorite) => !favorite.locked && favorite.id !== "skip");
  }

  function applyFavorites(favorites) {
    if (!state.sortState || !Array.isArray(favorites)) {
      return;
    }
    state.sortState.favorites = favorites;
  }

  function reorderedFavorites(favoriteIds) {
    const current = state.sortState?.favorites || [];
    const real = realFavorites();
    const byId = new Map(real.map((favorite) => [String(favorite.id), favorite]));
    const ordered = [];
    favoriteIds.forEach((id) => {
      if (byId.has(String(id))) {
        ordered.push(byId.get(String(id)));
        byId.delete(String(id));
      }
    });
    real.forEach((favorite) => {
      if (byId.has(String(favorite.id))) {
        ordered.push(favorite);
      }
    });
    const normalized = ordered.map((favorite, index) => ({
      ...favorite,
      position: index + 1,
      hotkey: String(index + 1),
    }));
    return [...normalized, ...current.filter((favorite) => favorite.locked || favorite.id === "skip")];
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
    if (imagePageLoadPromise) {
      await imagePageLoadPromise;
      return;
    }
    imagePageLoadPromise = loadImagePage(Math.max(0, Number(cursor) || 0), preferredIndex)
      .finally(() => {
        imagePageLoadPromise = null;
      });
    await imagePageLoadPromise;
  }

  function completeCurrentDecision(type, label = "") {
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
    } else if (type !== "duplicate") {
      sortState.job.sortedFiles = Number(sortState.job.sortedFiles || 0) + 1;
      sortState.job.queuedOperations = Number(sortState.job.queuedOperations || 0) + 1;
    }
    if (sortState.job.status === "draft") {
      sortState.job.status = "sorting";
    }
    registerDecisionFeedback(type, label);
    persistPositionSoon();
  }

  function registerDecisionFeedback(type, label) {
    state.decisionStreak = Math.min(999, Number(state.decisionStreak || 0) + 1);
    state.decisionsThisSession = Math.min(9999, Number(state.decisionsThisSession || 0) + 1);

    const id = Date.now();
    state.feedback = {
      id,
      type,
      label,
      streak: state.decisionStreak,
    };

    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      if (state.feedback?.id === id) {
        state.feedback = null;
        render();
      }
    }, 850);
  }

  function resetSessionFlow() {
    state.feedback = null;
    state.decisionStreak = 0;
    state.decisionsThisSession = 0;
    state.sessionStartedAt = Date.now();
    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function progressStats(job, page, images) {
    const done = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0);
    const visibleTotal = Number(page?.total || 0);
    const fallbackTotal = done + Math.max(0, images.length);
    const total = Math.max(visibleTotal, Number(job.totalFiles || 0), fallbackTotal, 1);
    const percent = Math.min(100, Math.round((done / total) * 100));
    return { done, total, percent };
  }

  function sessionTempo() {
    const minutes = Math.max(0.05, (Date.now() - Number(state.sessionStartedAt || Date.now())) / 60000);
    return Math.round((Number(state.decisionsThisSession || 0) / minutes) * 10) / 10;
  }

  function flowMilestone(percent, streak) {
    if (percent >= 100) {
      return "Flow komplett";
    }
    if (streak >= 25) {
      return "Sehr starke Serie";
    }
    if (streak >= 10) {
      return "Guter Lauf";
    }
    if (percent >= 75) {
      return "Endspurt";
    }
    if (percent >= 50) {
      return "Halbzeit geschafft";
    }
    if (percent >= 25) {
      return "Rhythmus gefunden";
    }
    return "Bereit fuer den naechsten Griff";
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
    const radius = activePreloadRadius();
    const first = Math.max(0, currentIndex - radius);
    const last = Math.min(images.length - 1, currentIndex + radius);
    state.bufferPlan = [];
    for (let index = first; index <= last; index += 1) {
      state.bufferPlan.push(index);
    }
    return state.bufferPlan;
  }

  function activePreloadRadius() {
    const mode = state.sortState?.job?.options?.preloadMode || state.jobDraft.preloadMode || "balanced";
    if (mode === "turbo") {
      return 8;
    }
    if (mode === "light") {
      return 2;
    }
    return DEFAULT_PRELOAD_RADIUS;
  }

  function syncImageBuffer() {
    if (state.page !== "sort") {
      clearImageBuffer();
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
        deleteBufferedImage(key);
      }
    });
    root.dataset.bufferedImages = String(imageBuffer.size);
    root.dataset.bufferPlan = String(state.bufferPlan.length);
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

  function deleteBufferedImage(key) {
    const entry = imageBuffer.get(key);
    if (!entry) {
      return;
    }
    releaseBufferedImage(entry);
    imageBuffer.delete(key);
  }

  function clearImageBuffer() {
    Array.from(imageBuffer.keys()).forEach(deleteBufferedImage);
    root.dataset.bufferedImages = "0";
    root.dataset.bufferPlan = "0";
  }

  function releaseBufferedImage(entry) {
    const loader = entry?.loader;
    if (!loader) {
      return;
    }
    loader.onload = null;
    loader.onerror = null;
    try {
      loader.removeAttribute("src");
    } catch (error) {
      loader.src = "";
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
      sorting: "Im Flow",
      paused: "Pausiert",
      ready: "Bereit",
      queued: "Ablage geplant",
      executing: "Ablage laeuft",
      done: "Abgeschlossen",
      error: "Fehler",
    }[status] || escapeHtml(status || "");
  }

  function readinessLabel(readiness) {
    return {
      ready: "Bereit",
      warning: "Warnung",
      error: "Fehler",
    }[readiness] || "Unklar";
  }

  function executionModeLabel(mode) {
    return mode === "real-writes-enabled" ? "Dateioperationen aktiv" : "Dateioperationen gesperrt";
  }

  function backgroundModeLabel(mode) {
    return mode === "cron-enabled" ? "Cron-Ablage aktiv" : "Manuell";
  }

  function executionModeClass(mode) {
    return mode === "real-writes-enabled" ? "danger" : "safe";
  }

  function queueStatusLabel(status) {
    return {
      planned: "Geplant",
      queued: "Vorgemerkt",
      executing: "In Arbeit",
      executed: "Erledigt",
      blocked: "Geblockt",
      failed: "Fehler",
    }[status] || status || "";
  }

  function formatTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) {
      return "";
    }
    try {
      return new Date(value * 1000).toLocaleString();
    } catch (error) {
      return String(value);
    }
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
