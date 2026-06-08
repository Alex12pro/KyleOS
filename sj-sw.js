// Scramjet Service Worker v2 alpha.
if (!self.WebSocket) {
  self.WebSocket = class {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor() {
      throw new Error("WebSocket is not available inside this service worker.");
    }
  };
}

if (!self.URL.createObjectURL) {
  self.URL.createObjectURL = () => {
    throw new Error("URL.createObjectURL is not available inside this service worker.");
  };
}

if (!self.URL.revokeObjectURL) {
  self.URL.revokeObjectURL = () => {};
}

importScripts("/sj-v2-assets/scramjet_bundled.js");
importScripts("/sj-v2-assets/sj-v2-core.js");

const scramjetContext = self.__scramjetV2.createContext();
const scramjetHandler = new self.$scramjet.ScramjetFetchHandler({
  context: scramjetContext,
  transport: self.__scramjetV2.createTransport(),
  crossOriginIsolated: false,
  sendSetCookie: async (cookies) => {
    for (const item of cookies || []) {
      scramjetContext.cookieJar.setCookies(item.cookie, item.url);
    }
  },
  fetchDataUrl: async (url) => self.$scramjet.BareResponse.fromNativeResponse(await fetch(url)),
  fetchBlobUrl: async (url) => self.$scramjet.BareResponse.fromNativeResponse(await fetch(url)),
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(self.__scramjetV2.prefix)) {
    return;
  }

  event.respondWith(handleScramjetFetch(event));
});

async function handleScramjetFetch(event) {
  try {
    const request = event.request;
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    const isDocumentNavigation = request.mode === "navigate" && request.destination === "document";
    const isDirectTopLevelNavigation = isDocumentNavigation && !event.clientId;

    if (isDirectTopLevelNavigation) {
      return Response.redirect(new URL("/site.html", self.location.origin), 302);
    }

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const response = await scramjetHandler.handleFetch({
      rawUrl: new URL(request.url),
      rawReferrer: request.referrer || null,
      rawDestination: request.destination,
      mode: request.mode,
      referrer: request.referrer,
      method: request.method,
      body: hasBody ? await request.clone().arrayBuffer() : null,
      cache: request.cache,
      initialHeaders: self.$scramjet.ScramjetHeaders.fromNativeHeaders(request.headers),
      rawClientUrl: client?.url ? new URL(client.url) : undefined,
      clientId: event.clientId || "scramjet-window",
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers.toNativeHeaders(),
    });
  } catch (error) {
    console.error("[scramjet-sw-v2] Fetch failed", {
      message: error?.message || String(error),
      url: event.request.url,
      destination: event.request.destination,
      stack: error?.stack,
    });
    const message = error?.stack || error?.message || String(error) || "Unknown Scramjet v2 error.";
    return new Response(`Scramjet v2 failed to load this page.\n\n${message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
