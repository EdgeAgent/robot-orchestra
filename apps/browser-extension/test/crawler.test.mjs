import test from "node:test";
import assert from "node:assert/strict";
import {
  crawlSite,
  normalizePageUrl,
  parseRobots,
  robotsAllows,
  toHermesContext,
} from "../crawler.mjs";

class TestDOMParser {
  parseFromString(html) {
    const title =
      html
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]+>/g, "") || "";
    const anchors = [
      ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ].map((match) => ({
      href: match[1],
      textContent: match[2].replace(/<[^>]+>/g, ""),
    }));
    const body = {
      textContent: html
        .replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
      querySelectorAll(selector) {
        return selector === "a[href]" ? anchors : [];
      },
    };
    return {
      body,
      querySelector(selector) {
        if (selector === "title") return title ? { textContent: title } : null;
        if (selector === "h1") return null;
        if (selector.startsWith("meta")) return null;
        if (selector === "main,article,[role='main']") return body;
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
  }
}

test("URL normalization is same-origin, strips fragments/tracking and skips action/download paths", () => {
  assert.equal(
    normalizePageUrl(
      "/article?utm_source=mail&id=2#section",
      "https://docs.example",
    ),
    "https://docs.example/article?id=2",
  );
  assert.equal(
    normalizePageUrl("https://other.example/page", "https://docs.example"),
    null,
  );
  assert.equal(
    normalizePageUrl("javascript:alert(1)", "https://docs.example"),
    null,
  );
  assert.equal(
    normalizePageUrl("/logout", "https://docs.example"),
    null,
  );
  assert.equal(
    normalizePageUrl("/account?action=delete", "https://docs.example"),
    null,
  );
  assert.equal(normalizePageUrl("/manual.pdf", "https://docs.example"), null);
});

test("robots matching respects disallow rules and the longest allow override", () => {
  const rules = parseRobots(
    "User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /admin$",
  );
  assert.equal(robotsAllows("https://docs.example/public", rules), true);
  assert.equal(
    robotsAllows("https://docs.example/private/draft", rules),
    false,
  );
  assert.equal(
    robotsAllows("https://docs.example/private/public/guide", rules),
    true,
  );
  assert.equal(robotsAllows("https://docs.example/admin", rules), false);
  assert.equal(robotsAllows("https://docs.example/administrator", rules), true);
});

test("crawl stays on one origin, respects robots and max pages, and produces a bounded explicit handoff", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, method: init.method, credentials: init.credentials, redirect: init.redirect });
    if (url.endsWith("/robots.txt"))
      return new Response("User-agent: *\nDisallow: /private", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    const path = new URL(url).pathname;
    const pages = {
      "/": '<html><head><title>Home</title></head><body><main>Home overview <a href="/guide">Guide</a><a href="/private/draft">Private</a><a href="https://outside.example/">Outside</a><a href="/logout">Logout</a></main></body></html>',
      "/guide":
        '<html><head><title>Guide</title></head><body><main>Useful guide content <a href="/detail">Details</a></main></body></html>',
      "/detail":
        "<html><head><title>Details</title></head><body><main>More information.</main></body></html>",
    };
    return new Response(pages[path] || "Missing", {
      status: pages[path] ? 200 : 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  try {
    const result = await crawlSite("https://docs.example/", {
      maxPages: 2,
      maxDepth: 3,
      DOMParserImpl: TestDOMParser,
    });
    assert.equal(result.origin, "https://docs.example");
    assert.deepEqual(
      result.pages.map((page) => page.url),
      ["https://docs.example/", "https://docs.example/guide"],
    );
    assert.equal(result.robotsStatus, "checked");
    const pageRequests = requests.filter(
      (request) => !request.url.endsWith("/robots.txt"),
    );
    const policyRequest = requests.find((request) =>
      request.url.endsWith("/robots.txt"),
    );
    assert.ok(pageRequests.length > 0);
    assert.ok(
      pageRequests.every(
        (request) =>
          request.method === "GET" && request.credentials === "include" && request.redirect === "error",
      ),
    );
    assert.equal(policyRequest.method, "GET");
    assert.equal(policyRequest.credentials, "omit");
    assert.ok(
      requests.every(
        (request) => new URL(request.url).origin === "https://docs.example",
      ),
    );
    const handoff = toHermesContext(result);
    assert.ok(handoff.selectedText.length <= 12_000);
    assert.match(
      handoff.selectedText,
      /USER-INITIATED SAME-ORIGIN WEBSITE SCAN/,
    );
    assert.match(handoff.selectedText, /Useful guide content/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
