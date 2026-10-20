const SHORTENER = /^https?:\/\/lnkd\.in\/([A-Za-z0-9_-]+)/;
const SHORT_LINKS = /https?:\/\/lnkd\.in\/[A-Za-z0-9_-]+/g;
// The one external link on LinkedIn's "This link will take you to a page
// that's not on LinkedIn" page: safety/go's (in_page_external_link_click), and
// lnkd.in's own (external_url_click). Matched by tracking name, never by text.
const DESTINATION_LINK = /<a\s[^>]*data-tracking-control-name="(?:in_page_external_link_click|external_url_click)"[^>]*>/i;
const MAX_LOOKUPS = 8;

export function shortLinkKey(url = "") {
  const match = String(url).match(SHORTENER);
  return match ? `https://lnkd.in/${match[1]}` : "";
}

export function isShortLink(url = "") {
  return SHORTENER.test(String(url));
}

const decodeEntities = value => value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt));/gi, (_, dec, hex, name) => {
  if (dec) return String.fromCodePoint(Number(dec));
  if (hex) return String.fromCodePoint(parseInt(hex, 16));
  return { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">" }[name.toLowerCase()];
});

// The target URL on LinkedIn's leaving-LinkedIn page, or "" when the page
// holds none (an expired or unknown code).
export function parseDestination(html = "") {
  const tag = String(html).match(DESTINATION_LINK)?.[0] || "";
  const href = decodeEntities(tag.match(/\shref="([^"]*)"/i)?.[1] || "").trim();
  let url;
  try { url = new URL(href); } catch { return ""; }
  if (!/^https?:$/.test(url.protocol) || isShortLink(href) || /(?:^|\.)linkedin\.com$/i.test(url.hostname)) return "";
  return href;
}

async function fetchDestination(shortUrl, fetcher, timeoutMs) {
  try {
    // lnkd.in serves the same page, but only www.linkedin.com is a host
    // permission. The unsigned safety/go link shows the page rather than
    // redirecting (a redirect's target can't be read here).
    const url = `https://www.linkedin.com/safety/go/?url=${encodeURIComponent(shortUrl)}`;
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
    const response = await fetcher(url, { credentials: "omit", signal });
    return response?.ok ? parseDestination(await response.text()) : "";
  } catch {
    return "";
  }
}

// Resolves the lnkd.in links LinkedIn writes into a post's text (it shortens
// every inline link) through LinkedIn's own leaving-LinkedIn page, so the
// draft carries the real destinations. A link that doesn't resolve keeps its
// lnkd.in URL, which still leads there through LinkedIn's interstitial.
export async function expandLinkedInLinks(captured = {}, fetcher = fetch, { timeoutMs = 4000 } = {}) {
  const links = Array.isArray(captured.links) ? captured.links : [];
  const text = String(captured.text || "");
  const keys = [...new Set([...(text.match(SHORT_LINKS) || []), ...links.map(link => link?.url)].map(shortLinkKey).filter(Boolean))].slice(0, MAX_LOOKUPS);
  if (!keys.length) return captured;
  const map = new Map();
  await Promise.all(keys.map(async key => {
    const target = await fetchDestination(key, fetcher, timeoutMs);
    if (target) map.set(key, target);
  }));
  if (!map.size) return captured;
  return {
    ...captured,
    text: text.replace(SHORT_LINKS, match => map.get(shortLinkKey(match)) || match),
    links: links.map(link => {
      const expanded = map.get(shortLinkKey(link?.url));
      return expanded ? { ...link, url: expanded } : link;
    })
  };
}
