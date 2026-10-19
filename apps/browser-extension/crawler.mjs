const MAX_PAGES = 50;
const MAX_DEPTH = 3;
const MAX_PAGE_BYTES = 800_000;
const MAX_PAGE_CHARS = 6_000;
const MAX_HANDOFF_CHARS = 12_000;
const BLOCKED_PATH =
  /(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|unsubscribe|checkout|purchase|submit|execute)(?:\/|$)/i;
const BLOCKED_QUERY =
  /^(?:action|cmd|command|delete|do|execute|intent|logout|remove|submit|unsubscribe)$/i;
const SKIP_EXTENSION =
  /\.(?:7z|avi|bmp|css|csv|docx?|eot|exe|gif|gz|ico|jpe?g|js|json|m4a|m4v|map|mov|mp[34]|otf|pdf|png|pptx?|rar|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i;

export function normalizePageUrl(raw, origin) {
  try {
    const url = new URL(raw, origin);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    if ([...url.searchParams.keys()].some((key) => BLOCKED_QUERY.test(key)))
      return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key))
        url.searchParams.delete(key);
    }
    if (BLOCKED_PATH.test(url.pathname) || SKIP_EXTENSION.test(url.pathname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseRobots(text) {
  const groups = [];
  let group = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], hasRules: false };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && group && value) {
      group.rules.push({ type: key, value });
      group.hasRules = true;
    }
  }
  return groups
    .filter((item) => item.agents.includes("*"))
    .flatMap((item) => item.rules);
}

export function robotsAllows(urlValue, rules) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  const target = `${url.pathname}${url.search}`;
  let match = null;
  for (const rule of rules || []) {
    const anchored = rule.value.endsWith("$");
    const pattern = anchored ? rule.value.slice(0, -1) : rule.value;
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    let regex;
    try {
      regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
    } catch {
      continue;
    }
    if (!regex.test(target)) continue;
    if (
      !match ||
      rule.value.replace(/[\*$]/g, "").length > match.length ||
      (rule.value.replace(/[\*$]/g, "").length === match.length &&
        rule.type === "allow")
    ) {
      match = {
        type: rule.type,
        length: rule.value.replace(/[\*$]/g, "").length,
      };
    }
  }
  return !match || match.type === "allow";
}

async function readBounded(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes)
      throw new Error("Page exceeded the 800 KB scan limit.");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Page exceeded the 800 KB scan limit.");
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock?.();
  }
}

export function extractReadablePage(
  html,
  pageUrl,
  DOMParserImpl = globalThis.DOMParser,
) {
  if (!DOMParserImpl)
    throw new Error("This browser does not support safe page parsing.");
  const doc = new DOMParserImpl().parseFromString(html, "text/html");
  const title = (
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent ||
    new URL(pageUrl).hostname
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const robots =
    `${doc.querySelector('meta[name="robots"]')?.content || ""} ${doc.querySelector('meta[name="googlebot"]')?.content || ""}`.toLowerCase();
  for (const node of doc.querySelectorAll(
    "script,style,noscript,template,svg,canvas,iframe,form,nav,footer,header,aside,[hidden],[aria-hidden='true'],[role='navigation'],[role='banner'],[role='contentinfo']",
  ))
    node.remove();
  const main = doc.querySelector("main,article,[role='main']") || doc.body;
  const text = (main?.textContent || "")
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_PAGE_CHARS);
  const links = robots.includes("nofollow")
    ? []
    : [...(main?.querySelectorAll("a[href]") || [])]
        .map((anchor) => anchor.href)
        .filter(Boolean);
  return {
    title,
    text,
    links,
    noindex: /(?:^|[,\s])noindex(?:$|[,\s])/.test(robots),
    nofollow: /(?:^|[,\s])nofollow(?:$|[,\s])/.test(robots),
  };
}

async function fetchHtml(url, origin, signal) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = new URL(response.url || url);
  if (finalUrl.origin !== origin)
    throw new Error("Redirect left the approved site; page skipped.");
  const type = response.headers.get("content-type") || "";
  if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(type))
    throw new Error("Not an HTML page.");
  return readBounded(response, MAX_PAGE_BYTES);
}

async function readRobots(origin, signal) {
  try {
    const response = await fetch(new URL("/robots.txt", origin), {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
    });
    if (!response.ok) {
      if ([404, 410].includes(response.status))
        return { rules: [], status: "not-found" };
      return { rules: [{ type: "disallow", value: "/" }], status: "blocked" };
    }
    return {
      rules: parseRobots(
        (await readBounded(response, 64_000)).slice(0, 64_000),
      ),
      status: "checked",
    };
  } catch {
    throw new Error(
      "Could not check this site's robots.txt, so no pages were scanned. Try again when it is reachable.",
    );
  }
}

export async function crawlSite(startUrl, options = {}) {
  const start = new URL(startUrl);
  if (!/^https?:$/.test(start.protocol) || start.username || start.password)
    throw new Error("Only regular HTTP/HTTPS pages can be scanned.");
  const origin = start.origin;
  const maxPages = Math.max(
    1,
    Math.min(MAX_PAGES, Number(options.maxPages) || 10),
  );
  const maxDepth = Math.max(
    0,
    Math.min(MAX_DEPTH, Number(options.maxDepth ?? 2)),
  );
  const signal = options.signal || new AbortController().signal;
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : () => {};
  const startPage = normalizePageUrl(start.href, origin);
  if (!startPage) throw new Error("This page URL cannot be scanned.");
  const robots = await readRobots(origin, signal);
  const queue = [{ url: startPage, depth: 0 }];
  const queued = new Set([startPage]);
  const visited = new Set();
  const pages = [];
  const errors = [];
  let inFlight = 0;
  const workers = Array.from({ length: Math.min(3, maxPages) }, async () => {
    while (!signal.aborted) {
      if (visited.size >= maxPages) return;
      const item = queue.shift();
      if (!item) {
        if (inFlight === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 35));
        continue;
      }
      visited.add(item.url);
      if (!robotsAllows(item.url, robots.rules)) {
        errors.push({ url: item.url, reason: "Excluded by robots.txt" });
        onProgress({
          visited: visited.size,
          found: pages.length,
          queued: queue.length,
          current: "Skipping disallowed path",
        });
        continue;
      }
      inFlight++;
      onProgress({
        visited: visited.size,
        found: pages.length,
        queued: queue.length,
        current: item.url,
      });
      try {
        const html = await fetchHtml(item.url, origin, signal);
        const page = extractReadablePage(
          html,
          item.url,
          options.DOMParserImpl || globalThis.DOMParser,
        );
        if (page.noindex) {
          errors.push({
            url: item.url,
            reason: "Excluded by page noindex directive",
          });
        } else {
          pages.push({
            title: page.title,
            url: item.url,
            text: page.text,
            depth: item.depth,
          });
          if (!page.nofollow && item.depth < maxDepth) {
            for (const raw of page.links) {
              const next = normalizePageUrl(raw, origin);
              if (next && !queued.has(next) && queued.size < maxPages * 12) {
                queued.add(next);
                queue.push({ url: next, depth: item.depth + 1 });
              }
            }
          }
        }
      } catch (error) {
        if (!signal.aborted)
          errors.push({
            url: item.url,
            reason: String(error?.message || "Fetch failed").slice(0, 180),
          });
      } finally {
        inFlight--;
        onProgress({
          visited: visited.size,
          found: pages.length,
          queued: queue.length,
          current: pages.at(-1)?.title || "",
        });
      }
    }
  });
  await Promise.all(workers);
  return {
    origin,
    startUrl: startPage,
    pages: pages.slice(0, maxPages),
    errors: errors.slice(0, 50),
    visited: visited.size,
    robotsStatus: robots.status,
    cancelled: signal.aborted,
  };
}

export function toHermesContext(result) {
  const pages = result.pages || [];
  const lines = [
    `USER-INITIATED SAME-ORIGIN WEBSITE SCAN`,
    `Start URL: ${result.startUrl}`,
    `Pages read: ${pages.length}; attempted: ${result.visited}; robots.txt: ${result.robotsStatus}.`,
    `Only readable page text was collected. This excerpt is attached only because the user chose to include it in the next Hermes request.`,
  ];
  let total = lines.join("\n").length;
  for (const page of pages) {
    const chunk = `\n\n## ${page.title}\nURL: ${page.url}\n${page.text}`;
    const remaining = MAX_HANDOFF_CHARS - total;
    if (remaining <= 0) break;
    const accepted = chunk.slice(0, remaining);
    lines.push(accepted);
    total += accepted.length;
  }
  return {
    title: `Site page scan · ${pages.length} pages`,
    url: result.startUrl,
    selectedText: lines.join("").slice(0, MAX_HANDOFF_CHARS),
    pageCount: pages.length,
    robotsStatus: result.robotsStatus,
  };
}
