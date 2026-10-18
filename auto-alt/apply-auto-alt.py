#!/usr/bin/env python3
"""Crossposter 0.3.8 + Mastodon Phase2 + alt-capture: add cautious native alt writer.
Run from repo root: python3 auto-alt/apply-auto-alt.py
Preflights all edits, aborts without partial writes, idempotent.
"""
from pathlib import Path
import sys

root = Path.cwd()
package = Path(__file__).resolve().parent
if not (root/'src/content.js').is_file() or not (root/'src/compose.js').is_file():
    sys.exit('Run this from the root of your Crossposter repository.')
required = ['src/shared/content-scripts.js','src/compose.js','src/content.js','src/shared/handoff-status.js']
staged={}
for name in required: staged[name] = (root/name).read_text()
changes=[]

def replace(name, before, after, what):
    old = staged[name]
    if after in old:
        return
    if old.count(before) != 1:
        raise RuntimeError(f'{name}: expected exactly one insertion point for {what}, found {old.count(before)}. Aborting without changes.')
    staged[name] = old.replace(before,after,1)
    changes.append(what)

try:
    if 'Source image alt text:' not in staged['src/compose.js']:
        raise RuntimeError('Install the previous source-image alt-text upgrade first. This patch needs media[].alt to be preserved and shown in the editor.')
    if not (root/'src/platforms/mastodon/content.js').exists():
        raise RuntimeError('Mastodon Phase 1/2 must already be installed.')
    replace('src/compose.js', '''      prepared.push(reference);
      preparedForHistory.push({ ...reference, sourceIndex: index });''','''      // Preserve the description against the exact File reference prepared
      // for this handoff, even when earlier media could not be downloaded.
      // Do not manufacture alt text for absent source descriptions.
      reference = { ...reference, kind: item.kind || reference.kind,
        ...(item.kind === "image" ? { alt: String(item.alt || "").slice(0, 1500) } : {}) };
      prepared.push(reference);
      preparedForHistory.push({ ...reference, sourceIndex: index });''','preserve source alt on prepared files and retries')
    replace('src/shared/content-scripts.js','''export const CONTENT_SCRIPT_CORE = "content.js";''','''export const CONTENT_SCRIPT_CORE = "content.js";
export const ALT_TEXT_HANDOFF_SCRIPT = "alt-text-handoff.js";''','register alt-handoff content script')
    replace('src/shared/content-scripts.js','''return adapter ? [CONTENT_SCRIPT_CORE, adapter.file] : [];''','''return adapter ? [CONTENT_SCRIPT_CORE, ALT_TEXT_HANDOFF_SCRIPT, adapter.file] : [];''','load native alt helper during one-off injection')
    replace('src/shared/content-scripts.js','''js: [CONTENT_SCRIPT_CORE, item.file],''','''js: [CONTENT_SCRIPT_CORE, ALT_TEXT_HANDOFF_SCRIPT, item.file],''','load native alt helper in persistent content registrations')
    replace('src/content.js','''    const files = await handoffFiles(handoff.media || []);
    return adapter.openComposer({ handoff, files, helpers });''','''    const files = await handoffFiles(handoff.media || []);
    const result = await adapter.openComposer({ handoff, files, helpers });
    // Only write after ALL of the media was accepted into this composer.
    // This is intentionally best-effort and never clicks a native Post action.
    if (!result?.composerOpened || files.length === 0 || Number(result.mediaInserted || 0) < files.length) return result;
    const transfer = globalThis.CrossposterAltText;
    if (!transfer?.apply) return result;
    const altText = await transfer.apply(network, handoff.media || [], helpers, handoff.handoffId || "");
    return { ...result, altText };''','apply source descriptions after successful attachment')
    replace('src/shared/handoff-status.js','''    if (textDone && mediaDone && (result.textInserted || result.mediaInserted)) return { state: "filled", tone: "done", text: "Ready to review", detail: "" };''','''    if (textDone && mediaDone && result.altText?.total > 0 && result.altText.status !== "none") {
      return { state: "check-alt", tone: "action", text: "Review image descriptions",
        detail: result.altText.reason || "Confirm each image’s alt text before posting." };
    }
    if (textDone && mediaDone && (result.textInserted || result.mediaInserted)) return { state: "filled", tone: "done", text: "Ready to review", detail: "" };''','show explicit alt transfer verification status')
except Exception as error:
    sys.exit(f'Cannot safely apply the patch: {error}')

new_file = root/'src/alt-text-handoff.js'
script=(package/'src/alt-text-handoff.js').read_text()
if new_file.exists() and new_file.read_text() != script:
    sys.exit('src/alt-text-handoff.js exists with different content. Refusing to overwrite it.')

for name, value in staged.items():
    (root/name).write_text(value)
new_file.write_text(script)
print(f'Alt-text handoff installed: {len(changes)} updates and src/alt-text-handoff.js.')
print('Run: node auto-alt/tests/test-auto-alt.mjs && npm run build -- firefox')
