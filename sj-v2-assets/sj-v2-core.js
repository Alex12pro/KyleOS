(function () {
  const BARE_BASE = "/api/bare/";
  const PREFIX = "/sj/";

  function toHeaderObject(headers) {
    if (!headers) return {};
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
    }
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    return { ...headers };
  }

  function toHeaderEntries(headers) {
    if (!headers) return [];
    if (Array.isArray(headers)) return headers;
    return Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]);
  }

  function splitBareHeaders(headers) {
    const MAX_HEADER_VALUE = 3072;
    const value = headers.get("x-bare-headers");
    if (!value || value.length <= MAX_HEADER_VALUE) return headers;

    headers.delete("x-bare-headers");
    for (let index = 0; index < value.length; index += MAX_HEADER_VALUE) {
      headers.set(`x-bare-headers-${index / MAX_HEADER_VALUE}`, `;${value.slice(index, index + MAX_HEADER_VALUE)}`);
    }
    return headers;
  }

  function joinBareHeaders(headers) {
    const output = new Headers(headers);
    const parts = [];

    for (const [key, value] of headers.entries()) {
      if (!key.startsWith("x-bare-headers-")) continue;
      if (!value.startsWith(";")) continue;
      parts[Number(key.slice("x-bare-headers-".length))] = value.slice(1);
      output.delete(key);
    }

    if (parts.length) output.set("x-bare-headers", parts.join(""));
    return output;
  }

  class BareV3Transport {
    constructor(base = BARE_BASE) {
      this.base = new URL(base, location.origin);
      this.http = new URL("./v3/", this.base);
      this.ws = new URL(this.http);
      this.ws.protocol = this.ws.protocol === "https:" ? "wss:" : "ws:";
      this.ready = true;
    }

    async init() {
      this.ready = true;
    }

    request(remote, method, body, headers, signal) {
      const bareHeaders = toHeaderObject(headers);
      bareHeaders.Host = remote.host;

      const requestHeaders = splitBareHeaders(new Headers({
        "x-bare-url": remote.href,
        "x-bare-headers": JSON.stringify(bareHeaders),
      }));

      return fetch(`${this.http}?cache=${encodeURIComponent(remote.href)}`, {
        method,
        body,
        headers: requestHeaders,
        credentials: "omit",
        signal,
      }).then(async (response) => {
        if (!response.ok) {
          let message = `Bare server returned ${response.status}`;
          try {
            const error = await response.json();
            message = error.message || error.code || message;
          } catch {
            // The response may not be JSON.
          }
          throw new Error(message);
        }

        const responseHeaders = joinBareHeaders(response.headers);
        return {
          body: response.body,
          headers: toHeaderEntries(JSON.parse(responseHeaders.get("x-bare-headers") || "[]")),
          status: Number(responseHeaders.get("x-bare-status") || response.status),
          statusText: responseHeaders.get("x-bare-status-text") || response.statusText,
        };
      });
    }

    connect(remote, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
      const socket = new WebSocket(this.ws);
      const headers = toHeaderObject(requestHeaders);
      headers.Host = remote.host;
      headers.Upgrade = "websocket";
      headers.Connection = "Upgrade";

      const cleanup = () => {
        socket.removeEventListener("message", firstMessage);
        socket.removeEventListener("close", firstClose);
      };
      const firstMessage = (event) => {
        cleanup();
        try {
          const message = JSON.parse(event.data);
          if (message.type !== "open") throw new Error("Bare socket did not open.");
          onopen(message.protocol || "", message.extensions || "");
        } catch (error) {
          onerror(error.message || "Bare socket failed.");
          return;
        }

        socket.addEventListener("message", (socketEvent) => onmessage(socketEvent.data));
        socket.addEventListener("close", (socketEvent) => onclose(socketEvent.code, socketEvent.reason));
        socket.addEventListener("error", () => onerror("Bare socket failed."));
      };
      const firstClose = (event) => {
        cleanup();
        onclose(event.code, event.reason);
      };

      socket.addEventListener("message", firstMessage);
      socket.addEventListener("close", firstClose);
      socket.addEventListener("error", () => onerror("Bare socket failed."));
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          type: "connect",
          remote: remote.href,
          protocols,
          headers,
          forwardHeaders: [],
        }));
      }, { once: true });

      return [socket.send.bind(socket), socket.close.bind(socket)];
    }
  }

  function createConfig() {
    const scramjet = self.$scramjet;
    return {
      ...scramjet.defaultConfig,
      flags: {
        ...scramjet.defaultConfig.flags,
        captureErrors: true,
        cleanErrors: true,
        allowFailedIntercepts: true,
      },
      siteFlags: {},
    };
  }

  function createContext() {
    const scramjet = self.$scramjet;
    return {
      config: createConfig(),
      prefix: new URL(PREFIX, location.origin),
      cookieJar: new scramjet.CookieJar(),
      interface: {
        codecEncode: encodeURIComponent,
        codecDecode: decodeURIComponent,
        getInjectScripts(_meta, _handler, _htmlContext, script) {
          return [
            script("/sj-v2-assets/scramjet_bundled.js"),
            script("/sj-v2-assets/sj-v2-core.js"),
            script("/sj-v2-assets/sj-v2-client.js"),
          ];
        },
        getWorkerInjectScripts(_meta, _isModule, script) {
          return [
            script("/sj-v2-assets/scramjet_bundled.js"),
            script("/sj-v2-assets/sj-v2-core.js"),
            script("/sj-v2-assets/sj-v2-client.js"),
          ].join("\n");
        },
      },
    };
  }

  function rewriteTopUrl(url) {
    const scramjet = self.$scramjet;
    const context = createContext();
    const parsed = new URL(url);
    return scramjet.rewriteUrl(parsed, context, { origin: parsed, base: parsed }, { isIframe: true });
  }

  self.__scramjetV2 = {
    prefix: PREFIX,
    createContext,
    createTransport: (base) => new BareV3Transport(base),
    rewriteTopUrl,
    version: () => self.$scramjet?.versionInfo?.version || "2",
  };
})();
