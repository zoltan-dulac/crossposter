#!/usr/bin/env python3
"""Apply image-alt-text capture/display upgrades to Crossposter with Mastodon Phase 2.

Run this script from the fork's root, after backing up/committing changes.
All substitutions are checked before files are written; rerunning is harmless.
"""
from pathlib import Path
import sys

root = Path.cwd()
if not (root / 'package.json').exists() or not (root / 'src/content.js').exists():
    sys.exit('Run this installer from your Crossposter repository root (beside package.json).')

staged = {}
changes = []

def replace(path, old, new, description):
    f = root / path
    if not f.is_file():
        raise RuntimeError(f'Missing required source file: {path}')
    source = staged.get(path, f.read_text())
    if new in source:
        print(f'Already installed: {description}')
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly 1 insertion point for {description}, found {count}. No files changed.')
    staged[path] = source.replace(old, new, 1)
    changes.append((path, description))

try:
    # Phase 2 changed the draft model to retain 'alt'; verify first so no
    # captured descriptions are dropped by an older fork.
    draft = (root / 'src/shared/draft.js').read_text()
    history = (root / 'src/shared/draft-history.js').read_text()
    if 'alt: String(item?.alt || "")' not in draft or '...(item.alt ? { alt: item.alt } : {})' not in history:
        raise RuntimeError('This upgrade requires Mastodon Phase 2 source (draft/history alt preservation). Apply Phase 2 first.')

    replace('src/content.js', '''  function mediaFromNodes(nodes) {
    return [...nodes].map(node => ({
      kind: node.tagName === "VIDEO" ? "video" : "image",
      url: node.currentSrc || node.src,
      poster: node.tagName === "VIDEO" ? node.poster || "" : "",
      sources: node.tagName === "VIDEO" ? node.getAttribute("data-sources") || null : null
    })).filter(item => item.url && !item.url.startsWith("data:")).slice(0, 4);
  }''', '''  function mediaFromNodes(nodes) {
    return [...nodes].map(node => ({
      kind: node.tagName === "VIDEO" ? "video" : "image",
      url: node.currentSrc || node.src,
      // Preserve the actual image alt attribute, including an explicitly
      // empty one. If it is absent, some networks expose a description using
      // aria-label. Do not invent descriptions from filenames or captions.
      ...(node.tagName === "IMG" ? {
        alt: String(node.getAttribute("alt") ?? node.getAttribute("aria-label") ?? "").slice(0, 1500)
      } : {}),
      poster: node.tagName === "VIDEO" ? node.poster || "" : "",
      sources: node.tagName === "VIDEO" ? node.getAttribute("data-sources") || null : null
    })).filter(item => item.url && !item.url.startsWith("data:")).slice(0, 4);
  }''', 'capture DOM image alt attributes for all platform adapters')

    replace('src/platforms/bluesky/content.js', '''return (embed.images || []).map(image => ({ kind: "image", url: image.fullsize || image.thumb || "" }))''', '''return (embed.images || []).map(image => ({
        kind: "image", url: image.fullsize || image.thumb || "",
        alt: String(image.alt ?? "").slice(0, 1500)
      }))''', 'read alt from Bluesky API image embeds')

    replace('src/platforms/instagram/content.js', '''      const resolved = instagramMetadataMedia(metadataByPost.get(post));
      if (resolved.length) return resolved;''', '''      const resolved = instagramMetadataMedia(metadataByPost.get(post));
      if (resolved.length) {
        // Some Instagram metadata formats contain no accessibility_caption.
        // Fall back to page alt text only where its image count matches, so a
        // carousel's visible slide cannot mislabel a different slide.
        const sourceImages = instagramPostImages(post);
        const imageItems = resolved.filter(item => item.kind === "image");
        if (sourceImages.length === imageItems.length) {
          let nextImage = 0;
          return resolved.map(item => item.kind !== "image" ? item : {
            ...item,
            alt: item.alt || String(sourceImages[nextImage++]?.getAttribute("alt") || "").slice(0, 1500)
          });
        }
        return resolved;
      }''', 'match Instagram metadata images to DOM descriptions when unambiguous')

    replace('src/platforms/instagram/content.js', '''      return bestImage ? { kind: "image", url: bestImage.url } : null;''', '''      return bestImage ? {
        kind: "image", url: bestImage.url,
        alt: String(entry.accessibility_caption ?? entry.alt_text ?? entry.altText ?? entry.image_alt_text ?? "").slice(0, 1500)
      } : null;''', 'capture Instagram accessibility-caption metadata')

    replace('src/platforms/substack/content.js', '''      if (attachment?.type === "image" && /^https?:/i.test(attachment.imageUrl || "")) return { kind: "image", url: attachment.imageUrl };''', '''      if (attachment?.type === "image" && /^https?:/i.test(attachment.imageUrl || "")) {
        // Notes API field names vary; use only fields explicitly named as alt
        // text (not a generic image caption or AI-generated summary).
        const alt = attachment.altText ?? attachment.alt_text ?? attachment.imageAltText ?? attachment.imageAlt ?? attachment.alt;
        // Prefer the authored alt in the API. The rendered image is a fallback
        // only when it has the same exact src, avoiding wrong slide mapping.
        const domImage = [...(post?.querySelectorAll?.("img") || [])]
          .find(img => (img.currentSrc || img.src) === attachment.imageUrl);
        return {
          kind: "image", url: attachment.imageUrl,
          alt: String(alt ?? domImage?.getAttribute("alt") ?? "").slice(0, 1500)
        };
      }''', 'capture Substack Notes image alt metadata')

    replace('src/platforms/threads/content.js', '''      const nodes = post.querySelectorAll("video, a[href*='/post/'][href$='/media'] img, img[alt^='Photo by']");
      return helpers.mediaFromNodes(nodes);''', '''      const nodes = [...post.querySelectorAll("video, img")].filter(node => {
        if (node.tagName === "VIDEO") return true;
        const width = node.naturalWidth || node.width || 0;
        const height = node.naturalHeight || node.height || 0;
        const src = node.currentSrc || node.src || "";
        const alt = `${node.getAttribute("alt") || ""} ${node.getAttribute("aria-label") || ""}`;
        return /^https?:/i.test(src) && (
          node.closest("a[href*='/post/'][href$='/media']") || /^Photo by/i.test(alt) ||
          (width >= 180 && height >= 100 && !node.closest("a[href^='/@']")
            && !/(?:avatar|profile|emoji|logo)/i.test(alt))
        );
      });
      return helpers.mediaFromNodes(nodes);''', 'include author-described images in Threads, excluding profile avatars')

    replace('src/platforms/upscrolled/content.js', '''        : helpers.mediaFromNodes(post.querySelectorAll("img[alt='Post image']"));''', '''        : helpers.mediaFromNodes([...post.querySelectorAll("img")].filter(node => {
          const width = node.naturalWidth || node.width || 0;
          const height = node.naturalHeight || node.height || 0;
          const src = node.currentSrc || node.src || "";
          const alt = `${node.getAttribute("alt") || ""} ${node.getAttribute("aria-label") || ""}`;
          return /^https?:/i.test(src) && (
            node.getAttribute("alt") === "Post image" ||
            (width >= 180 && height >= 100 && !node.closest("a[href^='/@']")
              && !/(?:avatar|profile|emoji|logo)/i.test(alt))
          );
        }));''', 'include author-described images in UpScrolled')

    # Previous Phase 2 renderer has a collapsed details element for alt text,
    # but only when alt is nonempty. Make the description visible for each
    # source image, and clearly indicate when no alt was exposed.
    replace('src/compose.js', '''    const alt = String(item.alt || "").trim();
    const altNote = alt ? `<details class="captured-alt"><summary>Original ${video ? "media" : "image"} description</summary><p>${escapeAttr(alt)}</p></details>` : "";
    const note = (edits.length ? `<figcaption>${escapeAttr(edits.join(" · "))}</figcaption>` : "") + altNote;''', '''    const alt = String(item.alt || "").trim();
    // Present source descriptions directly below the image, including their
    // absence. This is informational: uploading to a destination still
    // requires the user to supply alt in that platform's native editor.
    const altNote = !video && !item.textCard && Boolean(draft.sourceUrl)
      ? `<div class="captured-alt"><strong>Source image alt text:</strong> <span>${alt ? escapeAttr(alt) : "Not available from the source post."}</span></div>`
      : "";
    const note = (edits.length ? `<figcaption>${escapeAttr(edits.join(" · "))}</figcaption>` : "") + altNote;''', 'show alt below every source image rather than only inside a disclosure')

    # The CSS Phase 2 feature already exists. Append a narrowly scoped
    # override without disturbing dark mode or edit buttons.
    cssfile = 'src/styles.css'
    stylesheet = staged.get(cssfile, (root / cssfile).read_text())
    css = '''\n/* Always-visible alternative text copied from the source image. */
.media-tile .captured-alt {
  display: block;
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  user-select: text;
}
.media-tile .captured-alt strong { font-weight: 600; }
'''
    if css.strip() not in stylesheet:
        staged[cssfile] = stylesheet + css
        changes.append((cssfile, 'style source-image description text'))

    # Preserve alt when users right-click images that aren't inside a post.
    replace('src/shared/capture.js', '''  if (info.srcUrl) {
    return [{ kind: info.mediaType === "video" ? "video" : "image", url: info.srcUrl }];
  }''', '''  if (info.srcUrl) {
    const match = capturedMedia.find(item => item.url === info.srcUrl);
    return [{ kind: info.mediaType === "video" ? "video" : "image",
      url: info.srcUrl, ...(match?.alt ? { alt: match.alt } : {}) }];
  }''', 'retain captured alt for context-menu image fallback')
except Exception as error:
    sys.exit(f'Cannot safely apply alt-text upgrade: {error}')

for path, content in staged.items():
    (root / path).write_text(content)
for path, desc in changes:
    print(f'Updated {path}: {desc}')
print(f'Done: {len(changes)} updates. Run npm run build -- firefox, then Reload in about:debugging.')
