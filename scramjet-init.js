(async function () {
  const STARTUP_TIMEOUT = 30000;
  const WORKER_URL = "/sj-sw.js?v=24";

  if (!("serviceWorker" in navigator)) {
    fail("Service workers are not supported in this browser.");
    return;
  }

  await loadScript("/sj-v2-assets/scramjet_bundled.js", { retries: 2, timeout: STARTUP_TIMEOUT });
  await loadScript("/sj-v2-assets/sj-v2-core.js", { retries: 2, timeout: STARTUP_TIMEOUT });

  const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: "/" });
  await waitForActiveServiceWorker(registration, STARTUP_TIMEOUT);

  const scramjet = createCompatController();

  console.log(`[scramjet] Ready v${window.__scramjetV2.version()}`);
  window.__scramjet = scramjet;
  window.__scramjetReady = true;
  window.scramjetEncode = (url) => window.__scramjetV2.rewriteTopUrl(url);

  const dispatchReady = () => {
    window.dispatchEvent(new CustomEvent("scramjet:ready", { detail: { scramjet } }));
  };

  if (navigator.serviceWorker.controller) {
    dispatchReady();
  } else {
    navigator.serviceWorker.addEventListener("controllerchange", dispatchReady, { once: true });
  }
})().catch((error) => {
  console.error("[scramjet] Failed to initialize", error);
  fail(error?.stack || error?.message || String(error) || "Scramjet failed to initialize.");
});

function createCompatController() {
  return {
    prefix: "/sj/",
    async init() {},
    encodeUrl(url) {
      return window.__scramjetV2.rewriteTopUrl(url);
    },
    createFrame(existingFrame) {
      const frame = existingFrame || document.createElement("iframe");
      frame.name = frame.name || `scramjet-frame-${Math.random().toString(36).slice(2)}`;

      return {
        frame,
        go(url) {
          frame.src = window.__scramjetV2.rewriteTopUrl(url);
          console.log("[scramjet] navigate -> go navigated to", url);
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

function safeFrameHistory(frame, method) {
  try {
    frame.contentWindow.history[method]();
  } catch {
    // Cross-origin frame history may be blocked by the browser.
  }
}

function fail(message) {
  window.__scramjetError = message;
  window.dispatchEvent(new CustomEvent("scramjet:error", { detail: { message } }));
}

async function loadScript(src, options = {}) {
  const retries = options.retries ?? 0;
  const timeout = options.timeout ?? 15000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await loadScriptOnce(src, timeout);
      return;
    } catch (error) {
      document.querySelector(`script[data-scramjet-src="${src}"]`)?.remove();

      if (attempt >= retries) {
        throw new Error(`Could not load ${src}: ${error?.message || "network error"}`);
      }

      await delay(350 * (attempt + 1));
    }
  }
}

function loadScriptOnce(src, timeout) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-scramjet-src="${src}"]`);
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

    script.dataset.scramjetSrc = src;
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
    return withTimeout(readyPromise, timeout, "Scramjet service worker did not become ready in time.");
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
    "Scramjet service worker did not activate in time."
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
