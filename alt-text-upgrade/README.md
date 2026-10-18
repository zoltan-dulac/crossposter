# Crossposter — Source image alt-text upgrade

Adds source-image alternative text support to all *existing* Crossposter
context-menu capture adapters, while keeping Mastodon Phase 1/2 and the
Mastodon original-post URL fix unchanged.

**Prerequisite:** Your fork already contains the experimental Mastodon Phase 2
upgrade. Its `createDraft()` and saved history must retain `media[].alt`.

## Install into your fork

1. Commit or stash your local changes before applying the upgrade.
2. Extract this ZIP into the **root of the fork** so `alt-text-upgrade/`
   sits beside `package.json` and `src/`.
3. From the repository root:

   ```sh
   python3 alt-text-upgrade/apply-alt-text.py
   node alt-text-upgrade/tests/test-alt-text.mjs
   npm run build -- firefox
   ```

4. Firefox → `about:debugging` → **This Firefox** → Crossposter → **Reload**.
5. Refresh the source social-network pages so their content scripts reload.
6. Right-click **within a post** and choose **Crosspost**. For each source
   image, the composer now shows `Source image alt text:` directly underneath.
   When a description is not exposed, it says `Not available from the source post.`

The installer preflights all expected code markers before writing. It is
idempotent and does **not** modify your manifests, FFmpeg assets, or Mastodon
source adapter. If it fails, the error names the incompatible file. Do not
force the changes onto a newer fork with different source structure.

## Coverage

| Source network | Description source |
|---|---|
| X | Image's HTML `alt` attribute |
| Facebook | Post image's HTML `alt` attribute (can be platform-generated) |
| LinkedIn | Post image's HTML `alt` attribute |
| Threads | Post image `alt`; broadens media selection to include custom alt |
| UpScrolled | Post image `alt`; broadens media selection to include custom alt |
| Instagram | `accessibility_caption`/alt fields from post metadata; safe DOM fallback |
| Bluesky | `alt` in image-embed view metadata; DOM fallback |
| Substack Notes | Named attachment alt fields; matching image DOM fallback |
| Mastodon | Existing Phase 2 API/DOM capture; now displayed directly |

Video descriptions, when available, are intentionally not changed by this
image-specific UI patch. YouTube videos are not treated as image posts.

## Limits and accessibility notes

- A source site may omit, generate, or truncate alt text. The extension **does
  not invent** an image description when it cannot retrieve one. For an
  explicitly empty alt attribute, it will show "not available" rather than
  claim no alt was authored.
- This is **display only**. The alt text is preserved in the Crossposter draft
  and saved history, but it is not inserted into the destination network's
  image-description fields. Add/edit alt text there before publishing.
- The editor caps each captured alt string at 1,500 characters, consistent
  with the existing Mastodon Phase 2 draft model.
- Crossposter captures up to **four** media items per post; images beyond
  that existing limit will not be represented.
- The interface labels available text as **source image alt text**, not
  necessarily author-provided text: social networks sometimes generate
  descriptions themselves.
- Posts from heavily customized interfaces or new source layouts may need
  selector adjustments. Test against your live Firefox sessions.

## Tests

```sh
node alt-text-upgrade/tests/test-alt-text.mjs
```

The fixtures exercise original capture-adapter functions for X, Facebook,
LinkedIn, Threads, UpScrolled, Instagram, Bluesky, and Substack, plus
image-attribute capture, metadata fallback, absent descriptions, and HTML
escaping in the editor. Tests do not log in, upload, or publish anything.

## Revert

If you haven't committed the upgrade and your tree was clean beforehand,
use `git diff` to inspect, then `git restore` the modified files as needed.
A simple `git revert <commit>` also works if you commit this feature on its
own branch.
