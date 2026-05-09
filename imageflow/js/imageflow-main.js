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
  const imagePageCache = new Map();
  const imagePagePrefetches = new Map();
  let positionSaveTimer = null;
  let feedbackTimer = null;
  let imagePageLoadPromise = null;
  let targetSearchTimer = null;

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
    targetQuery: "",
    toast: null,
    feedback: null,
    decisionStreak: 0,
    decisionsThisSession: 0,
    sessionStartedAt: Date.now(),
    loading: false,
    startMode: null,
    acceptDecreasedCounters: false,
    logs: {
      loading: false,
      items: [],
      level: "",
      jobId: null,
      error: null,
    },
    mockFavorites: null,
    mockTargets: null,
    mockFolders: null,
    dragFavoriteId: null,
    targetCreateName: "",
    jobDraft: {
      editingJobId: null,
      name: "",
      sourcePath: "/Photos",
      targetMode: "album",
      targetPath: "/Photos/Sortiert",
      safeMode: true,
      autoProcess: false,
      preloadMode: "balanced",
      targetOrdering: "relevance",
      hotkeys: "number-row",
      customHotkeys: ["", "", "", "", "", "", "", "", ""],
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
      filter: "all",
    },
  };

  function numberOrNull(value) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeCustomHotkeys(value) {
    const items = Array.isArray(value) ? value : [];
    const seen = new Set();
    return Array.from({ length: 9 }, (_, index) => {
      const raw = items[index] === undefined || items[index] === null ? "" : String(items[index]).trim().toLowerCase();
      const key = Array.from(raw)[0] || "";
      if (!key || key === "0" || key === " " || seen.has(key)) {
        return "";
      }
      seen.add(key);
      return key;
    });
  }

  function hotkeyForPosition(position, options = {}) {
    const normalizedPosition = Math.max(1, Math.min(9, Number(position) || 1));
    const index = normalizedPosition - 1;
    if (options.hotkeys === "custom") {
      return normalizeCustomHotkeys(options.customHotkeys || [])[index] || "";
    }
    if (options.hotkeys === "letters") {
      return String.fromCharCode("a".charCodeAt(0) + index);
    }
    return String(normalizedPosition);
  }

  function hotkeySummaryLabel(options = {}) {
    if (options.hotkeys === "custom") {
      const keys = normalizeCustomHotkeys(options.customHotkeys || []).filter(Boolean);
      return keys.length ? keys.join(" ") : "Eigene";
    }
    return options.hotkeys === "letters" ? "A-I" : "1-9";
  }

  function applyConfiguredHotkeys(favorites, options = state.sortState?.job?.options || {}) {
    return favorites.map((favorite, index) => {
      const isSkip = favorite.locked || favorite.targetType === "skip" || favorite.id === "skip";
      if (isSkip) {
        return { ...favorite, hotkey: "0" };
      }
      const position = Number(favorite.position || index + 1);
      return {
        ...favorite,
        position,
        hotkey: hotkeyForPosition(position, options),
      };
    });
  }

  function normalizeDisplayPath(path) {
    const parts = String(path || "/")
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part && part !== ".");
    return parts.length ? `/${parts.filter((part) => part !== "..").join("/")}` : "/";
  }

  function normalizeSearchTerm(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
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
      return { jobs: state.jobs.length ? state.jobs : mockJobs() };
    }
    if (path === "/api/v1/jobs" && options.method === "POST") {
      const job = {
        id: Date.now(),
        name: options.body.name || "Neue Runde",
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
          targetOrdering: options.body.targetOrdering || "relevance",
          hotkeys: options.body.hotkeys || "number-row",
          customHotkeys: normalizeCustomHotkeys(options.body.customHotkeys || []),
        },
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [job, ...state.jobs];
      return { job };
    }
    if (/\/api\/v1\/jobs\/\d+$/.test(path) && options.method === "PUT") {
      const jobId = Number.parseInt(path.split("/").at(-1), 10);
      const current = state.jobs.find((job) => job.id === jobId) || mockJobs().find((job) => job.id === jobId) || mockJobs()[0];
      const updated = {
        ...current,
        name: options.body.name || current.name,
        sourcePath: options.body.sourcePath || current.sourcePath,
        targetMode: options.body.targetMode || current.targetMode,
        targetPath: options.body.targetMode === "album" ? null : (options.body.targetPath || current.targetPath || "/"),
        safeMode: options.body.safeMode !== false,
        options: {
          ...(current.options || {}),
          autoProcess: Boolean(options.body.autoProcess),
          preloadMode: options.body.preloadMode || current.options?.preloadMode || "balanced",
          targetOrdering: options.body.targetOrdering || current.options?.targetOrdering || "relevance",
          hotkeys: options.body.hotkeys || current.options?.hotkeys || "number-row",
          customHotkeys: normalizeCustomHotkeys(options.body.customHotkeys || current.options?.customHotkeys || []),
        },
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = state.jobs.map((job) => (job.id === jobId ? updated : job));
      return { job: updated };
    }
    if (/\/api\/v1\/jobs\/\d+\/duplicate$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const current = state.jobs.find((job) => job.id === jobId) || mockJobs().find((job) => job.id === jobId) || mockJobs()[0];
      const copy = {
        ...current,
        id: Date.now(),
        name: `${current.name} Kopie`,
        status: "draft",
        sortedFiles: 0,
        skippedFiles: 0,
        queuedOperations: 0,
        executedOperations: 0,
        failedOperations: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [copy, ...state.jobs];
      return { job: copy };
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
        result: { processed: processed.executedOperations, realExecutionEnabled: true, message: "Die vorgemerkte Ablage wurde abgelegt." },
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
      return { assignment: { id: Date.now(), sourcePath: options.body.sourcePath, targetLabel: "Übersprungen" } };
    }
    if (/\/api\/v1\/jobs\/\d+\/undo$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      return { message: "Letzte Entscheidung wurde zurückgenommen.", job };
    }
    if (/\/api\/v1\/jobs\/\d+\/queue\/\d+$/.test(path) && options.method === "DELETE") {
      const jobId = Number.parseInt(path.split("/").at(-3), 10);
      const queueItemId = Number.parseInt(path.split("/").at(-1), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      return { removed: { queueItemId }, job };
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
    if (path === "/api/v1/targets" && options.method === "POST") {
      const mode = options.body.mode || "album";
      const name = String(options.body.name || "Neues Ziel").trim() || "Neues Ziel";
      if (mode === "album") {
        const target = { id: `album-${Date.now()}`, label: name, location: "ImageFlow" };
        state.mockTargets = [target, ...mockTargets()];
        return { mode, target, targets: state.mockTargets, duplicate: false };
      }
      const parent = normalizeDisplayPath(options.body.path || "/");
      const folder = { name, path: normalizeDisplayPath(`${parent}/${name}`), hasChildren: false };
      const folders = state.mockFolders || {};
      folders[parent] = [...(folders[parent] || mockFolderPage(parent).folders || []), folder];
      folders[folder.path] = [];
      state.mockFolders = folders;
      return { mode, target: { id: folder.path, label: folder.name, path: folder.path, hasChildren: false }, folders: mockFolderPage(parent), duplicate: false };
    }
    if (path.includes("/targets")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const mode = query.get("mode") || "album";
      const search = query.get("query") || "";
      if (mode !== "album") {
        return { mode, ordering: search ? "search" : "alphabetical", folders: mockFolderPage(query.get("path") || "/", search) };
      }
      return { mode, ordering: search ? "search" : "relevance", targets: filterMockTargets(mockTargets(), search) };
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
          targetOrdering: "relevance",
          hotkeys: "number-row",
          customHotkeys: [],
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
          targetOrdering: "alphabetical",
          hotkeys: "number-row",
          customHotkeys: [],
        },
        updatedAt: Math.floor(Date.now() / 1000) - 900,
      },
    ];
  }

  function mockHealth() {
    const realExecutionEnabled = root.dataset.mockRealExecution === "1";
    const backgroundMode = root.dataset.mockBackgroundMode || "manual-only";
    const backgroundProcessingEnabled = backgroundMode !== "manual-only";
    return {
      app: "imageflow",
      version: "0.1.0",
      status: realExecutionEnabled ? "execution-enabled" : "safe-testing",
      processingMode: realExecutionEnabled
        ? (backgroundProcessingEnabled ? "manual-and-background" : "manual-only")
        : "locked",
      destructiveWritesEnabled: realExecutionEnabled,
      realExecutionEnabled,
      backgroundProcessingEnabled,
      backgroundGate: mockBackgroundGate(backgroundMode === "cron-ready" || backgroundMode === "cron-enabled"),
      safeModeDefault: true,
    };
  }

  function mockBackgroundGate(canRun = false) {
    return {
      canRun,
      reason: canRun ? "ready" : "server_load_too_high",
      message: canRun ? "Automatik darf laufen, sobald wartende Ablagen vorhanden sind." : "Automatik wartet: Serverlast 3.40 liegt über 2.00.",
      lowLoadOnly: true,
      currentLoad1m: 0.42,
      maxLoad1m: 2,
      loadOk: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "06:00",
      quietHoursOk: true,
      currentTime: "12:00",
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
      favorites: mockFavoritesForJob(job),
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
      { id: "skip", label: "Überspringen", hotkey: "0", position: 10, locked: true, targetType: "skip" },
    ];
  }

  function mockFavoritesForJob(job) {
    const favorites = mockRealFavorites().map((favorite, index) => ({
      ...favorite,
      position: index + 1,
      hotkey: hotkeyForPosition(index + 1, job.options || {}),
    }));
    return mockFavoritesWithSkip(favorites);
  }

  function mockTargets() {
    if (state.mockTargets) {
      return state.mockTargets;
    }
    return [
      { id: "family", label: "Familie", location: "Privat" },
      { id: "travel", label: "Reisen", location: "Jahresalben" },
      { id: "archive", label: "Archiv", location: "Langzeit" },
      { id: "work", label: "Projekte", location: "Arbeit" },
    ];
  }

  function filterMockTargets(targets, query) {
    const needle = normalizeSearchTerm(query);
    if (!needle) {
      return targets;
    }
    return targets.filter((target) => normalizeSearchTerm(`${target.label || target.name || ""} ${target.location || target.path || ""}`).includes(needle));
  }

  function mockFolderPage(path, query = "") {
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
    const folders = filterMockTargets(state.mockFolders?.[normalized] || tree[normalized] || [], query);
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
    const realExecutionEnabled = root.dataset.mockRealExecution === "1";
    const configuredBackgroundMode = root.dataset.mockBackgroundMode || "manual-only";
    const backgroundMode = realExecutionEnabled ? configuredBackgroundMode : "manual-only";
    const total = Math.max(3, Number.parseInt(root.dataset.mockWorklistTotal || "3", 10) || 3);
    const warnings = total > 3 ? Math.max(1, Math.floor(total * 0.12)) : 1;
    const ready = Math.max(0, total - warnings);
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
        total,
        planned: queued ? 0 : total,
        queued: queued ? total : 0,
        executing: 0,
        blocked: 0,
        executed: 0,
        failed: 0,
        ready,
        warnings,
        errors: 0,
      },
      window: {
        total,
        shown: 3,
        limit: 3,
        truncated: total > 3,
        validationComplete: true,
      },
      canQueue: !queued,
      executionMode: realExecutionEnabled ? "real-writes-enabled" : "dry-run-only",
      backgroundMode,
      backgroundGate: mockBackgroundGate(backgroundMode === "cron-ready" || backgroundMode === "cron-enabled"),
      autoProcess: Boolean(job.options?.autoProcess),
      message: realExecutionEnabled
        ? "Echte Dateiänderungen sind serverseitig freigeschaltet. Jede Ablage wird trotzdem noch einmal auf Doppelungen, Zielkonflikte und Prüfsummen geprüft."
        : "Dateiänderungen sind gesperrt. Du kannst die Ablage prüfen und für später merken, ohne Dateien zu verändern.",
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
          messages: ["Bereit für die sichere Prüfung mit Checksumme."],
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
          messages: ["Zieldatei existiert bereits; diese Doppelung wird später sicher übersprungen."],
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
          messages: ["Bereit für die sichere Prüfung mit Checksumme."],
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
        message: "Bilder rund um die aktuelle Position wurden vorgeladen.",
        context: { bufferedImages: state.bufferPlan.length || 9, preloadMode: "turbo" },
        createdAt: now - 8,
      },
      {
        id: 1002,
        level: "info",
        event: "job_execution_queued",
        jobId: 1,
        message: "Ablage wurde für später gemerkt.",
        context: { safeMode: true, autoProcess: false },
        createdAt: now - 80,
      },
      {
        id: 1001,
        level: "debug",
        event: "assignment_planned",
        jobId: 1,
        message: "Deine Entscheidung wurde gespeichert.",
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
    const requestedCursor = cursor !== null && cursor !== undefined ? Math.max(0, Number(cursor) || 0) : null;
    const requestedStart = requestedCursor === null ? startMode || state.startMode : null;
    const cached = requestedStart === null && requestedCursor !== null ? imagePageCache.get(imagePageCacheKey(state.jobId, requestedCursor)) : null;
    if (cached) {
      root.dataset.pageCacheHit = "1";
      await applyImagePagePayload(cached, preferredIndex, requestedStart);
      persistPositionSoon();
      render();
      return;
    }

    if (renderLoading) {
      state.loading = true;
      render();
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (requestedCursor !== null) {
      params.set("cursor", String(requestedCursor));
    } else if (requestedStart) {
      params.set("start", requestedStart);
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`);
      root.dataset.pageCacheHit = "0";
      rememberImagePage(payload);
      await applyImagePagePayload(payload, preferredIndex, requestedStart);
      persistPositionSoon();
    } finally {
      if (renderLoading) {
        state.loading = false;
        render();
      }
    }
  }

  async function applyImagePagePayload(payload, preferredIndex = null, requestedStart = null) {
    state.sortState = mergeSortPayload(payload);
    state.imagePage = state.sortState.imagePage || defaultImagePage(state.sortState.nextImages || []);
    state.pageCursor = Number(state.imagePage.cursor || 0);
    const saved = state.sortState.savedPosition || {};
    const start = state.sortState.start || {};
    const startCursor = Number(start.cursor || 0);
    const savedIndex = Number(saved.cursor || 0) === state.pageCursor ? Number(saved.index || 0) : 0;
    const startIndex = requestedStart && startCursor === state.pageCursor ? Number(start.index || 0) : null;
    state.imageIndex = clampIndex(preferredIndex ?? startIndex ?? savedIndex, sortImages(state.sortState));
    state.startMode = null;
    await loadTargets(state.sortState.job.targetMode);
  }

  async function loadTargets(mode) {
    const targetMode = mode || "album";
    const ordering = state.sortState?.job?.options?.targetOrdering || "relevance";
    const params = new URLSearchParams({ mode: targetMode, limit: "100", ordering });
    const query = state.targetQuery.trim();
    if (query) {
      params.set("query", query);
    }
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
          <p>Viele Bilder schnell durchsehen, entscheiden und sicher ablegen.</p>
        </div>
        <nav class="imageflow-tabs" aria-label="ImageFlow">
          <button class="imageflow-tab ${state.page === "jobs" ? "is-active" : ""}" data-action="go-jobs" type="button">Übersicht</button>
          <button class="imageflow-tab ${state.page === "sort" ? "is-active" : ""}" data-action="go-sort" type="button" ${state.jobId ? "" : "disabled"}>Sortieren</button>
          <button class="imageflow-tab ${state.page === "logs" ? "is-active" : ""}" data-action="show-log" type="button">Protokoll</button>
        </nav>
      </header>
    `;
  }

  function renderJobsPage() {
    const totals = summarizeJobs(state.jobs);
    const draft = state.jobDraft;
    const isEditing = Boolean(draft.editingJobId);
    return `
      <section class="imageflow-dashboard" aria-label="Sortierrunden">
        ${renderSafetyStrip()}
        <form class="imageflow-panel accent-pink imageflow-form" id="imageflow-job-form">
          <div class="imageflow-panel-head">
            <div>
              <h3>${isEditing ? "Runde bearbeiten" : "Neue Runde vorbereiten"}</h3>
              <p>${isEditing ? "Passe Name und Einstellungen an. Quelle und Ziel bleiben gesperrt, sobald Entscheidungen vorhanden sind." : "Speichere die Runde zuerst oder spring direkt in den Sortiermodus."}</p>
            </div>
          </div>
          <div class="imageflow-field">
            <label for="ifl-name">Name</label>
            <input id="ifl-name" name="name" type="text" maxlength="160" placeholder="z. B. Urlaub 2026" value="${escapeAttr(draft.name)}">
          </div>
          <div class="imageflow-field">
            <label for="ifl-source">Bilderordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-source" name="sourcePath" type="text" value="${escapeAttr(draft.sourcePath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="sourcePath" type="button">Auswählen</button>
            </div>
            <small>ImageFlow nutzt nur Ordner aus deinem Nextcloud-Dateibereich.</small>
          </div>
          <div class="imageflow-field">
            <label for="ifl-mode">Was soll mit passenden Bildern passieren?</label>
            <select id="ifl-mode" name="targetMode">
              <option value="album" ${draft.targetMode === "album" ? "selected" : ""}>Zu einem Album hinzufügen</option>
              <option value="move" ${draft.targetMode === "move" ? "selected" : ""}>In einen Ordner verschieben</option>
              <option value="copy" ${draft.targetMode === "copy" ? "selected" : ""}>In einen Ordner kopieren</option>
            </select>
          </div>
          <div class="imageflow-field" data-target-path-field hidden>
            <label for="ifl-target">Ablageordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-target" name="targetPath" type="text" value="${escapeAttr(draft.targetPath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="targetPath" type="button">Auswählen</button>
            </div>
          </div>
          <label class="imageflow-toggle">
            <input id="ifl-safe" name="safeMode" type="checkbox" ${draft.safeMode ? "checked" : ""}>
            Mit Prüfsummen extra sicher prüfen
          </label>
          <label class="imageflow-toggle">
            <input id="ifl-auto" name="autoProcess" type="checkbox" ${draft.autoProcess ? "checked" : ""}>
            Automatisch ablegen, wenn der Server ruhig ist
          </label>
          <div class="imageflow-field">
            <label for="ifl-preload">Bilder vorladen</label>
            <select id="ifl-preload" name="preloadMode">
              <option value="light" ${draft.preloadMode === "light" ? "selected" : ""}>Schonend</option>
              <option value="balanced" ${draft.preloadMode === "balanced" ? "selected" : ""}>Ausgewogen</option>
              <option value="turbo" ${draft.preloadMode === "turbo" ? "selected" : ""}>Turbo für große Stapel</option>
            </select>
          </div>
          <div class="imageflow-field">
            <label for="ifl-target-ordering">Ziele anzeigen</label>
            <select id="ifl-target-ordering" name="targetOrdering">
              <option value="relevance" ${draft.targetOrdering === "relevance" ? "selected" : ""}>Lieblingsziele zuerst</option>
              <option value="alphabetical" ${draft.targetOrdering === "alphabetical" ? "selected" : ""}>Alphabetisch</option>
            </select>
          </div>
          <div class="imageflow-field">
            <label for="ifl-hotkeys">Tastenbelegung</label>
            <select id="ifl-hotkeys" name="hotkeys">
              <option value="number-row" ${draft.hotkeys === "number-row" ? "selected" : ""}>Zahlen 1-9 und 0</option>
              <option value="letters" ${draft.hotkeys === "letters" ? "selected" : ""}>Buchstaben A-I und 0</option>
              <option value="custom" ${draft.hotkeys === "custom" ? "selected" : ""}>Eigene Tasten</option>
            </select>
          </div>
          ${renderCustomHotkeyFields(draft)}
          <div class="imageflow-actions">
            <button class="imageflow-button primary" type="submit" data-save-intent="save">${isEditing ? "Änderungen speichern" : "Runde speichern"}</button>
            <button class="imageflow-button" type="submit" data-save-intent="open">Speichern & sortieren</button>
            ${isEditing ? '<button class="imageflow-button" data-action="cancel-edit-job" type="button">Bearbeiten abbrechen</button>' : '<button class="imageflow-button" data-action="clear-job-draft" type="button">Zurücksetzen</button>'}
          </div>
        </form>
        <section class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Deine Runden</h3>
              <p>Fortschritt, Tempo und Ablage bleiben hier im Blick.</p>
            </div>
            <button class="imageflow-button" data-action="refresh" type="button">Aktualisieren</button>
          </div>
          <div class="imageflow-status-grid">
            <div class="imageflow-stat"><strong>${totals.jobs}</strong><span>Runden</span></div>
            <div class="imageflow-stat"><strong>${totals.sorted}</strong><span>Entschieden</span></div>
            <div class="imageflow-stat"><strong>${totals.queued}</strong><span>Warten auf Ablage</span></div>
            <div class="imageflow-stat"><strong>${totals.failed}</strong><span>Fehler</span></div>
          </div>
          ${renderJobTable()}
        </section>
      </section>
    `;
  }

  function renderCustomHotkeyFields(draft) {
    const keys = normalizeCustomHotkeys(draft.customHotkeys || []);
    return `
      <div class="imageflow-field imageflow-custom-hotkeys" ${draft.hotkeys === "custom" ? "" : "hidden"}>
        <label>Eigene Schnellziel-Tasten</label>
        <div class="imageflow-hotkey-grid">
          ${Array.from({ length: 9 }, (_, index) => `
            <label>
              <span>${index + 1}</span>
              <input class="imageflow-hotkey-input" name="customHotkey${index}" data-hotkey-index="${index}" type="text" maxlength="1" value="${escapeAttr(keys[index] || "")}" aria-label="Taste für Schnellziel ${index + 1}">
            </label>
          `).join("")}
        </div>
        <small>Jede Taste darf nur einmal vorkommen. 0 und Leertaste bleiben für Überspringen reserviert.</small>
      </div>
    `;
  }

  function renderSafetyStrip() {
    const health = state.health || mockHealth();
    const realWrites = Boolean(health.realExecutionEnabled || health.destructiveWritesEnabled);
    const background = Boolean(health.backgroundProcessingEnabled);
    const gate = health.backgroundGate || {};
    const title = realWrites ? "Dateiänderungen aktiv" : "Geschützter Testbetrieb";
    const message = realWrites
      ? "Reale Dateiänderungen sind freigeschaltet. Ablagen können Dateien verändern."
      : "Reale Dateiänderungen sind gesperrt. Du kannst Ablagen prüfen und für später merken, ohne Dateien zu verändern.";
    const automationLabel = background
      ? ((gate.canRun || gate.reason === "ready") ? "Server ruhig" : "Automatik wartet")
      : "Automatik aus";
    return `
      <section class="imageflow-safety-strip ${realWrites ? "is-live" : ""}" aria-label="Schutzstatus">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="imageflow-safety-badges">
          <span class="imageflow-badge ${realWrites ? "warning" : "safe"}">${realWrites ? "Dateien können geändert werden" : "Dateiänderungen gesperrt"}</span>
          <span class="imageflow-badge ${background ? ((gate.canRun || gate.reason === "ready") ? "ready" : "warning") : ""}">${escapeHtml(automationLabel)}</span>
          <span class="imageflow-badge safe">Prüfsummen an</span>
        </div>
      </section>
    `;
  }

  function renderJobTable() {
    if (state.jobs.length === 0) {
      return `<div class="imageflow-empty">Noch keine Runden vorhanden.</div>`;
    }

    return `
      <div class="imageflow-table-wrap">
        <table class="imageflow-table">
          <thead>
            <tr>
              <th>Runde</th>
              <th>Bilderordner</th>
              <th>Wohin</th>
              <th>Status</th>
              <th>Fortschritt</th>
              <th>Was jetzt?</th>
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
    const paused = job.status === "paused";
    const hasDecisions = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0) + Number(job.queuedOperations || 0) > 0;
    const primaryStartLabel = hasDecisions ? "Weitermachen" : "Sortieren";
    return `
      <tr>
        <td>
          <strong>${escapeHtml(job.name)}</strong><br>
          <span class="imageflow-badge safe">${job.safeMode ? "Extra sicher" : "Standard"}</span>
          <span class="imageflow-badge ${options.autoProcess ? "ready" : ""}">${options.autoProcess ? "Automatik an" : "Manuell"}</span>
          <span class="imageflow-badge">${targetOrderingLabel(options.targetOrdering)}</span>
        </td>
        <td>${escapeHtml(job.sourcePath || "/")}</td>
        <td>${modeLabel(job.targetMode)}</td>
        <td><span class="imageflow-badge ${statusClass(job.status)}">${statusLabel(job.status)}</span></td>
        <td>${Number(job.sortedFiles || 0)} entschieden<br>${Number(job.queuedOperations || 0)} warten</td>
        <td>
          <div class="imageflow-actions">
            <button class="imageflow-button primary" data-action="open-sort" data-start-mode="resume" data-job-id="${job.id}" type="button">${primaryStartLabel}</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="begin" data-job-id="${job.id}" type="button">Neu anfangen</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="unsorted" data-job-id="${job.id}" type="button">Offene Bilder</button>
            <button class="imageflow-button" data-action="edit-job" data-job-id="${job.id}" type="button">Bearbeiten</button>
            <button class="imageflow-button" data-action="duplicate-job" data-job-id="${job.id}" type="button">Kopie</button>
            <button class="imageflow-button" data-action="${paused ? "resume-job" : "pause-job"}" data-job-id="${job.id}" type="button">${paused ? "Fortsetzen" : "Pausieren"}</button>
            <button class="imageflow-button primary" data-action="queue-job" data-job-id="${job.id}" type="button">Ablage prüfen</button>
            <button class="imageflow-button" data-action="show-job-log" data-job-id="${job.id}" type="button">Ereignisse</button>
            <button class="imageflow-button danger" data-action="discard-job" data-job-id="${job.id}" type="button">Runde verwerfen</button>
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
    const hasDecisions = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0) > 0 || (sortState.recentAssignments || []).length > 0;
    const listedTargets = state.targets.length
      ? state.targets
      : (isFolderMode || state.targetQuery.trim() ? [] : mockTargets());
    const emptyTargetMessage = state.targetQuery.trim()
      ? `Kein Ziel passt zu "${state.targetQuery.trim()}".`
      : "Keine Ziele in diesem Ordner.";

    return `
      <section class="imageflow-sort" aria-label="Sortieransicht">
        <header class="imageflow-job-head">
          <div>
            <h3>${escapeHtml(job.name || "Runde")}</h3>
            <p>${escapeHtml(job.sourcePath || "/")} · ${modeLabel(job.targetMode)} · ${statusLabel(job.status)} · Bild ${images.length ? currentIndex + 1 : 0}/${images.length}</p>
          </div>
          <div class="imageflow-toolbar">
            <span class="imageflow-badge safe">${job.safeMode ? "Extra sicher" : "Standard"}</span>
            <span class="imageflow-badge">${Number(job.sortedFiles || 0)} entschieden</span>
            <span class="imageflow-badge">${Number(job.queuedOperations || 0)} warten</span>
            <button class="imageflow-button" data-action="undo-last-decision" type="button" ${hasDecisions ? "" : "disabled"}>Rückgängig</button>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="resume" type="button">Weitermachen</button>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="begin" type="button">Neu anfangen</button>
            <button class="imageflow-button" data-action="start-sort" data-start-mode="unsorted" type="button">Offene Bilder</button>
            <button class="imageflow-button" data-action="go-jobs" type="button">Zurück</button>
          </div>
        </header>
        <section class="imageflow-gamebar" aria-label="Rundenfortschritt">
          <div class="imageflow-flow-meter">
            <div class="imageflow-flow-meter-head">
              <strong>${progress.done}/${progress.total} entschieden</strong>
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
            <span>Diese Runde</span>
          </div>
          <div class="imageflow-flow-chip accent-violet">
            <strong>${tempo}</strong>
            <span>Bilder/min</span>
          </div>
          <div class="imageflow-flow-chip accent-cool">
            <strong>${bufferPlan.length}</strong>
            <span>Vorgeladen</span>
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
              <span class="imageflow-hotkey"><b>${escapeHtml(hotkeySummaryLabel(job.options || {}))}</b> Schnellziel</span>
              <span class="imageflow-hotkey"><b>0</b> Überspringen</span>
              <span class="imageflow-hotkey"><b>Leertaste</b> Überspringen</span>
              <span class="imageflow-hotkey"><b>Strg+Z</b> Rückgängig</span>
              <span class="imageflow-hotkey"><b>←/→</b> Filmstreifen</span>
            </div>
          </section>
          <aside class="imageflow-targets">
            <div class="imageflow-panel-head">
              <div>
                <h4>Alle Ziele</h4>
                <p>${job.targetMode === "album" ? targetOrderingLabel(job.options?.targetOrdering) : escapeHtml(targetFolder?.current?.path || state.targetBrowsePath || "/")}</p>
              </div>
              ${isFolderMode ? `<button class="imageflow-button" data-action="browse-target-parent" type="button" ${targetFolder?.parent ? "" : "disabled"}>Eine Ebene hoch</button>` : ""}
            </div>
            ${renderTargetSearch(isFolderMode)}
            ${renderTargetCreate(job, isFolderMode, targetFolder)}
            <div class="imageflow-target-list">
              ${listedTargets.map((target, index) => renderTarget(target, current, index, isFolderMode)).join("") || `<div class="imageflow-empty">${escapeHtml(emptyTargetMessage)}</div>`}
            </div>
          </aside>
        </div>
        <footer class="imageflow-filmstrip">
          <div class="imageflow-filmstrip-head">
            <div>
              <strong>Filmstreifen</strong>
              <span>${pageStart}-${pageEnd} von ${Number(page.total || images.length)} · ${bufferPlan.length} vorgeladen</span>
            </div>
            <div class="imageflow-page-actions">
              <button class="imageflow-icon-button" data-action="page-prev" type="button" ${page.hasPrevious ? "" : "disabled"}>Zurück</button>
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
      ? `<button class="imageflow-mini-button" data-action="browse-target-folder" data-target-path="${escapeAttr(targetPath)}" aria-label="Ordner öffnen: ${escapeAttr(label)}" title="Ordner öffnen" type="button">›</button>`
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

  function renderTargetSearch(isFolderMode) {
    const placeholder = isFolderMode ? "Ordner suchen" : "Album suchen";
    const note = isFolderMode ? "Sucht im geöffneten Ordner." : "Sucht in deinen Nextcloud-Alben.";
    return `
      <div class="imageflow-target-filter">
        <label for="ifl-target-query">Ziel finden</label>
        <div>
          <input id="ifl-target-query" data-target-query type="search" maxlength="120" value="${escapeAttr(state.targetQuery)}" placeholder="${escapeAttr(placeholder)}" autocomplete="off">
          <button class="imageflow-mini-button" data-action="clear-target-search" aria-label="Zielsuche leeren" title="Zielsuche leeren" type="button" ${state.targetQuery.trim() ? "" : "disabled"}>x</button>
        </div>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function renderTargetCreate(job, isFolderMode, targetFolder) {
    const parentPathValue = targetFolder?.current?.path || state.targetBrowsePath || job.targetPath || "/";
    const title = job.targetMode === "album" ? "Album anlegen" : "Ordner anlegen";
    const placeholder = job.targetMode === "album" ? "Neues Album" : "Neuer Ordner";
    const note = job.targetMode === "album"
      ? "Erscheint sofort in den Zielen und kann als Schnellziel gemerkt werden."
      : `Wird in ${parentPathValue} angelegt.`;
    return `
      <div class="imageflow-target-create">
        <label for="ifl-target-create">${escapeHtml(title)}</label>
        <div>
          <input id="ifl-target-create" data-target-create-name type="text" maxlength="255" value="${escapeAttr(state.targetCreateName || "")}" placeholder="${escapeAttr(placeholder)}">
          <button class="imageflow-button primary" data-action="create-target" type="button">Anlegen</button>
        </div>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function renderFeedbackBurst() {
    const feedback = state.feedback;
    if (!feedback) {
      return "";
    }

    const title = feedback.type === "skip" ? "Übersprungen" : (feedback.type === "duplicate" ? "Schon vorgemerkt" : "+1");
    const label = feedback.label ? feedback.label : "gespeichert";
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
    const title = picker.field === "targetPath" ? "Ablageordner wählen" : "Bilderordner wählen";
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
          <header class="imageflow-modal-head">
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(currentPath)} · ${Number(data.imageCount || 0)} Bilder direkt in diesem Ordner</p>
            </div>
            <button class="imageflow-icon-button" data-action="close-folder-picker" type="button">Schließen</button>
          </header>
          <div class="imageflow-folder-actions">
            <button class="imageflow-button" data-action="folder-picker-parent" type="button" ${data.parent ? "" : "disabled"}>Eine Ebene hoch</button>
            <button class="imageflow-button primary" data-action="choose-folder" data-folder-path="${escapeAttr(currentPath)}" type="button" ${picker.loading ? "disabled" : ""}>Ordner übernehmen</button>
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
        <button class="imageflow-button" data-action="choose-folder" data-folder-path="${escapeAttr(folder.path)}" type="button">Übernehmen</button>
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
    const filteredItems = filteredWorklistItems(items, state.worklist.filter);
    const windowInfo = preview?.window || { total: Number(summary.total || items.length), shown: items.length, truncated: false };
    const queuedCount = Number(summary.queued || 0) + Number(summary.executing || 0);
    const canSaveQueueSettings = queuedCount > 0 && !preview?.canQueue;
    const queueButtonEnabled = Boolean(preview?.canQueue || canSaveQueueSettings);
    const queueButtonLabel = canSaveQueueSettings
      ? "Einstellung merken"
      : (preview?.executionMode === "real-writes-enabled" ? "Jetzt ablegen" : "Für später merken");
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal imageflow-worklist-modal" role="dialog" aria-modal="true" aria-label="Ablage prüfen">
          <header class="imageflow-modal-head">
            <div>
              <h3>Ablage prüfen</h3>
              <p>${escapeHtml(preview?.job?.name || "Runde")} | ${modeLabel(preview?.job?.targetMode || "")}</p>
            </div>
            ${preview ? `<span class="imageflow-badge ${executionModeClass(preview.executionMode)}">${executionModeLabel(preview.executionMode)}</span>` : ""}
            ${preview ? `<span class="imageflow-badge ${backgroundModeClass(preview.backgroundMode)}">${backgroundModeLabel(preview.backgroundMode)}</span>` : ""}
            <button class="imageflow-icon-button" data-action="close-worklist-preview" type="button">Schließen</button>
          </header>
          ${state.worklist.loading ? '<div class="imageflow-empty">Ablage wird geprüft.</div>' : ""}
          ${state.worklist.error ? `<div class="imageflow-empty">${escapeHtml(state.worklist.error)}</div>` : ""}
          ${preview ? `
            <div class="imageflow-worklist-body">
            <div class="imageflow-status-grid">
              <div class="imageflow-stat"><strong>${Number(summary.total || 0)}</strong><span>Entscheidungen</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.ready || 0)}</strong><span>Bereit</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.warnings || 0)}</strong><span>Warnungen</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.errors || 0)}</strong><span>Fehler</span></div>
              <div class="imageflow-stat"><strong>${queuedCount}</strong><span>Wartet</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.executed || 0)}</strong><span>Erledigt</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.blocked || 0) + Number(summary.failed || 0)}</strong><span>Blockiert</span></div>
            </div>
            <div class="imageflow-worklist-note">
              <span>${escapeHtml(preview.message || "")}</span>
              ${renderWorklistWindowNote(windowInfo)}
              ${renderBackgroundGateNote(preview)}
            </div>
            ${renderWorklistFilters(items, windowInfo)}
            <label class="imageflow-toggle imageflow-worklist-toggle">
              <input id="ifl-worklist-auto" data-action="toggle-worklist-auto" type="checkbox" ${state.worklist.autoProcess ? "checked" : ""}>
              Automatisch ablegen, wenn der Server ruhig ist
            </label>
            <div class="imageflow-worklist-table">
              ${filteredItems.map(renderWorklistItem).join("") || `<div class="imageflow-empty">${escapeHtml(worklistEmptyLabel(state.worklist.filter, items.length))}</div>`}
            </div>
            <div class="imageflow-folder-actions">
              <button class="imageflow-button" data-action="refresh-worklist-preview" type="button">Noch mal prüfen</button>
              <button class="imageflow-button primary" data-action="confirm-queue-job" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${queueButtonEnabled ? "" : "disabled"}>${queueButtonLabel}</button>
              <button class="imageflow-button" data-action="process-job-now" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${preview.executionMode === "real-writes-enabled" && queuedCount > 0 ? "" : "disabled"}>Jetzt ablegen</button>
            </div>
            </div>
          ` : ""}
        </section>
      </div>
    `;
  }

  function renderBackgroundGateNote(preview) {
    if (!preview || preview.backgroundMode === "manual-only" || !preview.backgroundGate) {
      return "";
    }
    return `<span>${escapeHtml(preview.backgroundGate.message || "Automatik wartet auf ein ruhiges Serverfenster.")}</span>`;
  }

  function renderWorklistWindowNote(windowInfo) {
    const total = Number(windowInfo?.total || 0);
    const shown = Number(windowInfo?.shown || 0);
    if (!total) {
      return "";
    }
    if (windowInfo?.truncated) {
      return `<span>${total} geprüft, ${shown} wichtige Einträge angezeigt. Die Summen und Fehlerprüfung gelten für die komplette Ablage.</span>`;
    }
    return `<span>${total} geprüft, ${shown} angezeigt.</span>`;
  }

  function renderWorklistFilters(items, windowInfo) {
    if (!items.length) {
      return "";
    }
    const filters = [
      { id: "all", label: "Alle", count: items.length },
      { id: "issues", label: "Auffälligkeiten", count: items.filter(isWorklistIssue).length },
      { id: "ready", label: "Bereit", count: items.filter((item) => item.readiness === "ready").length },
      { id: "waiting", label: "Wartet", count: items.filter((item) => ["planned", "queued", "executing"].includes(item.status || "")).length },
      { id: "done", label: "Erledigt", count: items.filter((item) => item.status === "executed").length },
    ];
    const visibleLabel = windowInfo?.truncated
      ? `${Number(windowInfo.shown || items.length)} sichtbar von ${Number(windowInfo.total || items.length)}`
      : `${items.length} sichtbar`;
    return `
      <div class="imageflow-worklist-filter" aria-label="Ablagefilter">
        <div class="imageflow-worklist-filter-buttons">
          ${filters.map((filter) => `
            <button class="imageflow-filter-chip ${state.worklist.filter === filter.id ? "is-active" : ""}" data-action="filter-worklist" data-worklist-filter="${escapeAttr(filter.id)}" type="button">${escapeHtml(filter.label)} <span>${filter.count}</span></button>
          `).join("")}
        </div>
        <span>${escapeHtml(visibleLabel)}</span>
      </div>
    `;
  }

  function filteredWorklistItems(items, filter) {
    if (filter === "issues") {
      return items.filter(isWorklistIssue);
    }
    if (filter === "ready") {
      return items.filter((item) => item.readiness === "ready");
    }
    if (filter === "waiting") {
      return items.filter((item) => ["planned", "queued", "executing"].includes(item.status || ""));
    }
    if (filter === "done") {
      return items.filter((item) => item.status === "executed");
    }
    return items;
  }

  function isWorklistIssue(item) {
    return item.readiness === "warning" || item.readiness === "error" || ["blocked", "failed"].includes(item.status || "");
  }

  function worklistEmptyLabel(filter, totalItems) {
    if (!totalItems) {
      return "Noch keine Entscheidungen für die Ablage vorhanden.";
    }
    return "Keine Einträge in diesem Filter.";
  }

  function renderWorklistItem(item) {
    const badgeClass = item.readiness === "error" ? "danger" : item.readiness === "warning" ? "ready" : "safe";
    const canRemove = ["planned", "queued"].includes(item.status || "");
    const jobId = state.worklist.jobId || state.worklist.preview?.job?.id || "";
    return `
      <div class="imageflow-worklist-row">
        <div>
          <strong>${escapeHtml(modeLabel(item.operationType))}</strong>
          <span>${escapeHtml(item.sourcePath || "")}</span>
          <small>${escapeHtml(item.targetPath || item.targetAlbumId || "")}</small>
          <small>${escapeHtml(queueStatusLabel(item.status))}${item.safeMode ? " | Prüfsummen" : ""}</small>
        </div>
        <div class="imageflow-worklist-item-actions">
          <span class="imageflow-badge ${badgeClass}">${readinessLabel(item.readiness)}</span>
          ${canRemove ? `<button class="imageflow-mini-button danger" data-action="remove-worklist-item" data-job-id="${escapeAttr(jobId)}" data-queue-item-id="${escapeAttr(item.id || "")}" aria-label="Ablage entfernen: ${escapeAttr(item.sourcePath || "")}" title="Ablage entfernen" type="button">x</button>` : ""}
        </div>
        <p>${(item.messages || []).map(escapeHtml).join(" ")}</p>
      </div>
    `;
  }

  function renderLogsPage() {
    const logs = state.logs.items || [];
    const filteredJob = state.logs.jobId ? state.jobs.find((job) => job.id === state.logs.jobId) : null;
    return `
      <section class="imageflow-log-page" aria-label="Protokoll">
        <div class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Protokoll</h3>
              <p>${filteredJob ? `Nur ${escapeHtml(filteredJob.name || `Runde ${state.logs.jobId}`)}` : "Sicherheits- und Sortierereignisse für deine Runden."}</p>
            </div>
            <div class="imageflow-actions">
              <select class="imageflow-select-compact" data-action="change-log-level" aria-label="Log-Level">
                <option value="" ${state.logs.level === "" ? "selected" : ""}>Alle Level</option>
                <option value="debug" ${state.logs.level === "debug" ? "selected" : ""}>Debug</option>
                <option value="info" ${state.logs.level === "info" ? "selected" : ""}>Info</option>
                <option value="warning" ${state.logs.level === "warning" ? "selected" : ""}>Warnung</option>
                <option value="error" ${state.logs.level === "error" ? "selected" : ""}>Fehler</option>
              </select>
              ${state.logs.jobId ? '<button class="imageflow-button" data-action="show-log" type="button">Alle Runden</button>' : ""}
              <button class="imageflow-button" data-action="refresh-logs" type="button">Aktualisieren</button>
            </div>
          </div>
          ${state.logs.loading ? '<div class="imageflow-empty">Protokoll wird geladen.</div>' : ""}
          ${state.logs.error ? `<div class="imageflow-empty">${escapeHtml(state.logs.error)}</div>` : ""}
          <div class="imageflow-log-list">
            ${logs.map(renderLogRow).join("") || '<div class="imageflow-empty">Noch keine Protokolleinträge vorhanden.</div>'}
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
          <small>${formatTime(log.createdAt)}${log.jobId ? ` · Runde ${escapeHtml(String(log.jobId))}` : ""}</small>
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
      form.addEventListener("submit", saveJob);
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
    const targetQueryInput = root.querySelector("[data-target-query]");
    if (targetQueryInput) {
      targetQueryInput.addEventListener("input", (event) => {
        state.targetQuery = event.currentTarget.value || "";
        searchTargetsSoon();
      });
      targetQueryInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          clearTargetSearch();
        }
      });
    }
    const targetCreateInput = root.querySelector("[data-target-create-name]");
    if (targetCreateInput) {
      targetCreateInput.addEventListener("input", (event) => {
        state.targetCreateName = event.currentTarget.value || "";
      });
      targetCreateInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          await createTargetFromInput();
        }
      });
    }
    bindFavoriteDragAndDrop();

    document.removeEventListener("keydown", handleHotkey);
    if (state.page === "sort") {
      document.addEventListener("keydown", handleHotkey);
    }
  }

  async function saveJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    readJobDraft(form);
    const intent = event.submitter?.dataset?.saveIntent || "save";
    const editingJobId = numberOrNull(state.jobDraft.editingJobId);
    const body = jobDraftPayload();

    try {
      const payload = editingJobId
        ? await request(`/api/v1/jobs/${editingJobId}`, { method: "PUT", body })
        : await request("/api/v1/jobs", { method: "POST", body });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: editingJobId ? "Runde wurde gespeichert." : "Runde wurde gespeichert und ist bereit." };
      resetJobDraft();
      if (intent === "open") {
        await openSort(payload.job.id, "resume");
        return;
      }
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Runde konnte nicht gespeichert werden." };
      render();
    }
  }

  function jobDraftPayload() {
    return {
      name: state.jobDraft.name.trim(),
      sourcePath: state.jobDraft.sourcePath.trim() || "/",
      targetMode: state.jobDraft.targetMode,
      targetPath: state.jobDraft.targetPath.trim(),
      safeMode: state.jobDraft.safeMode,
      autoProcess: state.jobDraft.autoProcess,
      preloadMode: state.jobDraft.preloadMode,
      targetOrdering: state.jobDraft.targetOrdering,
      hotkeys: state.jobDraft.hotkeys,
      customHotkeys: normalizeCustomHotkeys(state.jobDraft.customHotkeys),
    };
  }

  function resetJobDraft() {
    state.jobDraft = {
      editingJobId: null,
      name: "",
      sourcePath: "/Photos",
      targetMode: "album",
      targetPath: "/Photos/Sortiert",
      safeMode: true,
      autoProcess: false,
      preloadMode: "balanced",
      targetOrdering: "relevance",
      hotkeys: "number-row",
      customHotkeys: ["", "", "", "", "", "", "", "", ""],
    };
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
    if (event.target?.name === "hotkeys") {
      render();
    }
  }

  function readJobDraft(form = document.getElementById("imageflow-job-form")) {
    if (!form) {
      return;
    }
    state.jobDraft = {
      editingJobId: state.jobDraft.editingJobId,
      name: form.name?.value || "",
      sourcePath: form.sourcePath?.value || "/",
      targetMode: form.targetMode?.value || "album",
      targetPath: form.targetPath?.value || "/Photos/Sortiert",
      safeMode: Boolean(form.safeMode?.checked),
      autoProcess: Boolean(form.autoProcess?.checked),
      preloadMode: form.preloadMode?.value || "balanced",
      targetOrdering: form.targetOrdering?.value || "relevance",
      hotkeys: form.hotkeys?.value || "number-row",
      customHotkeys: Array.from(form.querySelectorAll(".imageflow-hotkey-input")).map((input) => input.value || ""),
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
    } else if (action === "edit-job" && jobId) {
      editJob(jobId);
    } else if (action === "cancel-edit-job" || action === "clear-job-draft") {
      resetJobDraft();
      render();
    } else if (action === "duplicate-job" && jobId) {
      await duplicateJob(jobId);
    } else if (action === "pause-job" && jobId) {
      await changeJobStatus(jobId, "pause");
    } else if (action === "resume-job" && jobId) {
      await changeJobStatus(jobId, "resume");
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
    } else if (action === "create-target") {
      await createTargetFromInput();
    } else if (action === "clear-target-search") {
      await clearTargetSearch();
    } else if (action === "undo-last-decision") {
      await undoLastDecision();
    } else if (action === "close-worklist-preview") {
      closeWorklistPreview();
    } else if (action === "refresh-worklist-preview") {
      await loadWorklistPreview(state.worklist.jobId);
    } else if (action === "toggle-worklist-auto") {
      state.worklist.autoProcess = Boolean(event.currentTarget.checked);
      render();
    } else if (action === "filter-worklist") {
      state.worklist.filter = event.currentTarget.dataset.worklistFilter || "all";
      render();
    } else if (action === "confirm-queue-job" && jobId) {
      await confirmQueueJob(jobId);
    } else if (action === "process-job-now" && jobId) {
      await processJobNow(jobId);
    } else if (action === "remove-worklist-item" && jobId) {
      await removeWorklistItem(jobId, numberOrNull(event.currentTarget.dataset.queueItemId));
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
      state.logs.jobId = null;
      await openLogs();
    } else if (action === "show-job-log" && jobId) {
      state.logs.jobId = jobId;
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

  function editJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) {
      state.toast = { type: "error", message: "Diese Runde wurde nicht gefunden." };
      render();
      return;
    }

    state.jobDraft = {
      editingJobId: job.id,
      name: job.name || "",
      sourcePath: job.sourcePath || "/",
      targetMode: job.targetMode || "album",
      targetPath: job.targetPath || "/Photos/Sortiert",
      safeMode: job.safeMode !== false,
      autoProcess: Boolean(job.options?.autoProcess),
      preloadMode: job.options?.preloadMode || "balanced",
      targetOrdering: job.options?.targetOrdering || "relevance",
      hotkeys: job.options?.hotkeys || "number-row",
      customHotkeys: normalizeCustomHotkeys(job.options?.customHotkeys || []),
    };
    state.toast = { type: "info", message: "Runde ist zum Bearbeiten geöffnet." };
    render();
  }

  async function duplicateJob(jobId) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/duplicate`, { method: "POST", body: {} });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: "Kopie wurde angelegt." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Runde konnte nicht kopiert werden." };
      render();
    }
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

  function searchTargetsSoon() {
    window.clearTimeout(targetSearchTimer);
    targetSearchTimer = window.setTimeout(async () => {
      if (!state.sortState?.job) {
        return;
      }
      await loadTargets(state.sortState.job.targetMode);
      render();
      const input = root.querySelector("[data-target-query]");
      input?.focus();
    }, 180);
  }

  async function clearTargetSearch() {
    if (!state.targetQuery) {
      return;
    }
    window.clearTimeout(targetSearchTimer);
    state.targetQuery = "";
    if (state.sortState?.job) {
      await loadTargets(state.sortState.job.targetMode);
    }
    render();
    const input = root.querySelector("[data-target-query]");
    input?.focus();
  }

  async function createTargetFromInput() {
    const job = state.sortState?.job;
    if (!job) {
      return;
    }

    const input = root.querySelector("[data-target-create-name]");
    const name = String(input?.value || state.targetCreateName || "").trim();
    if (!name) {
      state.toast = { type: "error", message: "Bitte gib dem neuen Ziel einen Namen." };
      render();
      return;
    }

    const isFolderMode = job.targetMode === "move" || job.targetMode === "copy";
    const parentPathValue = state.targetFolderPage?.current?.path || state.targetBrowsePath || job.targetPath || "/";
    try {
      const payload = await request("/api/v1/targets", {
        method: "POST",
        body: {
          mode: job.targetMode,
          name,
          path: isFolderMode ? normalizeDisplayPath(parentPathValue) : undefined,
        },
      });
      if (payload.folders) {
        state.targetFolderPage = payload.folders;
        state.targetBrowsePath = payload.folders.current?.path || normalizeDisplayPath(parentPathValue);
        state.targets = payload.folders.folders || [];
      } else {
        state.targets = payload.targets || (payload.target ? [payload.target, ...state.targets] : state.targets);
      }
      state.targetCreateName = "";
      state.targetQuery = "";
      state.toast = {
        type: "info",
        message: payload.duplicate ? "Dieses Ziel war schon vorhanden." : `${isFolderMode ? "Ordner" : "Album"} wurde angelegt.`,
      };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Ziel konnte nicht angelegt werden." };
      render();
    }
  }

  async function openWorklistPreview(jobId) {
    state.worklist = {
      open: true,
      jobId,
      loading: true,
      preview: null,
      error: null,
      autoProcess: Boolean((state.jobs.find((job) => job.id === jobId)?.options || {}).autoProcess),
      filter: "all",
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
        error: error.message || "Ablage konnte nicht geprüft werden.",
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
      filter: "all",
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
          ? "Ablage-Einstellung wurde gemerkt."
          : realWrites
          ? (state.worklist.autoProcess
            ? "Ablage darf automatisch laufen, wenn der Server ruhig ist."
            : "Ablage wartet, bis du sie manuell startest.")
          : "Ablage wurde für später gemerkt. Reale Dateiänderungen bleiben gesperrt.",
      };
      render();
    } catch (error) {
      state.worklist.error = error.message || "Ablage konnte nicht für später gemerkt werden.";
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
      state.toast = { type: "info", message: payload.result?.message || "Ablage wurde abgelegt." };
      render();
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Ablage konnte nicht abgelegt werden.";
      render();
    }
  }

  async function removeWorklistItem(jobId, queueItemId) {
    if (!jobId || !queueItemId) {
      return;
    }

    try {
      const payload = await request(`/api/v1/jobs/${jobId}/queue/${queueItemId}`, { method: "DELETE", body: {} });
      if (payload.job) {
        state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
        if (state.sortState?.job?.id === jobId) {
          state.sortState.job = payload.job;
        }
      }
      removePreviewItemLocally(queueItemId);
      state.toast = { type: "info", message: "Ablagepunkt wurde entfernt." };
      render();
    } catch (error) {
      state.worklist.error = error.message || "Ablagepunkt konnte nicht entfernt werden.";
      render();
    }
  }

  function removePreviewItemLocally(queueItemId) {
    const preview = state.worklist.preview;
    if (!preview || !Array.isArray(preview.items)) {
      return;
    }
    const removed = preview.items.find((item) => Number(item.id) === Number(queueItemId));
    preview.items = preview.items.filter((item) => Number(item.id) !== Number(queueItemId));
    if (!removed || !preview.summary) {
      return;
    }
    const summary = preview.summary;
    summary.total = Math.max(0, Number(summary.total || 0) - 1);
    if (summary[removed.status] !== undefined) {
      summary[removed.status] = Math.max(0, Number(summary[removed.status] || 0) - 1);
    }
    if (removed.readiness === "ready") {
      summary.ready = Math.max(0, Number(summary.ready || 0) - 1);
    } else if (removed.readiness === "warning") {
      summary.warnings = Math.max(0, Number(summary.warnings || 0) - 1);
    } else {
      summary.errors = Math.max(0, Number(summary.errors || 0) - 1);
    }
    if (preview.window) {
      preview.window.total = Math.max(0, Number(preview.window.total || 0) - 1);
      preview.window.shown = Math.max(0, Number(preview.window.shown || 0) - 1);
      preview.window.truncated = Number(preview.window.total || 0) > Number(preview.window.shown || 0);
    }
    preview.canQueue = Number(summary.planned || 0) > 0 && Number(summary.errors || 0) === 0;
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
    state.targetCreateName = "";
    state.targetQuery = "";
    clearImagePageCache();
    resetSessionFlow();
    await load();
  }

  async function restartSort(startMode) {
    state.imageIndex = 0;
    state.imagePage = null;
    state.pageCursor = null;
    state.startMode = startMode;
    clearImagePageCache();
    resetSessionFlow();
    await loadImagePage(null, null, true, startMode);
  }

  async function changeJobStatus(jobId, operation) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/${operation}`, { method: "POST", body: {} });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.toast = { type: "info", message: "Rundenstatus wurde aktualisiert." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Rundenstatus konnte nicht aktualisiert werden." };
      render();
    }
  }

  async function discardJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    const label = job?.name || `Runde ${jobId}`;
    if (typeof window.confirm === "function" && !window.confirm(`Runde "${label}" verwerfen?`)) {
      return;
    }

    try {
      await request(`/api/v1/jobs/${jobId}/discard`, { method: "POST", body: {} });
      state.jobs = state.jobs.filter((item) => item.id !== jobId);
      if (state.jobDraft.editingJobId === jobId) {
        resetJobDraft();
      }
      state.toast = { type: "info", message: "Runde wurde verworfen." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Runde konnte nicht verworfen werden." };
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
        message: payload.duplicate ? `Schon vorgemerkt: ${target.label}` : `Entschieden: ${target.label}`,
      };
      completeCurrentDecision(payload.duplicate ? "duplicate" : "assign", target.label);
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Entscheidung konnte nicht gespeichert werden." };
      render();
    }
  }

  async function undoLastDecision() {
    if (!state.jobId) {
      return;
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/undo`, { method: "POST", body: {} });
      if (payload.job && state.sortState) {
        state.sortState.job = payload.job;
        state.jobs = state.jobs.map((job) => (job.id === payload.job.id ? payload.job : job));
      } else if (state.sortState?.job) {
        state.sortState.job.sortedFiles = Math.max(0, Number(state.sortState.job.sortedFiles || 0) - 1);
        state.sortState.job.queuedOperations = Math.max(0, Number(state.sortState.job.queuedOperations || 0) - 1);
      }
      state.decisionStreak = Math.max(0, Number(state.decisionStreak || 0) - 1);
      state.decisionsThisSession = Math.max(0, Number(state.decisionsThisSession || 0) - 1);
      state.feedback = null;
      state.toast = { type: "info", message: payload.message || "Letzte Entscheidung wurde zurückgenommen." };
      clearImagePageCache();
      state.acceptDecreasedCounters = true;
      await loadImagePage(state.pageCursor, state.imageIndex, false, null);
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Letzte Entscheidung konnte nicht zurückgenommen werden." };
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
        message: payload.duplicate ? "Schnellziel ist schon da." : "Schnellziel wurde hinzugefügt.",
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
      state.toast = { type: "info", message: "Reihenfolge der Schnellziele gespeichert." };
      render();
    } catch (error) {
      state.sortState.favorites = previous;
      state.toast = { type: "error", message: error.message || "Reihenfolge der Schnellziele konnte nicht gespeichert werden." };
      render();
    }
  }

  async function handleHotkey(event) {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }
    const sortState = state.sortState || mockSortState(state.jobId || 1);
    if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "z") {
      event.preventDefault();
      await undoLastDecision();
      return;
    }
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
    const pressedKey = String(event.key || "").toLowerCase();
    const favorite = (sortState.favorites || []).find((item) => String(item.hotkey || "").toLowerCase() === pressedKey);
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
      state.toast = { type: "info", message: "Weiter zum nächsten Bild." };
      completeCurrentDecision("skip", "nächstes Bild");
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Bild konnte nicht übersprungen werden." };
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
    state.sortState.favorites = applyConfiguredHotkeys(favorites, state.sortState.job?.options || {});
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
      hotkey: hotkeyForPosition(index + 1, state.sortState?.job?.options || {}),
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
    prefetchAdjacentImagePages();
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
      return "Runde geschafft";
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
    return "Bereit für den nächsten Griff";
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
    prefetchAdjacentImagePages();
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

  function prefetchAdjacentImagePages() {
    if (state.page !== "sort" || !state.jobId || !state.sortState) {
      root.dataset.pageCacheSize = String(imagePageCache.size);
      root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
      return;
    }

    const images = sortImages(state.sortState);
    const page = pageInfo(state.sortState);
    const radius = activePreloadRadius() + 2;
    if (page.hasNext && state.imageIndex >= Math.max(0, images.length - radius)) {
      prefetchImagePage(page.nextCursor);
    }
    if (page.hasPrevious && state.imageIndex <= radius) {
      prefetchImagePage(page.previousCursor);
    }

    root.dataset.pageCacheSize = String(imagePageCache.size);
    root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
  }

  function prefetchImagePage(cursor) {
    if (cursor === null || cursor === undefined || !state.jobId) {
      return;
    }
    const numericCursor = Math.max(0, Number(cursor) || 0);
    const key = imagePageCacheKey(state.jobId, numericCursor);
    if (imagePageCache.has(key) || imagePagePrefetches.has(key)) {
      return;
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), cursor: String(numericCursor) });
    const promise = request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`)
      .then((payload) => {
        rememberImagePage(payload);
        preloadFirstPageImages(payload);
      })
      .catch(() => {})
      .finally(() => {
        imagePagePrefetches.delete(key);
        root.dataset.pageCacheSize = String(imagePageCache.size);
        root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
      });
    imagePagePrefetches.set(key, promise);
    root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
  }

  function preloadFirstPageImages(payload) {
    const images = Array.isArray(payload?.nextImages) ? payload.nextImages : [];
    const radius = activePreloadRadius();
    images.slice(0, radius).forEach((image, index) => {
      preloadImage(image, imageKey(image, index));
    });
  }

  function rememberImagePage(payload) {
    const cursor = Number(payload?.imagePage?.cursor ?? Number.NaN);
    const jobId = Number(payload?.job?.id || state.jobId || 0);
    if (!Number.isFinite(cursor) || jobId <= 0) {
      return;
    }
    imagePageCache.set(imagePageCacheKey(jobId, cursor), payload);
    while (imagePageCache.size > 5) {
      imagePageCache.delete(imagePageCache.keys().next().value);
    }
    root.dataset.pageCacheSize = String(imagePageCache.size);
  }

  function clearImagePageCache() {
    imagePageCache.clear();
    imagePagePrefetches.clear();
    root.dataset.pageCacheSize = "0";
    root.dataset.pagePrefetchPending = "0";
    root.dataset.pageCacheHit = "0";
  }

  function imagePageCacheKey(jobId, cursor) {
    return `${jobId}:${Math.max(0, Number(cursor) || 0)}`;
  }

  function mergeSortPayload(payload) {
    const previousJob = state.sortState?.job;
    if (state.acceptDecreasedCounters) {
      state.acceptDecreasedCounters = false;
      return payload;
    }
    if (!previousJob || !payload?.job || String(previousJob.id) !== String(payload.job.id)) {
      return payload;
    }

    return {
      ...payload,
      job: {
        ...payload.job,
        status: previousJob.status || payload.job.status,
        sortedFiles: Math.max(Number(payload.job.sortedFiles || 0), Number(previousJob.sortedFiles || 0)),
        skippedFiles: Math.max(Number(payload.job.skippedFiles || 0), Number(previousJob.skippedFiles || 0)),
        queuedOperations: Math.max(Number(payload.job.queuedOperations || 0), Number(previousJob.queuedOperations || 0)),
        executedOperations: Math.max(Number(payload.job.executedOperations || 0), Number(previousJob.executedOperations || 0)),
        failedOperations: Math.max(Number(payload.job.failedOperations || 0), Number(previousJob.failedOperations || 0)),
      },
    };
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
      sorting: "In Arbeit",
      paused: "Pausiert",
      ready: "Bereit",
      queued: "Wartet auf Ablage",
      executing: "Wird abgelegt",
      done: "Abgeschlossen",
      error: "Fehler",
    }[status] || escapeHtml(status || "");
  }

  function statusClass(status) {
    return {
      draft: "safe",
      sorting: "ready",
      paused: "",
      ready: "ready",
      queued: "ready",
      executing: "warning",
      done: "safe",
      error: "danger",
    }[status] || "";
  }

  function targetOrderingLabel(ordering) {
    return ordering === "alphabetical" ? "Alphabetisch" : "Lieblingsziele zuerst";
  }

  function readinessLabel(readiness) {
    return {
      ready: "Bereit",
      warning: "Warnung",
      error: "Fehler",
    }[readiness] || "Unklar";
  }

  function executionModeLabel(mode) {
    return mode === "real-writes-enabled" ? "Dateiänderungen aktiv" : "Dateiänderungen gesperrt";
  }

  function backgroundModeLabel(mode) {
    return {
      "cron-enabled": "Automatik aktiv",
      "cron-ready": "Automatik bereit",
      "cron-waiting": "Wartet auf Ruhe",
      "manual-only": "Manuell",
    }[mode] || "Manuell";
  }

  function executionModeClass(mode) {
    return mode === "real-writes-enabled" ? "danger" : "safe";
  }

  function backgroundModeClass(mode) {
    if (mode === "cron-ready" || mode === "cron-enabled") {
      return "ready";
    }
    if (mode === "cron-waiting") {
      return "warning";
    }
    return "safe";
  }

  function queueStatusLabel(status) {
    return {
      planned: "Geplant",
      queued: "Wartet",
      executing: "In Arbeit",
      executed: "Erledigt",
      blocked: "Blockiert",
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
