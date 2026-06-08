import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const hiddenProxyPath = "/api/v1/data";
const tokenKey = createHash("sha256")
  .update(process.env.KYLEOS_PROXY_SECRET || "kyleos-hidden-proxy-v1")
  .digest();

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/i,
];

function isBlockedHost(hostname) {
  return privateHostPatterns.some((pattern) => pattern.test(hostname));
}

function rewriteUrl(value, baseUrl) {
  if (!value || value.startsWith("#") || /^(data|mailto|tel|javascript):/i.test(value)) {
    return value;
  }

  try {
    const absolute = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(absolute.protocol)) {
      return value;
    }

    return proxiedUrl(absolute.href);
  } catch {
    return value;
  }
}

function rememberProxyTarget(url) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey, iv);
  const ciphertext = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function lookupProxyTarget(token) {
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length <= 28) return "";

    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const ciphertext = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", tokenKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function proxiedUrl(url) {
  return `${hiddenProxyPath}?_token=${encodeURIComponent(rememberProxyTarget(url))}`;
}

function searchResult({ title, url, description }) {
  return `
    <a class="result" href="#" data-proxy-url="${escapeHtml(proxiedUrl(url))}">
      <span>Web result</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </a>
  `;
}

function extractSearchTarget(href) {
  const decodedHref = decodeHtml(href);
  const linkUrl = new URL(decodedHref, "https://duckduckgo.com");
  return linkUrl.searchParams.get("uddg") || linkUrl.href;
}

async function fetchSearchResults(query) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const upstream = await fetchUpstream(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 KyleOS/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!upstream.ok) {
    return [];
  }

  const html = await upstream.text();
  const blocks = html.match(/<div class="result results_links[\s\S]*?(?=<div class="result results_links|<\/body>)/g) || [];

  return blocks
    .map((block) => {
      const titleMatch = block.match(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) return null;

      let url;
      try {
        url = extractSearchTarget(titleMatch[1]);
      } catch {
        return null;
      }

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      const visibleUrlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)<\/a>/i);
      const title = stripTags(titleMatch[2]);
      const visibleUrl = visibleUrlMatch ? stripTags(visibleUrlMatch[1]) : "";
      const description = stripTags(snippetMatch?.[1] || snippetMatch?.[2] || visibleUrl || url);

      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
          return null;
        }
      } catch {
        return null;
      }

      return { title, url, description };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function fallbackResults(query) {
  return [
    {
      title: `Wikipedia search for ${query}`,
      url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`,
      description: "Find encyclopedia articles related to this search.",
    },
    {
      title: `DuckDuckGo search for ${query}`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      description: "Open web results through the Kyle OS proxy.",
    },
    {
      title: `YouTube search for ${query}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      description: "Search videos through the Kyle OS proxy.",
    },
  ];
}

function renderSearchPage(query, results) {
  const resultItems = results.length ? results : fallbackResults(query);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Search ${escapeHtml(query)}</title>
  <style>
    :root { color-scheme: dark; --bg: #070b13; --panel: #101827; --line: rgba(125,211,252,.22); --text: #f6fbff; --muted: #9fb1c4; --accent: #53d8ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 20% 10%, rgba(83,216,255,.18), transparent 28%), linear-gradient(145deg, #05070d, #091423 60%, #03050a); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(860px, calc(100% - 28px)); margin: 0 auto; padding: 28px 0 40px; }
    header { display: grid; gap: 8px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 2.6rem); line-height: 1; }
    h1 span { color: var(--accent); }
    header p { margin: 0; color: var(--muted); }
    .search-box { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin: 16px 0 18px; }
    input { min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: rgba(1,5,12,.72); color: var(--text); font: inherit; padding: 0 12px; outline: none; }
    button { min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: rgba(83,216,255,.12); color: var(--text); cursor: pointer; font: inherit; font-weight: 850; padding: 0 16px; }
    input:focus, button:hover, button:focus-visible { border-color: var(--accent); outline: none; }
    .results { display: grid; gap: 10px; }
    .result { display: grid; gap: 6px; border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg, rgba(16, 24, 39, .94), rgba(5, 9, 16, .9)); color: var(--text); padding: 14px; text-decoration: none; }
    .result:hover, .result:focus-visible { border-color: var(--accent); outline: none; }
    .result span { color: var(--accent); font-size: .78rem; font-weight: 800; }
    .result strong { font-size: 1.02rem; }
    .result p { margin: 0; color: var(--muted); line-height: 1.4; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Search <span>${escapeHtml(query)}</span></h1>
      <p>Results open through Kyle OS so you stay inside this browser window.</p>
    </header>
    <form class="search-box" action="${hiddenProxyPath}" method="get">
      <input name="search" value="${escapeHtml(query)}" autocomplete="off" autofocus>
      <button type="submit">Search</button>
    </form>
    <section class="results">
      ${resultItems.map(searchResult).join("")}
    </section>
  </main>
  <script>
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-proxy-url]");
      if (!link) return;
      event.preventDefault();
      location.href = link.dataset.proxyUrl;
    });
  </script>
</body>
</html>`;
}

function rewriteHtml(html, targetUrl) {
  let output = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");

  output = output.replace(/\s(target)=["'][^"']*["']/gi, "");

  output = output.replace(
    /<a\b([^>]*?)\shref=["']([^"']+)["']([^>]*)>/gi,
    (match, before, value, after) => {
      const rewritten = rewriteUrl(value, targetUrl);
      if (!rewritten || rewritten === value) {
        return match;
      }

      return `<a${before} href="#" data-proxy-url="${escapeHtml(rewritten)}"${after}>`;
    }
  );

  output = output.replace(
    /\s(href|src|action)=["']([^"']+)["']/gi,
    (match, attribute, value) => ` ${attribute}="${rewriteUrl(value, targetUrl)}"`
  );

  output = output.replace(
    /\ssrcset=["']([^"']+)["']/gi,
    (match, value) => {
      const rewritten = value
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          parts[0] = rewriteUrl(parts[0], targetUrl);
          return parts.join(" ");
        })
        .join(", ");

      return ` srcset="${rewritten}"`;
    }
  );

  const keepInsideScript = `<script>
(() => {
  const openProxied = (url) => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "${hiddenProxyPath}";
    form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "url";
    input.value = new URL(url, location.href).href;
    form.append(input);
    document.body.append(form);
    form.submit();
  };
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const proxyUrl = link.dataset.proxyUrl;
    if (proxyUrl) {
      event.preventDefault();
      location.href = proxyUrl;
      return;
    }
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("data:") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    event.preventDefault();
    if (href.startsWith("${hiddenProxyPath}?") || href.startsWith("/api/proxy?")) {
      location.href = href;
      return;
    }
    openProxied(href);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action") || location.href;
    const method = (form.getAttribute("method") || "get").toLowerCase();
    if (method !== "get") return;
    event.preventDefault();
    const url = new URL(action, location.href);
    new FormData(form).forEach((value, key) => url.searchParams.set(key, value));
    openProxied(url.href);
  });
})();
</script>`;

  const base = `<base target="_self">`;
  const withBase = output.includes("<head")
    ? output.replace(/<head([^>]*)>/i, `<head$1>${base}`)
    : `${base}${output}`;

  return withBase.includes("</body>")
    ? withBase.replace(/<\/body>/i, `${keepInsideScript}</body>`)
    : `${withBase}${keepInsideScript}`;
}

function rewriteCss(css, targetUrl) {
  return css.replace(
    /url\((["']?)([^"')]+)\1\)/gi,
    (match, quote, value) => `url("${rewriteUrl(value, targetUrl)}")`
  );
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readPostedUrl(request) {
  const body = await readRequestBody(request);
  const contentType = request.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body).url || "";
    } catch {
      return "";
    }
  }

  return new URLSearchParams(body).get("url") || "";
}

function validateProxyUrl(rawUrl) {
  try {
    const targetUrl = new URL(rawUrl);
    if (!["http:", "https:"].includes(targetUrl.protocol) || isBlockedHost(targetUrl.hostname)) {
      return null;
    }

    return targetUrl;
  } catch {
    return null;
  }
}

function headerBag(headers) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    get(name) {
      return normalized.get(name.toLowerCase()) || null;
    },
  };
}

function parseCurlHeaders(rawHeaders) {
  const blocks = rawHeaders
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\//i.test(block));

  const finalBlock = blocks.at(-1) || "";
  const lines = finalBlock.split(/\r?\n/).filter(Boolean);
  const status = Number(lines[0]?.match(/\s(\d{3})\s/)?.[1]) || 0;
  const headers = {};

  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!key || key === "transfer-encoding" || key === "content-length") continue;

    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }

  return { status, headers };
}

function runCurl(args) {
  return new Promise((resolve, reject) => {
    const curl = spawn(process.platform === "win32" ? "curl.exe" : "curl", args, {
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];

    curl.stdout.on("data", (chunk) => stdout.push(chunk));
    curl.stderr.on("data", (chunk) => stderr.push(chunk));
    curl.on("error", reject);
    curl.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
        return;
      }

      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `curl exited with ${code}`));
    });
  });
}

async function fetchWithCurl(targetUrl, options = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "kyleos-curl-"));
  const headerPath = path.join(tempDir, "headers.txt");
  const bodyPath = path.join(tempDir, "body.bin");
  const method = options.method || "GET";
  const headers = options.headers || {};

  try {
    const args = [
      "--location",
      "--silent",
      "--show-error",
      "--compressed",
      "--max-redirs",
      "10",
      "--connect-timeout",
      "10",
      "--max-time",
      "45",
      "--proto",
      "=http,https",
      "--proto-redir",
      "=http,https",
      "--dump-header",
      headerPath,
      "--output",
      bodyPath,
      "--write-out",
      "%{http_code}\n%{url_effective}",
      "--user-agent",
      headers["User-Agent"] || headers["user-agent"] || "KyleOS/1.0",
    ];

    if (method === "HEAD") {
      args.push("--head");
    }

    if (headers.Accept || headers.accept) {
      args.push("--header", `Accept: ${headers.Accept || headers.accept}`);
    }

    args.push(String(targetUrl));

    const curlInfo = await runCurl(args);
    const [statusLine, ...effectiveUrlParts] = curlInfo.split(/\r?\n/);
    const { status: headerStatus, headers: responseHeaders } = parseCurlHeaders(await readFile(headerPath, "utf8"));
    const body = method === "HEAD" ? Buffer.alloc(0) : await readFile(bodyPath);
    const status = Number(statusLine) || headerStatus || 502;

    return {
      status,
      ok: status >= 200 && status < 300,
      url: effectiveUrlParts.join("\n") || String(targetUrl),
      headers: headerBag(responseHeaders),
      async text() {
        return body.toString("utf8");
      },
      async arrayBuffer() {
        return body;
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchWithNode(targetUrl, options = {}) {
  return fetch(targetUrl, {
    ...options,
    redirect: "follow",
  });
}

async function fetchUpstream(targetUrl, options = {}) {
  if (process.env.KYLEOS_DISABLE_LIBCURL !== "1") {
    try {
      return await fetchWithCurl(targetUrl, options);
    } catch (error) {
      if (process.env.KYLEOS_PROXY_DEBUG === "1") {
        console.warn(`libcurl proxy request failed, falling back to fetch: ${error.message}`);
      }
    }
  }

  return fetchWithNode(targetUrl, options);
}

export async function handleProxyRequest(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (!["GET", "HEAD", "POST"].includes(request.method)) {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url, "http://localhost");
  const rawUrl = requestUrl.searchParams.get("url")
    || lookupProxyTarget(requestUrl.searchParams.get("_token") || requestUrl.searchParams.get("id") || "")
    || (request.method === "POST" ? await readPostedUrl(request) : "");
  const searchQuery = requestUrl.searchParams.get("search");

  if (request.method === "POST" && request.headers["x-kyleos-tokenize"] === "1") {
    const targetUrl = validateProxyUrl(rawUrl);
    if (!targetUrl) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Invalid url" }));
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ path: proxiedUrl(targetUrl.href) }));
    return;
  }

  if (searchQuery) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(renderSearchPage(searchQuery, await fetchSearchResults(searchQuery)));
    return;
  }

  if (!rawUrl) {
    response.statusCode = 400;
    response.end("Missing url");
    return;
  }

  const targetUrl = validateProxyUrl(rawUrl);
  if (!targetUrl) {
    response.statusCode = 400;
    response.end("Invalid url");
    return;
  }

  const upstream = await fetchUpstream(targetUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: {
      "User-Agent": "KyleOS/1.0",
      Accept: request.headers.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  response.statusCode = upstream.status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  if (contentType.includes("text/html")) {
    response.end(rewriteHtml(await upstream.text(), upstream.url || targetUrl.href));
    return;
  }

  if (contentType.includes("text/css")) {
    response.end(rewriteCss(await upstream.text(), upstream.url || targetUrl.href));
    return;
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  response.end(bytes);
}

export default async function handler(request, response) {
  try {
    await handleProxyRequest(request, response);
  } catch (error) {
    response.statusCode = 502;
    response.end(error.message || "Proxy error");
  }
}
