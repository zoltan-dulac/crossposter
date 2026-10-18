# Mastodon destination — Phase 1 (experimental)

This fork adds Mastodon as a **destination** to Crossposter v0.3.8, using the
native Mastodon web composer. It deliberately **does not publish** the post.
The user reviews it and clicks Post. No Mastodon OAuth client or API token is
required.

## Test in Firefox

1. Use Firefox 153+ (the original extension's minimum). Open `about:debugging`.
2. Choose **This Firefox** → **Load Temporary Add-on**.
3. In the **unpacked Firefox test build**, select `manifest.json`. Or select
   the temporary `.xpi` file when using that package format.
4. Open Crossposter → its composer → **Settings**. Enable Mastodon (it is
   enabled initially as a new destination) and enter your instance domain,
   e.g., `mastodon.social` or `https://example.social`. Save. Grant access
   **only to that instance** when Firefox asks. If you prefer, set a different
   server here at any time.
5. Sign in to that instance in Firefox, using its standard Mastodon web UI.
6. Write a new Crossposter draft or capture a post from another supported
   network. Check **Mastodon** as a destination and click **Continue**.
7. Mastodon opens in its own tab. Confirm the text (and any attached images
   or video), visibility, content warning, media alternative text, and server
   length/media limits before manually clicking **Post**.

To test an existing post without publishing it, make a draft and only inspect
Mastodon's filled composer. Crossposter never clicks Post for you.

## Scope

- HTTPS server domain configured per user; defaults to `mastodon.social`.
- Requests a site permission for the exact chosen server; the manifest
  declares `https://*/*` as *optional* so an arbitrary federated instance can
  be selected at runtime. This does not grant access to all websites.
- Prepares text (including URLs/hashtags) and uses Crossposter's standard
  image/video handoff into Mastodon's existing hidden file input.
- Does not crosspost **from** Mastodon or use Mastodon's API.
- **Not live-tested against a signed-in instance.** Selectors were checked
  against the upstream Mastodon compose form and upload-button source.
- Mastodon forks/custom frontend skins may need different selectors.
- Server media/character limits differ. Crossposter does not determine them.
- Alt text from captured images is **not** transferred to Mastodon by the
  existing Crossposter media pipeline. Add it manually before posting.
- The normal upstream `npm run build -- firefox` downloads ffmpeg.wasm to
  `src/vendor/ffmpeg`. If offline, the lightweight test build omits these
  assets. It can prepare text and ordinary images, but video conversion,
  HLS imports, and the video editor require a full build with FFmpeg assets.

## Build from patched source (online)

```sh
npm run build -- firefox
```

The unpacked extension will be in `dist/firefox/`. Or run `npm run package`
for zipped Chrome/Firefox builds. To run the included unit tests:

```sh
node --test test/mastodon.test.mjs
```

## Architecture

- `src/shared/mastodon.js`: validates instance origin; builds origin pattern.
- `src/shared/destinations.js`: destination tile.
- `src/shared/content-scripts.js`: runtime registration for user-selected host.
- `src/shared/platform-permissions.js`: one gesture-bound permission request,
  with Mastodon added as an extra exact-origin request.
- `src/compose.html` and `.js`: instance Settings UI and saved preference.
- `src/background.js`: route handoffs and retries to `/home` on the instance.
- `src/platforms/mastodon/content.js`: standard Mastodon composer adapter.
- `src/manifest.*.json`: optional wildcard HTTPS declaration, test build ID.
