// Instance-specific settings for the native Mastodon web composer.
// Never send a draft to an unvalidated or unencrypted server.
export const MASTODON_INSTANCE_KEY = "mastodonInstance";
export const DEFAULT_MASTODON_INSTANCE = "https://mastodon.social";

export function normalizeMastodonInstance(value) {
  const raw = String(value ?? "").trim();
  const input = raw || DEFAULT_MASTODON_INSTANCE;
  let parsed;
  try { parsed = new URL(input.includes("://") ? input : `https://${input}`); }
  catch { throw new Error("Enter a valid Mastodon server, such as mastodon.social."); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.port
      || !/^[a-z0-9.-]+$/i.test(parsed.hostname) || parsed.hostname.startsWith(".") || parsed.hostname.endsWith(".")
      || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Enter only the HTTPS address of your Mastodon server (for example, mastodon.social).");
  }
  return parsed.origin;
}

export function mastodonOriginPattern(instance = DEFAULT_MASTODON_INSTANCE) {
  return `${normalizeMastodonInstance(instance)}/*`;
}

export function mastodonHomeUrl(instance = DEFAULT_MASTODON_INSTANCE) {
  return `${normalizeMastodonInstance(instance)}/home`;
}
