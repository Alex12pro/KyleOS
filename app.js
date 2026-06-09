const gamesEl = document.querySelector("#games");
const recentEl = document.querySelector("#recent");
const continueEl = document.querySelector("#continue-game");
const shortcutsEl = document.querySelector("#favorite-shortcuts");
const searchEl = document.querySelector("#search");
const countEl = document.querySelector("#count");
const summaryEl = document.querySelector("#summary");
const bootScreenEl = document.querySelector("#boot-screen");
const bootStatusEl = document.querySelector("#boot-status");
const batteryStatusEl = document.querySelector("#battery-status");
const clockEl = document.querySelector("#clock");
const webAppEl = document.querySelector("#app-web");
const webTabsListEl = document.querySelector("#web-tabs-list");
const webNewTabEl = document.querySelector("#web-new-tab");
const webFormEl = document.querySelector("#web-form");
const webAddressEl = document.querySelector("#web-address");
const webFrameEl = document.querySelector("#web-frame");
const webStageEl = document.querySelector(".web-stage");
const webStartEl = document.querySelector("#web-start");
const webStatusEl = document.querySelector("#web-status");
const webStatusTitleEl = document.querySelector("#web-status-title");
const webStatusMessageEl = document.querySelector("#web-status-message");
const webBackEl = document.querySelector("#web-back");
const webForwardEl = document.querySelector("#web-forward");
const webRefreshEl = document.querySelector("#web-refresh");
const webFullscreenEl = document.querySelector("#web-fullscreen");
const clock24El = document.querySelector("#setting-clock-24");
const reduceMotionEl = document.querySelector("#setting-reduce-motion");
const customWallpaperInputEl = document.querySelector("#custom-wallpaper-input");
const customWallpaperPreviewEl = document.querySelector("#custom-wallpaper-preview");
const interactivePatternEl = document.querySelector("#setting-interactive-pattern");
const settingsNoteEl = document.querySelector("#settings-note");
const resetBrowserDataEl = document.querySelector("#reset-browser-data");
const resetOsSettingsEl = document.querySelector("#reset-os-settings");
const dismissUpdateLogEl = document.querySelector("#dismiss-update-log");
const playerEl = document.querySelector("#player");
const playerTitleEl = document.querySelector("#player-title");
const playerFrameEl = document.querySelector("#player-frame");
const playerBackEl = document.querySelector("#player-back");
const playerRefreshEl = document.querySelector("#player-refresh");
const playerFullscreenEl = document.querySelector("#player-fullscreen");
const playerFullscreenIconEl = playerFullscreenEl?.querySelector("span");

const shardOrigins = window.GAME_SHARD_ORIGINS || {};
const favoritesKey = "nss:favorites";
const recentKey = "nss:recent";
const settingsKey = "kyleos:settings";
const updateLogSeenKey = "kyleos:update-log:uv-encoding-feabfc1";
const defaultSettings = {
  customWallpaper: "",
  pattern: "grid",
  interactivePattern: true,
  proxyEngine: "scramjet",
  accent: "blue",
  clock24: false,
  reduceMotion: false,
};
const accentThemes = {
  blue: { accent: "#53d8ff", hot: "#b8e7ff" },
  green: { accent: "#58f2a9", hot: "#c9ffe1" },
  rose: { accent: "#ff6fae", hot: "#ffd1e4" },
  gold: { accent: "#f6c85f", hot: "#fff1bd" },
};
let games = [];
let favoriteIds = readList(favoritesKey);
let recentIds = readList(recentKey);
let osSettings = readSettings();
let activeGame = null;
let highestWindowZ = 10;
let playerWindowStyle = null;
let webWindowStyle = null;
const windowPositionProperties = ["left", "top", "right", "bottom", "width", "height"];
const snapEdgeSize = 26;
let webLoadTimer = null;
let scramjetReadyPromise = null;
const SCRAMJET_STARTUP_TIMEOUT = 30000;
const proxyEngineLabels = {
  kyle: "Hidden Proxy",
  scramjet: "Scramjet",
  ultraviolet: "Ultraviolet",
};
let webTabs = [];
let activeWebTabId = null;
let nextWebTabId = 1;
const windowMinSizes = {
  browser: { width: 520, height: 360 },
  continue: { width: 300, height: 250 },
  recent: { width: 300, height: 250 },
  web: { width: 560, height: 380 },
  settings: { width: 420, height: 440 },
  "update-log": { width: 360, height: 300 },
};

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(settingsKey)) };
  } catch {
    return { ...defaultSettings };
  }
}

function writeSettings() {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(osSettings));
    return true;
  } catch {
    return false;
  }
}

function gameUrl(game) {
  const origin = shardOrigins[game.shard] || "";
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (!origin && isLocal) {
    return `/shards/${game.shard}${game.path}`;
  }

  return `${origin}${game.path}`;
}

function isFavorite(game) {
  return favoriteIds.includes(game.id);
}

function gameById(id) {
  return games.find((game) => game.id === id);
}

function initials(title) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function starButton(game) {
  const pressed = isFavorite(game);
  return `
    <button class="star-button" type="button" data-favorite="${game.id}" aria-label="${pressed ? "Remove shortcut" : "Add shortcut"}" aria-pressed="${pressed}">
      ${pressed ? "&#9733;" : "&#9734;"}
    </button>
  `;
}

function gameCard(game, compact = false) {
  return `
    <li class="${compact ? "compact-item" : ""}">
      <a href="#" data-game="${game.id}">
        <span>${game.title}</span>
      </a>
      ${starButton(game)}
    </li>
  `;
}

function emptyMessage(text) {
  return `<li class="empty">${text}</li>`;
}

function renderDesktopShortcuts() {
  const favoriteGames = favoriteIds.map(gameById).filter(Boolean);

  shortcutsEl.innerHTML = favoriteGames
    .map(
      (game) => `
        <button class="desktop-icon favorite-icon" type="button" data-game="${game.id}">
          <span class="icon-tile">${initials(game.title)}</span>
          <strong>${game.title}</strong>
        </button>
      `
    )
    .join("");
}

function renderUtilityApps() {
  const recentGames = recentIds.map(gameById).filter(Boolean).slice(0, 12);
  const continueGame = recentGames[0];

  continueEl.innerHTML = continueGame
    ? `
      <a class="continue-card" href="#" data-game="${continueGame.id}">
        <span>Resume</span>
        <strong>${continueGame.title}</strong>
      </a>
    `
    : `<p class="empty">Open a game and it will show up here.</p>`;

  recentEl.innerHTML = recentGames.length
    ? recentGames.map((game) => gameCard(game, true)).join("")
    : emptyMessage("No games played yet.");
}

function renderGames() {
  const query = searchEl.value.trim().toLowerCase();
  const visible = games.filter((game) => game.title.toLowerCase().includes(query));

  countEl.textContent = `${visible.length} shown`;

  if (visible.length === 0) {
    gamesEl.innerHTML = `<li class="empty">No games found.</li>`;
    return;
  }

  gamesEl.innerHTML = visible.map((game) => gameCard(game)).join("");
}

function renderAll() {
  renderDesktopShortcuts();
  renderUtilityApps();
  renderGames();
}

function applySettings() {
  const theme = accentThemes[osSettings.accent] || accentThemes.blue;
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.documentElement.style.setProperty("--hot", theme.hot);
  document.body.dataset.pattern = osSettings.pattern || "grid";
  document.body.classList.toggle("has-custom-wallpaper", !!osSettings.customWallpaper);
  document.body.classList.toggle("interactive-pattern", !!osSettings.interactivePattern);
  document.documentElement.style.setProperty(
    "--custom-wallpaper",
    osSettings.customWallpaper ? `url("${osSettings.customWallpaper}")` : "none"
  );
  document.body.classList.toggle("reduce-motion", osSettings.reduceMotion);
  updateClock();
}

function shouldAnimateEffects() {
  return !osSettings.reduceMotion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setupInteractivePattern() {
  window.addEventListener("pointermove", (event) => {
    if (!shouldAnimateEffects() || !osSettings.interactivePattern) return;

    document.documentElement.style.setProperty("--pattern-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--pattern-y", `${event.clientY}px`);
  });
}

function burstSparks(event, count = 8) {
  if (!shouldAnimateEffects() || event.target.closest("iframe")) return;

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#53d8ff";

  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.45;
    const distance = 24 + Math.random() * 46;

    spark.className = "vfx-spark";
    spark.style.left = `${event.clientX}px`;
    spark.style.top = `${event.clientY}px`;
    spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
    spark.style.setProperty("--spark-color", accentColor);
    document.body.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function setupSparkEffects() {
  document.addEventListener("pointerdown", (event) => {
    const interactiveTarget = event.target.closest("button, a, input, .window-bar, .player-topbar");
    if (interactiveTarget) {
      burstSparks(event, interactiveTarget.matches("input") ? 4 : 9);
    }
  });
}

function playOpenAnimation(element) {
  if (!element || !shouldAnimateEffects()) return;

  element.classList.remove("is-opening");
  void element.offsetWidth;
  element.classList.add("is-opening");
  window.setTimeout(() => {
    element.classList.remove("is-opening");
  }, 320);
}

function markUpdateLogSeen() {
  try {
    localStorage.setItem(updateLogSeenKey, "1");
  } catch {
    // If storage is unavailable, closing the window should still work.
  }
}

function showUpdateLogOnce() {
  try {
    if (localStorage.getItem(updateLogSeenKey)) return;
  } catch {
    return;
  }

  window.setTimeout(() => openApp("update-log"), 420);
}

function dismissUpdateLog() {
  markUpdateLogSeen();
  closeApp("update-log");
}

function renderSettings() {
  document.querySelectorAll("button[data-pattern]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.pattern === osSettings.pattern);
  });

  document.querySelectorAll("button[data-accent]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.accent === osSettings.accent);
  });

  document.querySelectorAll("button[data-proxy-engine]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.proxyEngine === osSettings.proxyEngine);
  });

  if (clock24El) {
    clock24El.checked = osSettings.clock24;
  }

  if (reduceMotionEl) {
    reduceMotionEl.checked = osSettings.reduceMotion;
  }

  if (interactivePatternEl) {
    interactivePatternEl.checked = !!osSettings.interactivePattern;
  }

  if (customWallpaperPreviewEl) {
    customWallpaperPreviewEl.style.backgroundImage = osSettings.customWallpaper
      ? `url("${osSettings.customWallpaper}")`
      : "";
  }
}

function updateSettings(nextSettings, message = "") {
  const previousSettings = osSettings;
  osSettings = { ...osSettings, ...nextSettings };
  if (!writeSettings()) {
    osSettings = previousSettings;
    if (settingsNoteEl) {
      settingsNoteEl.textContent = "That wallpaper image is too large to save.";
    }
    return;
  }
  applySettings();
  renderSettings();

  if (settingsNoteEl && message) {
    settingsNoteEl.textContent = message;
  }
}

function resetBrowserData() {
  webTabs.slice(1).forEach((tab) => tab.frameEl?.remove());
  webTabs = webTabs.slice(0, 1);

  if (!webTabs.length) {
    createWebTab();
  } else {
    const tab = webTabs[0];
    activeWebTabId = tab.id;
    tab.history = [];
    tab.historyIndex = -1;
    tab.title = "New Tab";
    tab.shellReady = false;
    tab.shellBoot = (tab.shellBoot || 0) + 1;
    tab.shellWaiters.splice(0).forEach((waiter) => waiter.reject(new Error("Browser data was reset.")));
    if (tab.frameEl) {
      tab.frameEl.src = browserFrameUrl(tab.id, tab.shellBoot);
    }
    syncActiveWebTab();
  }

  try {
    sessionStorage.removeItem("scramjet:controlled");
    sessionStorage.removeItem("scramjet:idb-reset");
  } catch {
    // Session storage can be unavailable in strict browser modes.
  }

  if (settingsNoteEl) {
    settingsNoteEl.textContent = "Browser tabs and session state reset.";
  }
}

function browserFrameUrl(tabId, bootId = 0) {
  const engine = osSettings.proxyEngine || defaultSettings.proxyEngine;
  return `./browser-frame.html?engine=${encodeURIComponent(engine)}&boot=${encodeURIComponent(bootId)}#${encodeURIComponent(tabId)}`;
}

function reloadWebFramesForEngine() {
  webTabs.forEach((tab) => {
    tab.history = [];
    tab.historyIndex = -1;
    tab.title = "New Tab";
    tab.shellReady = false;
    tab.shellBoot = (tab.shellBoot || 0) + 1;
    tab.shellWaiters.splice(0).forEach((waiter) => waiter.reject(new Error("Proxy engine changed.")));

    if (tab.frameEl) {
      tab.frameEl.src = browserFrameUrl(tab.id, tab.shellBoot);
    }
  });

  syncActiveWebTab();
}

function selectCustomWallpaper(file) {
  if (!file || !file.type.startsWith("image/")) {
    if (settingsNoteEl) {
      settingsNoteEl.textContent = "Choose an image file for the wallpaper.";
    }
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    updateSettings({ customWallpaper: reader.result }, "Custom wallpaper updated.");
  });
  reader.addEventListener("error", () => {
    if (settingsNoteEl) {
      settingsNoteEl.textContent = "Could not load that image.";
    }
  });
  reader.readAsDataURL(file);
}

function finishBoot(message = "Ready") {
  if (!bootScreenEl) return;

  if (bootStatusEl) {
    bootStatusEl.textContent = message;
  }

  window.setTimeout(() => {
    bootScreenEl.classList.add("is-hidden");
  }, 280);

  window.setTimeout(() => {
    bootScreenEl.hidden = true;
  }, 760);
}

function updateClock() {
  if (!clockEl) return;

  clockEl.textContent = new Date().toLocaleTimeString([], {
    hour: osSettings.clock24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: osSettings.clock24 ? false : undefined,
  });
}

async function setupBatteryStatus() {
  if (!batteryStatusEl) return;

  if (!("getBattery" in navigator)) {
    batteryStatusEl.textContent = "Battery n/a";
    return;
  }

  try {
    const battery = await navigator.getBattery();
    const renderBattery = () => {
      const percent = Math.round(battery.level * 100);
      batteryStatusEl.textContent = battery.charging
        ? `Battery ${percent}% charging`
        : `Battery ${percent}%`;
    };

    renderBattery();
    battery.addEventListener("levelchange", renderBattery);
    battery.addEventListener("chargingchange", renderBattery);
  } catch {
    batteryStatusEl.textContent = "Battery n/a";
  }
}

function bringToFront(windowEl) {
  highestWindowZ += 1;
  windowEl.style.zIndex = String(highestWindowZ);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makeDraggable(windowEl, handleEl, options = {}) {
  if (!windowEl || !handleEl) return;

  handleEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, a")) {
      return;
    }

    if (options.skip?.()) {
      return;
    }

    restoreWindowRect(windowEl);
    clearSnap(windowEl);

    const rect = windowEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    bringToFront(windowEl);
    windowEl.classList.add("is-dragging");
    windowEl.style.left = `${rect.left}px`;
    windowEl.style.top = `${rect.top}px`;
    windowEl.style.right = "auto";
    windowEl.style.bottom = "auto";
    windowEl.style.width = `${rect.width}px`;
    windowEl.style.height = `${rect.height}px`;
    handleEl.setPointerCapture?.(event.pointerId);

    const moveWindow = (moveEvent) => {
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      const nextLeft = clamp(moveEvent.clientX - offsetX, 0, maxLeft);
      const nextTop = clamp(moveEvent.clientY - offsetY, 0, maxTop);

      windowEl.style.left = `${nextLeft}px`;
      windowEl.style.top = `${nextTop}px`;
      setSnapPreview(snapModeForPointer(moveEvent));
    };

    const stopDrag = (endEvent) => {
      const snapMode = snapModeForPointer(endEvent);
      windowEl.classList.remove("is-dragging");
      setSnapPreview("");
      try {
        handleEl.releasePointerCapture?.(event.pointerId);
      } catch {
        // The browser may already have released this pointer.
      }
      document.removeEventListener("pointermove", moveWindow);
      document.removeEventListener("pointerup", stopDrag);
      document.removeEventListener("pointercancel", stopDrag);

      if (snapMode) {
        applyWindowSnap(windowEl, snapMode);
      }
    };

    document.addEventListener("pointermove", moveWindow);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
  });
}

function windowAppName(windowEl) {
  return windowEl.dataset.app || "";
}

function windowMinSize(windowEl) {
  const fallback = { width: 320, height: 260 };
  const size = windowMinSizes[windowAppName(windowEl)] || fallback;
  return {
    width: Math.min(size.width, Math.max(260, window.innerWidth - 16)),
    height: Math.min(size.height, Math.max(220, window.innerHeight - 82)),
  };
}

function prepareFloatingWindow(windowEl) {
  const rect = windowEl.getBoundingClientRect();
  windowEl.style.left = `${rect.left}px`;
  windowEl.style.top = `${rect.top}px`;
  windowEl.style.right = "auto";
  windowEl.style.bottom = "auto";
  windowEl.style.width = `${rect.width}px`;
  windowEl.style.height = `${rect.height}px`;
  return rect;
}

function clearSnap(windowEl) {
  windowEl.classList.remove("is-snapped", "snap-left", "snap-right", "snap-top");
}

function saveWindowRect(windowEl) {
  if (windowEl.dataset.restoreLeft) return;

  const rect = windowEl.getBoundingClientRect();
  windowEl.dataset.restoreLeft = `${rect.left}px`;
  windowEl.dataset.restoreTop = `${rect.top}px`;
  windowEl.dataset.restoreWidth = `${rect.width}px`;
  windowEl.dataset.restoreHeight = `${rect.height}px`;
}

function restoreWindowRect(windowEl) {
  if (!windowEl.dataset.restoreLeft) return;

  windowEl.style.left = windowEl.dataset.restoreLeft;
  windowEl.style.top = windowEl.dataset.restoreTop;
  windowEl.style.width = windowEl.dataset.restoreWidth;
  windowEl.style.height = windowEl.dataset.restoreHeight;
  windowEl.style.right = "auto";
  windowEl.style.bottom = "auto";
  delete windowEl.dataset.restoreLeft;
  delete windowEl.dataset.restoreTop;
  delete windowEl.dataset.restoreWidth;
  delete windowEl.dataset.restoreHeight;
}

function applyWindowSnap(windowEl, mode) {
  if (!mode || windowEl.classList.contains("is-fullscreen")) return;

  saveWindowRect(windowEl);
  clearSnap(windowEl);
  windowEl.classList.add("is-snapped", `snap-${mode}`);
  windowEl.style.left = "";
  windowEl.style.top = "";
  windowEl.style.right = "";
  windowEl.style.bottom = "";
  windowEl.style.width = "";
  windowEl.style.height = "";
}

function snapModeForPointer(event) {
  if (event.clientY <= snapEdgeSize) return "top";
  if (event.clientX <= snapEdgeSize) return "left";
  if (event.clientX >= window.innerWidth - snapEdgeSize) return "right";
  return "";
}

function setSnapPreview(mode) {
  document.body.dataset.snapPreview = mode || "";
}

function makeResizable(windowEl, options = {}) {
  if (!windowEl) return;

  const directions = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

  directions.forEach((direction) => {
    const handle = document.createElement("span");
    handle.className = `resize-handle resize-${direction}`;
    handle.dataset.resize = direction;
    handle.setAttribute("aria-hidden", "true");
    windowEl.appendChild(handle);

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || options.skip?.()) return;

      event.preventDefault();
      event.stopPropagation();

      const startRect = prepareFloatingWindow(windowEl);
      const minSize = windowMinSize(windowEl);
      const startX = event.clientX;
      const startY = event.clientY;
      const maxWidth = window.innerWidth;
      const maxHeight = Math.max(180, window.innerHeight - 58);

      bringToFront(windowEl);
      windowEl.classList.add("is-resizing");
      handle.setPointerCapture?.(event.pointerId);

      const resizeWindow = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        let nextLeft = startRect.left;
        let nextTop = startRect.top;
        let nextWidth = startRect.width;
        let nextHeight = startRect.height;

        if (direction.includes("e")) {
          nextWidth = clamp(startRect.width + dx, minSize.width, maxWidth - startRect.left);
        }

        if (direction.includes("s")) {
          nextHeight = clamp(startRect.height + dy, minSize.height, maxHeight - startRect.top);
        }

        if (direction.includes("w")) {
          const maxDelta = startRect.width - minSize.width;
          const clampedDx = clamp(dx, -startRect.left, maxDelta);
          nextLeft = startRect.left + clampedDx;
          nextWidth = startRect.width - clampedDx;
        }

        if (direction.includes("n")) {
          const maxDelta = startRect.height - minSize.height;
          const clampedDy = clamp(dy, -startRect.top, maxDelta);
          nextTop = startRect.top + clampedDy;
          nextHeight = startRect.height - clampedDy;
        }

        windowEl.style.left = `${nextLeft}px`;
        windowEl.style.top = `${nextTop}px`;
        windowEl.style.width = `${nextWidth}px`;
        windowEl.style.height = `${nextHeight}px`;
      };

      const stopResize = () => {
        windowEl.classList.remove("is-resizing");
        try {
          handle.releasePointerCapture?.(event.pointerId);
        } catch {
          // The pointer may already be released by the browser.
        }
        document.removeEventListener("pointermove", resizeWindow);
        document.removeEventListener("pointerup", stopResize);
        document.removeEventListener("pointercancel", stopResize);
      };

      document.addEventListener("pointermove", resizeWindow);
      document.addEventListener("pointerup", stopResize);
      document.addEventListener("pointercancel", stopResize);
    });
  });
}

function setupDraggableWindows() {
  document.querySelectorAll(".desktop-window").forEach((windowEl) => {
    makeDraggable(windowEl, windowEl.querySelector(".window-bar"));
    makeResizable(windowEl, {
      skip: () => windowEl.classList.contains("is-fullscreen"),
    });
  });

  makeDraggable(playerEl, playerEl.querySelector(".player-topbar"), {
    skip: () => playerEl.classList.contains("is-fullscreen"),
  });
}

function setPlayerFullscreen(isFullscreen) {
  if (isFullscreen) {
    playerWindowStyle = Object.fromEntries(
      windowPositionProperties.map((property) => [property, playerEl.style[property]])
    );
    windowPositionProperties.forEach((property) => {
      playerEl.style[property] = "";
    });
  } else if (playerWindowStyle) {
    windowPositionProperties.forEach((property) => {
      playerEl.style[property] = playerWindowStyle[property] || "";
    });
    playerWindowStyle = null;
  }

  playerEl.classList.toggle("is-fullscreen", isFullscreen);
  playerFullscreenEl.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Fullscreen");
  playerFullscreenEl.setAttribute("title", isFullscreen ? "Exit fullscreen" : "Fullscreen");

  if (playerFullscreenIconEl) {
    playerFullscreenIconEl.textContent = isFullscreen ? "□" : "⛶";
  }
}

function normalizeWebTarget(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  }

  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `https://search.brave.com/search?q=${encodeURIComponent(trimmed)}`;
}

function isInternalWebUrl(url) {
  return url.startsWith("/api/dat/token?") || url.startsWith("/api/v1/data?") || url.startsWith("/api/proxy?");
}

function setWebStatus(title, message) {
  webStatusTitleEl.textContent = title;
  webStatusMessageEl.textContent = message;
  webStatusEl.hidden = false;
}

function waitForScramjet() {
  if (window.__scramjet) {
    return Promise.resolve(window.__scramjet);
  }

  if (window.__scramjetError) {
    return Promise.reject(new Error(window.__scramjetError));
  }

  if (!scramjetReadyPromise) {
    scramjetReadyPromise = new Promise((resolve, reject) => {
      let timeout;
      const cleanup = () => {
        window.clearTimeout(timeout);
        window.removeEventListener("scramjet:ready", ready);
        window.removeEventListener("scramjet:error", fail);
      };
      const resetAndReject = (error) => {
        cleanup();
        scramjetReadyPromise = null;
        reject(error);
      };
      const fail = (event) => {
        resetAndReject(new Error(event.detail?.message || "Scramjet failed to initialize."));
      };
      const ready = (event) => {
        cleanup();
        scramjetReadyPromise = null;
        resolve(event.detail.scramjet);
      };
      timeout = window.setTimeout(() => {
        resetAndReject(new Error("Scramjet is still starting. Try again in a moment."));
      }, SCRAMJET_STARTUP_TIMEOUT);
      window.addEventListener("scramjet:ready", ready, { once: true });
      window.addEventListener("scramjet:error", fail, { once: true });
    });
  }

  return scramjetReadyPromise;
}

function activeWebTab() {
  return webTabs.find((tab) => tab.id === activeWebTabId) || null;
}

function titleForWebUrl(url) {
  if (!url) return "New Tab";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "search.brave.com") return "Search";
    return "Private Tab";
  } catch {
    return "Page";
  }
}

function createWebFrame(tab, useExistingFrame = false) {
  const frame = useExistingFrame ? webFrameEl : document.createElement("iframe");
  frame.className = "web-frame";
  frame.title = `Brave Web - ${tab.title}`;
  frame.referrerPolicy = "no-referrer";
  frame.allow = "fullscreen; autoplay; clipboard-read; clipboard-write";
  frame.dataset.webTab = tab.id;
  frame.hidden = tab.id !== activeWebTabId;
  frame.src = browserFrameUrl(tab.id, tab.shellBoot);

  if (!useExistingFrame) {
    webStageEl.appendChild(frame);
  }

  return frame;
}

function createWebTab(url = "") {
  const tab = {
    id: `tab-${nextWebTabId}`,
    title: titleForWebUrl(url),
    history: [],
    historyIndex: -1,
    frameEl: null,
    shellReady: false,
    shellBoot: 0,
    shellWaiters: [],
  };

  nextWebTabId += 1;
  webTabs.push(tab);
  activeWebTabId = tab.id;
  tab.frameEl = createWebFrame(tab, webTabs.length === 1);

  renderWebTabs();
  syncActiveWebTab();

  if (url) {
    loadWebUrl(url);
  }

  return tab;
}

function renderWebTabs() {
  webTabsListEl.innerHTML = webTabs
    .map(
      (tab) => `
        <button class="web-tab${tab.id === activeWebTabId ? " is-active" : ""}" type="button" data-web-tab="${tab.id}" role="tab" aria-selected="${tab.id === activeWebTabId}">
          <span>${tab.title}</span>
          <span class="web-tab-close" data-close-web-tab="${tab.id}" aria-label="Close tab" title="Close tab">&times;</span>
        </button>
      `
    )
    .join("");
}

function syncActiveWebTab() {
  const tab = activeWebTab();
  if (!tab) return;

  webTabs.forEach((item) => {
    if (item.frameEl) {
      item.frameEl.hidden = item.id !== tab.id;
    }
  });

  webAddressEl.value = "";
  webStartEl.hidden = tab.historyIndex >= 0;
  if (tab.historyIndex < 0) {
    renderScramjetStartupState();
  } else {
    webStatusEl.hidden = true;
  }

  renderWebTabs();
  updateWebControls();
}

function switchWebTab(id) {
  if (!webTabs.some((tab) => tab.id === id)) return;
  activeWebTabId = id;
  syncActiveWebTab();
}

function closeWebTab(id) {
  if (webTabs.length <= 1) {
    const tab = activeWebTab();
    if (!tab) return;
    tab.history = [];
    tab.historyIndex = -1;
    tab.title = "New Tab";
    postWebShellCommand(tab, "kyleos:web-blank");
    syncActiveWebTab();
    return;
  }

  const index = webTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;

  const [removed] = webTabs.splice(index, 1);
  removed.frameEl?.remove();

  if (activeWebTabId === id) {
    const nextTab = webTabs[Math.max(0, index - 1)] || webTabs[0];
    activeWebTabId = nextTab.id;
  }

  syncActiveWebTab();
}

async function navigateScramjet(tab, url) {
  await waitForWebShell(tab);
  postWebShellCommand(tab, "kyleos:web-go", { url, engine: osSettings.proxyEngine });
}

function updateWebControls() {
  const tab = activeWebTab();
  const hasPage = !!tab && tab.historyIndex >= 0;
  const isFullscreen = webAppEl.classList.contains("is-fullscreen");

  webBackEl.disabled = !tab || tab.historyIndex <= 0;
  webForwardEl.disabled = !tab || tab.historyIndex >= tab.history.length - 1;
  webRefreshEl.disabled = !hasPage;
  webFullscreenEl.textContent = isFullscreen ? "Window" : "Full";
  webFullscreenEl.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Fullscreen");
  webFullscreenEl.setAttribute("title", isFullscreen ? "Exit fullscreen" : "Fullscreen");
}

async function loadWebUrl(url, shouldRecord = true) {
  if (!url) return;
  const tab = activeWebTab() || createWebTab();

  if (shouldRecord) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
  }

  tab.title = titleForWebUrl(url);
  webAddressEl.value = "";
  webStartEl.hidden = true;
  window.clearTimeout(webLoadTimer);
  renderWebTabs();
  const engineName = proxyEngineLabels[osSettings.proxyEngine] || "Proxy";

  setWebStatus(
    "Opening page...",
    `Opening through ${engineName}. Links and searches should stay inside this window.`
  );
  try {
    await navigateScramjet(tab, url);
    webLoadTimer = window.setTimeout(() => {
      if (activeWebTabId === tab.id && tab.historyIndex >= 0) {
        setWebStatus(
          "Still loading...",
          `${engineName} is still working on this page. If it never appears, the site may block proxy browsers.`
        );
      }
    }, 2800);
  } catch (error) {
    setWebStatus(`${engineName} is not ready`, error.message || "Could not start the browser engine.");
  }
  updateWebControls();
}

function submitWebAddress() {
  loadWebUrl(normalizeWebTarget(webAddressEl.value));
}

function goWebHistory(direction) {
  const tab = activeWebTab();
  if (!tab) return;

  const nextIndex = tab.historyIndex + direction;

  if (nextIndex < 0 || nextIndex >= tab.history.length) {
    if (direction < 0) {
      postWebShellCommand(tab, "kyleos:web-back");
    } else {
      postWebShellCommand(tab, "kyleos:web-forward");
    }
    return;
  }

  tab.historyIndex = nextIndex;
  loadWebUrl(tab.history[tab.historyIndex], false);
}

function refreshWeb() {
  const tab = activeWebTab();
  if (tab && tab.historyIndex >= 0) {
    if (!isInternalWebUrl(tab.history[tab.historyIndex])) {
      postWebShellCommand(tab, "kyleos:web-reload");
      return;
    }

    loadWebUrl(tab.history[tab.historyIndex], false);
  }
}

function toggleWebFullscreen() {
  const isEnteringFullscreen = !webAppEl.classList.contains("is-fullscreen");

  if (isEnteringFullscreen) {
    webWindowStyle = Object.fromEntries(
      windowPositionProperties.map((property) => [property, webAppEl.style[property]])
    );
    windowPositionProperties.forEach((property) => {
      webAppEl.style[property] = "";
    });
  } else if (webWindowStyle) {
    windowPositionProperties.forEach((property) => {
      webAppEl.style[property] = webWindowStyle[property] || "";
    });
    webWindowStyle = null;
  }

  webAppEl.classList.toggle("is-fullscreen", isEnteringFullscreen);
  updateWebControls();
}

function renderScramjetStartupState() {
  const engineName = proxyEngineLabels[osSettings.proxyEngine] || "Proxy";
  setWebStatus(`${engineName} loading`, "The browser engine is starting. Searches will open once it is ready.");
}

function handleWebFrameLoad(tabId) {
  if (tabId !== activeWebTabId) return;

  window.clearTimeout(webLoadTimer);
  webLoadTimer = window.setTimeout(() => {
    webStatusEl.hidden = true;
  }, 450);
}

function waitForWebShell(tab) {
  if (tab.shellReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const waiter = {
      resolve: () => {
        window.clearTimeout(timeout);
        resolve();
      },
      reject: (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    };
    const timeout = window.setTimeout(() => {
      tab.shellWaiters = tab.shellWaiters.filter((item) => item !== waiter);
      reject(new Error("The browser tab is still starting. Try again in a moment."));
    }, SCRAMJET_STARTUP_TIMEOUT);

    tab.shellWaiters.push(waiter);
  });
}

function postWebShellCommand(tab, type, detail = {}) {
  tab.frameEl?.contentWindow?.postMessage({ type, tabId: tab.id, ...detail }, window.location.origin);
}

function handleWebShellMessage(event) {
  if (event.origin !== window.location.origin) return;
  const tab = webTabs.find((item) => item.id === event.data?.tabId);
  if (!tab) return;

  if (event.data.type === "kyleos:web-shell-ready") {
    tab.shellReady = true;
    tab.shellWaiters.splice(0).forEach((waiter) => waiter.resolve());
    if (tab.id === activeWebTabId && !tab.history.length) {
      const engineName = proxyEngineLabels[event.data.engine || osSettings.proxyEngine] || "Proxy";
      setWebStatus(`${engineName} ready`, `Type a search or URL to browse through the ${engineName} engine.`);
    }
  } else if (event.data.type === "kyleos:web-shell-error") {
    const error = new Error(event.data.message || "The browser tab could not load.");
    tab.shellWaiters.splice(0).forEach((waiter) => waiter.reject(error));
    if (tab.id === activeWebTabId) {
      const engineName = proxyEngineLabels[event.data.engine || osSettings.proxyEngine] || "Proxy";
      setWebStatus(`${engineName} failed`, error.message);
    }
  } else if (event.data.type === "kyleos:web-shell-fallback") {
    if (tab.id === activeWebTabId) {
      setWebStatus("Using fallback", event.data.message || "Opening through the hidden libcurl route.");
    }
  } else if (event.data.type === "kyleos:web-shell-loaded") {
    handleWebFrameLoad(tab.id);
  }
}

function openApp(name) {
  const app = document.querySelector(`[data-app="${name}"]`);
  if (!app) return;

  app.hidden = false;
  app.classList.add("is-open");
  app.classList.remove("is-minimized");
  bringToFront(app);
  playOpenAnimation(app);
  updateTaskbarState();
}

function closeApp(name) {
  const app = document.querySelector(`[data-app="${name}"]`);
  if (!app) return;

  if (name === "update-log") {
    markUpdateLogSeen();
  }

  app.hidden = true;
  app.classList.remove("is-open", "is-minimized");
  clearSnap(app);
  restoreWindowRect(app);

  if (name === "web") {
    if (webAppEl.classList.contains("is-fullscreen")) {
      toggleWebFullscreen();
    } else {
      webWindowStyle = null;
    }
    updateWebControls();
  }

  updateTaskbarState();
}

function minimizeApp(name) {
  const app = document.querySelector(`[data-app="${name}"]`);
  if (!app) return;

  if (name === "web" && webAppEl.classList.contains("is-fullscreen")) {
    toggleWebFullscreen();
  }

  app.hidden = true;
  app.classList.add("is-open", "is-minimized");
  updateTaskbarState();
}

function updateTaskbarState() {
  document.querySelectorAll(".taskbar [data-open-app]").forEach((button) => {
    const app = document.querySelector(`[data-app="${button.dataset.openApp}"]`);
    const isOpen = !!app?.classList.contains("is-open");
    const isMinimized = !!app?.classList.contains("is-minimized");

    button.classList.toggle("is-running", isOpen);
    button.classList.toggle("is-minimized", isMinimized);
    button.setAttribute("aria-pressed", isOpen && !isMinimized ? "true" : "false");
  });
}

function toggleFavorite(id) {
  favoriteIds = favoriteIds.includes(id)
    ? favoriteIds.filter((item) => item !== id)
    : [id, ...favoriteIds];

  writeList(favoritesKey, favoriteIds);
  renderAll();
}

function rememberGame(game) {
  recentIds = [game.id, ...recentIds.filter((id) => id !== game.id)].slice(0, 12);
  writeList(recentKey, recentIds);
}

function openGame(game) {
  activeGame = game;
  rememberGame(game);
  renderUtilityApps();

  setPlayerFullscreen(false);
  playerEl.style.left = "";
  playerEl.style.top = "";
  playerEl.style.right = "";
  playerEl.style.bottom = "";
  playerEl.style.width = "";
  playerEl.style.height = "";
  playerTitleEl.textContent = game.title;
  document.title = `${game.title} | Kyle OS`;
  playerFrameEl.src = gameUrl(game);
  playerEl.hidden = false;
  bringToFront(playerEl);
  playOpenAnimation(playerEl);
  document.body.classList.add("is-playing");
}

function closeGame() {
  activeGame = null;
  playerFrameEl.src = "about:blank";
  playerEl.hidden = true;
  setPlayerFullscreen(false);
  document.body.classList.remove("is-playing");
  document.title = "Kyle OS";
}

function refreshGame() {
  if (playerFrameEl.src && playerFrameEl.src !== "about:blank") {
    playerFrameEl.src = playerFrameEl.src;
  }
}

function fullscreenGame() {
  setPlayerFullscreen(!playerEl.classList.contains("is-fullscreen"));
}

async function init() {
  if (bootStatusEl) {
    bootStatusEl.textContent = "Loading game library...";
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  setupBatteryStatus();

  const gamesResponse = await fetch("./games.json");
  const gamesData = await gamesResponse.json();

  games = gamesData.games;
  summaryEl.textContent = `${gamesData.gameCount} games installed`;

  recentIds = recentIds.filter((id) => gameById(id));
  favoriteIds = favoriteIds.filter((id) => gameById(id));
  writeList(recentKey, recentIds);
  writeList(favoritesKey, favoriteIds);

  renderAll();
  renderSettings();
  finishBoot("Ready");
  setupDraggableWindows();
  setupInteractivePattern();
  setupSparkEffects();
  showUpdateLogOnce();
  updateTaskbarState();
}

searchEl.addEventListener("input", renderGames);
document.addEventListener("click", (event) => {
  const closeWebTabButton = event.target.closest("[data-close-web-tab]");
  if (closeWebTabButton) {
    event.preventDefault();
    event.stopPropagation();
    closeWebTab(closeWebTabButton.dataset.closeWebTab);
    return;
  }

  const webTabButton = event.target.closest("[data-web-tab]");
  if (webTabButton) {
    event.preventDefault();
    switchWebTab(webTabButton.dataset.webTab);
    return;
  }

  const openButton = event.target.closest("[data-open-app]");
  if (openButton) {
    openApp(openButton.dataset.openApp);
    return;
  }

  const closeButton = event.target.closest("[data-close-app]");
  if (closeButton) {
    closeApp(closeButton.dataset.closeApp);
    return;
  }

  const minimizeButton = event.target.closest("[data-minimize-app]");
  if (minimizeButton) {
    minimizeApp(minimizeButton.dataset.minimizeApp);
    return;
  }

  const patternButton = event.target.closest("button[data-pattern]");
  if (patternButton) {
    updateSettings({ pattern: patternButton.dataset.pattern }, "Pattern updated.");
    return;
  }

  const accentButton = event.target.closest("button[data-accent]");
  if (accentButton) {
    updateSettings({ accent: accentButton.dataset.accent }, "Accent updated.");
    return;
  }

  const proxyEngineButton = event.target.closest("button[data-proxy-engine]");
  if (proxyEngineButton) {
    updateSettings({ proxyEngine: proxyEngineButton.dataset.proxyEngine }, "Proxy engine updated.");
    reloadWebFramesForEngine();
    return;
  }

  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    event.preventDefault();
    toggleFavorite(favoriteButton.dataset.favorite);
    return;
  }

  const gameLink = event.target.closest("[data-game]");
  if (!gameLink) {
    return;
  }

  event.preventDefault();
  const game = gameById(gameLink.dataset.game);
  if (game) {
    openGame(game);
  }
});

playerBackEl.addEventListener("click", closeGame);
playerRefreshEl.addEventListener("click", refreshGame);
playerFullscreenEl.addEventListener("click", fullscreenGame);
webFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitWebAddress();
});
webAddressEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitWebAddress();
  }
});
webBackEl.addEventListener("click", () => goWebHistory(-1));
webForwardEl.addEventListener("click", () => goWebHistory(1));
webRefreshEl.addEventListener("click", refreshWeb);
webFullscreenEl.addEventListener("click", toggleWebFullscreen);
webNewTabEl.addEventListener("click", () => createWebTab());
clock24El?.addEventListener("change", () => {
  updateSettings({ clock24: clock24El.checked }, "Clock updated.");
});
reduceMotionEl?.addEventListener("change", () => {
  updateSettings({ reduceMotion: reduceMotionEl.checked }, "Animation preference updated.");
});
interactivePatternEl?.addEventListener("change", () => {
  updateSettings({ interactivePattern: interactivePatternEl.checked }, "Pattern interaction updated.");
});
customWallpaperInputEl?.addEventListener("change", () => {
  selectCustomWallpaper(customWallpaperInputEl.files?.[0]);
  customWallpaperInputEl.value = "";
});
resetBrowserDataEl?.addEventListener("click", resetBrowserData);
dismissUpdateLogEl?.addEventListener("click", dismissUpdateLog);
resetOsSettingsEl?.addEventListener("click", () => {
  osSettings = { ...defaultSettings };
  writeSettings();
  applySettings();
  renderSettings();
  if (settingsNoteEl) {
    settingsNoteEl.textContent = "OS settings reset.";
  }
});
window.addEventListener("scramjet:ready", () => {
  if (osSettings.proxyEngine !== "scramjet") return;

  const tab = activeWebTab();
  if (!tab || !tab.history.length) {
    setWebStatus("Scramjet ready", "Type a search or URL to browse through the Scramjet engine.");
  }
});
window.addEventListener("scramjet:error", (event) => {
  if (osSettings.proxyEngine !== "scramjet") return;

  setWebStatus("Scramjet failed", event.detail?.message || "The browser engine could not start.");
});
window.addEventListener("message", handleWebShellMessage);

createWebTab();
applySettings();
renderSettings();
renderScramjetStartupState();
updateWebControls();
updateTaskbarState();

init().catch((error) => {
  summaryEl.textContent = "Could not load game library";
  if (bootStatusEl) {
    bootStatusEl.textContent = "Could not load game library";
  }
  console.error(error);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeGame) {
    closeGame();
  }
});
