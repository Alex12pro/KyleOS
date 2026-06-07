(async function () {
  const STARTUP_TIMEOUT = 30000;
  const WORKER_URL = "/uv-sw.js?v=1";
  const WORKER_SCOPE = "/uv/service/";

  if (!("serviceWorker" in navigator)) {
    fail("Service workers are not supported in this browser.");
    return;
  }

  await loadScript("/uv/uv.bundle.js", { retries: 2, timeout: STARTUP_TIMEOUT });
  await loadScript("/uv/uv.config.js", { retries: 2, timeout: STARTUP_TIMEOUT });
  await withTimeout(setupBareMuxTransport(), STARTUP_TIMEOUT, "Ultraviolet transport did not become ready in time.");

  const registration = await withTimeout(
    navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE }),
    STARTUP_TIMEOUT,
    "Ultraviolet service worker registration timed out."
  );
  await waitForActiveServiceWorker(registration, STARTUP_TIMEOUT);

  const ultraviolet = createUltravioletController();

  window.__ultraviolet = ultraviolet;
  window.__ultravioletReady = true;

  const dispatchReady = () => {
    window.dispatchEvent(new CustomEvent("ultraviolet:ready", { detail: { ultraviolet } }));
  };

  dispatchReady();
})().catch((error) => {
  console.error("[ultraviolet] Failed to initialize", error);
  fail(error?.stack || error?.message || String(error) || "Ultraviolet failed to initialize.");
});

function createUltravioletController() {
  if (typeof self.Ultraviolet === "undefined") {
    throw new Error("Ultraviolet bundle did not expose a browser controller.");
  }

  const encode = (url) => `${self.__uv$config.prefix}${self.__uv$config.encodeUrl(url)}`;

  return {
    prefix: self.__uv$config.prefix,
    encodeUrl(url) {
      return encode(url);
    },
    createFrame(existingFrame) {
      const frame = existingFrame || document.createElement("iframe");

      return {
        frame,
        go(url) {
          frame.src = encode(url);
        },
        back() {
          safeFrameHistory(frame, "back");
        },
        forward() {
          safeFrameHistory(frame, "forward");
        },
        reload() {
          try {
            frame.contentWindow.location.reload();
          } catch {
            if (frame.src) frame.src = frame.src;
          }
        },
      };
    },
  };
}

async function setupBareMuxTransport() {
  const { BareMuxConnection } = await import("/uv-mux/index.js");
  const { BareClient } = await import("/sj-assets/bare-as-module3.js");
  const connection = new BareMuxConnection("/uv-mux/worker.js");
  await connection.setRemoteTransport(new BareClient(`${location.origin}/api/bare/`), "KyleOS Bare v3");
}

function safeFrameHistory(frame, method) {
  try {
    frame.contentWindow.history[method]();
  } catch {
    // Cross-origin frame history may be blocked by the browser.
  }
}

function fail(message) {
  window.__ultravioletError = message;
  window.dispatchEvent(new CustomEvent("ultraviolet:error", { detail: { message } }));
}

async function loadScript(src, options = {}) {
  const retries = options.retries ?? 0;
  const timeout = options.timeout ?? 15000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await loadScriptOnce(src, timeout);
      return;
    } catch (error) {
      document.querySelector(`script[data-ultraviolet-src="${src}"]`)?.remove();

      if (attempt >= retries) {
        throw new Error(`Could not load ${src}: ${error?.message || "network error"}`);
      }

      await delay(350 * (attempt + 1));
    }
  }
}

function loadScriptOnce(src, timeout) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-ultraviolet-src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    let timer;
    const cleanup = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };

    script.dataset.ultravioletSrc = src;
    script.onload = () => {
      cleanup();
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("script request failed"));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("script request timed out"));
    }, timeout);

    if (!existing) {
      script.src = src;
      document.head.appendChild(script);
    }
  });
}

function waitForActiveServiceWorker(registration, timeout) {
  if (registration.active) {
    return Promise.resolve(registration.active);
  }

  const worker = registration.installing || registration.waiting;
  const readyPromise = navigator.serviceWorker.ready.then((readyRegistration) => readyRegistration.active);

  if (!worker) {
    return withTimeout(readyPromise, timeout, "Ultraviolet service worker did not become ready in time.");
  }

  const workerPromise = new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve(worker);
      return;
    }

    if (worker.state === "redundant") {
      resolve(readyPromise);
      return;
    }

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        resolve(worker);
      } else if (worker.state === "redundant") {
        resolve(readyPromise);
      }
    });
  });

  return withTimeout(
    Promise.race([workerPromise, readyPromise]),
    timeout,
    "Ultraviolet service worker did not activate in time."
  );
}

function withTimeout(promise, timeout, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeout);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timer);
  });
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
