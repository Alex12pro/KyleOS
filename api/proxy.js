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
  if (!value || /^(data|mailto|tel|javascript):/i.test(value)) {
    return value;
  }

  try {
    const absolute = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(absolute.protocol)) {
      return value;
    }

    return `/api/proxy?url=${encodeURIComponent(absolute.href)}`;
  } catch {
    return value;
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
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function searchResult({ title, url, description }) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    hostname = url;
  }

  return `
    <a class="result" href="${proxiedUrl(url)}" data-target-url="${escapeHtml(url)}">
      <span>${escapeHtml(hostname)}</span>
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
  const upstream = await fetch(searchUrl, {
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
    <form class="search-box" action="/api/proxy" method="get">
      <input name="search" value="${escapeHtml(query)}" autocomplete="off" autofocus>
      <button type="submit">Search</button>
    </form>
    <section class="results">
      ${resultItems.map(searchResult).join("")}
    </section>
  </main>
</body>
</html>`;
}

function rewriteHtml(html, targetUrl) {
  let output = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");

  output = output.replace(/\s(target)=["'][^"']*["']/gi, "");

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
  const proxied = (url) => "/api/proxy?url=" + encodeURIComponent(new URL(url, location.href).href);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("data:") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    event.preventDefault();
    location.href = href.startsWith("/api/proxy?") ? href : proxied(href);
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
    location.href = proxied(url.href);
  });
})();
</script>`;

  const base = `<base href="${targetUrl}" target="_self">`;
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
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
}

export async function handleProxyRequest(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url, "http://localhost");
  const rawUrl = requestUrl.searchParams.get("url");
  const searchQuery = requestUrl.searchParams.get("search");

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

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    response.statusCode = 400;
    response.end("Invalid url");
    return;
  }

  if (!["http:", "https:"].includes(targetUrl.protocol) || isBlockedHost(targetUrl.hostname)) {
    response.statusCode = 400;
    response.end("Blocked url");
    return;
  }

  const upstream = await fetch(targetUrl, {
    headers: {
      "User-Agent": "KyleOS/1.0",
      Accept: request.headers.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
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
