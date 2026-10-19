# Bluesky image-alt-text editor fix — October 2026

This is a **Bluesky-only** update for Crossposter forks already using the experimental native alt-text transfer from the previous update. Only `src/alt-text-handoff.js` is changed. It does not modify media capture, Mastodon, X, Instagram, or other destination adapters.

## Install

Commit your current changes first. Extract this ZIP into the **root of the Crossposter repository**, so `bluesky-alt-fix/` is next to `package.json`. Then run:

```sh
git apply --check bluesky-alt-fix/bluesky-alt-fix.patch
git apply bluesky-alt-fix/bluesky-alt-fix.patch
node --test bluesky-alt-fix/tests/test-bluesky-alt.mjs
npm run build -- firefox
```

Reload the temporary extension at Firefox `about:debugging` → **This Firefox** → **Reload**, and refresh any open Bluesky tabs. There is no need to run `npm run package`.

If `git apply --check` fails because the fork has changed, **do not apply with --reject or --3way blindly**: compare `bluesky-alt-fix/alt-text-handoff.js` with your `src/alt-text-handoff.js` and integrate only the `blueskyAltText()` / `closeBlueskyAltDialog()` additions and the three routing/memoization changes.

If you retained the generic test file `auto-alt/tests/test-auto-alt.mjs` unchanged from the previous ZIP, the older test fixtures assume Bluesky uses an inline or generic editor. Those assumptions are now obsolete. Update those two fixtures to target Mastodon and X instead with this optional patch:

```sh
git apply --check bluesky-alt-fix/legacy-tests-update.patch
git apply bluesky-alt-fix/legacy-tests-update.patch
node --test auto-alt/tests/test-auto-alt.mjs
```

## What changed

1. Waits up to 30 seconds for the correct number of visible image-thumbnail buttons (`aria-label="Add alt text"` or `"Edit alt text"`) after the image upload.
2. For each image with a nonempty source description, clicks that thumbnail's button and waits for its newly opened dialog's `textarea[aria-label="Alt text"]`.
3. Uses Crossposter's native textarea setter and events to populate the field. Waits for the `button[aria-label="Save"]` in that **same dialog** to become enabled (including if it has `type="submit"`), then clicks Save.
4. Waits for the dialog to close before processing the next image. Does not overwrite a different description already present.
5. Does not mark a Bluesky transfer complete when it times out or only partially succeeds, allowing retry. Reports a review warning rather than claiming success.
6. **Never clicks the main Post button.** Other destination code paths are unchanged.

## Test in Firefox

Crosspost an image with authored source alt text to Bluesky; after the native composer loads, confirm the image appears, the small alt editor opens, the textarea is populated, and Save is clicked. Open the same image's alt editor to verify that the description really persisted **before you publish**. Then test a two-image post. The post remains unpublished until you click Post manually.

The five included Node fixture tests cover delayed upload appearance, asynchronous Save enablement, two-image mapping, manual destination descriptions, and failure when Save stays disabled. They are **synthetic tests**; a live signed-in Bluesky browser test is still required. English accessible names are assumed. Bluesky may change the interface, and thumbnail ordering is inferred from DOM order when multiple images are present.

Source reference for this native control flow: Bluesky's `ImageAltTextDialog` in `bluesky-social/social-app` (it labels the input `Alt text` and the button `Save`).
