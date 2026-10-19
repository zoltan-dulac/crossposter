/* Crossposter experimental destination-image descriptions (native UI only).
 * No network APIs, no publishing and no writes outside recognized alt editors.
 * This script executes after content.js and before an adapter is registered.
 */
(() => {
  const SUPPORTED = new Set(["mastodon", "bluesky", "x", "linkedin", "instagram", "facebook", "threads", "upscrolled", "substack"]);
  const ALT_LABEL = /^(?:\+?alt(?:[. ]text)?|add (?:alt text|image description|description)|edit (?:alt text|image description|description)|write (?:alt text|image description)|describe (?:this )?image)$/i;
  const FIELD_LABEL = /(?:^|\b)(?:alt(?:ernative)? text|image description|describe (?:this )?image|write alt text)(?:\b|$)/i;
  const SAVE_LABEL = /^(?:save|done|apply|save changes|save alt text|save description)$/i;
  const completed = new Set();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const label = el => [el?.getAttribute?.('aria-label'), el?.getAttribute?.('title'), el?.getAttribute?.('placeholder'), el?.innerText, el?.textContent]
    .map(s => String(s || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
  function visible(el) { return Boolean(el?.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects?.().length)); }
  const buttons = root => [...root.querySelectorAll("button, [role='button']")].filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const fields = root => [...root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"][role="textbox"]')].filter(el => visible(el) && !el.disabled);
  const isField = el => FIELD_LABEL.test([el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.getAttribute('id')].filter(Boolean).join(' '));
  function dialog() { return [...document.querySelectorAll('[role="dialog"],dialog')].filter(visible).at(-1) || document; }
  function altButtons(root = dialog()) { return buttons(root).filter(el => ALT_LABEL.test(label(el))); }
  function altFields(root = dialog()) { return fields(root).filter(isField); }
  function safeFill(el, value, helpers) {
    // Don't overwrite authored destination descriptions. React-controlled
    // textarea support comes from Crossposter's existing native input setter.
    const current = el.isContentEditable ? el.textContent : el.value;
    if (String(current || '').trim()) return String(current).trim() === value ? 'already' : 'occupied';
    return helpers.setComposerText(el, value) ? 'filled' : 'failed';
  }
  async function appear(find, timeout = 4500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const found = find();
      if (found) return found;
      await delay(150);
    }
    return null;
  }
  function saveButton(scope) {
    // A global Save might mean "Save draft". Only save inside an actual
    // alt-editing dialog, never elsewhere on the page.
    if (!scope || scope === document) return null;
    // Never click Post, Publish, Share, Next, Send, or a default dialog submit.
    const candidates = buttons(scope).filter(el => SAVE_LABEL.test(label(el)) && !el.matches('button[type="submit"]'));
    return candidates.length === 1 ? candidates[0] : null;
  }
  // Universal case: after upload a site exposes one labeled field per image.
  // Only use this when counts match exactly; prevents mixing descriptions.
  async function directFields(images, helpers) {
    const inputs = await appear(() => {
      const matches = altFields();
      return matches.length === images.length ? matches : null;
    }, 2400);
    if (!inputs) return null;
    let applied = 0;
    for (let i = 0; i < images.length; i++) {
      if (!images[i].alt) continue;
      const written = safeFill(inputs[i], images[i].alt, helpers);
      if (written === 'filled' || written === 'already') applied++;
    }
    return { applied, mode: 'direct fields', verified: false };
  }
  // Use the site's visible per-thumbnail +ALT controls. Do not fall back to
  // arbitrary unlabeled Edit buttons or assume one image equals one button.
  async function overlayButtons(images, helpers) {
    const controls = await appear(() => {
      const found = altButtons();
      return found.length === images.length ? found : null;
    }, 5000);
    if (!controls) return null;
    let applied = 0;
    for (let i = 0; i < images.length; i++) {
      const { alt } = images[i];
      if (!alt) continue;
      // The UI may replace thumbnail nodes after each Save. Reacquire them
      // and verify the complete sequence still matches the image count.
      const currentControls = altButtons();
      if (currentControls.length !== images.length) break;
      const control = currentControls[i];
      if (!control?.isConnected || !visible(control)) continue;
      const dialogsBefore = new Set([...document.querySelectorAll('[role="dialog"],dialog')].filter(visible));
      control.click();
      const editor = await appear(() => {
        const scope = dialog();
        const candidates = altFields(scope);
        return candidates.length === 1 ? candidates[0] : null;
      }, 4000);
      if (!editor) continue;
      const written = safeFill(editor, alt, helpers);
      if (written !== 'filled' && written !== 'already') continue;
      const scope = editor.closest('[role="dialog"],dialog');
      // Do not click a generic "Save" on the original composer. The newly
      // opened image-description dialog must contain the field and save action.
      if (!scope || dialogsBefore.has(scope)) continue;
      const save = saveButton(scope);
      if (!save) continue; // Don't claim success if we couldn't save.
      save.click();
      applied++;
      await delay(200);
    }
    return { applied, mode: 'image alt editor', verified: false };
  }
  // Bluesky's current web composer uses a per-thumbnail button with the
  // accessible name "Add alt text". Clicking it opens a separate dialog
  // containing textarea[aria-label="Alt text"] and button[aria-label="Save"].
  // Image upload is asynchronous, so wait for thumbnail controls to appear
  // instead of assuming the file-input change means uploads are complete.
  async function blueskyAltText(images, helpers) {
    const selected = 'button[aria-label="Add alt text"], button[aria-label="Edit alt text"]';
    const controls = () => [...document.querySelectorAll(selected)]
      .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    // The number of visible thumbnail buttons must agree with the number of
    // uploaded images. Otherwise we cannot safely assign alt descriptions.
    const ready = await appear(() => controls().length === images.length ? true : null, 30000);
    if (!ready) return { applied: 0, mode: 'bluesky alt dialog',
      reason: 'Bluesky image previews or Add alt text buttons did not finish appearing. Add the descriptions manually.' };

    let applied = 0;
    for (let i = 0; i < images.length; i++) {
      const alt = images[i].alt;
      if (!alt) continue;
      // Re-query for each thumbnail because Bluesky re-renders after Save.
      const current = controls();
      if (current.length !== images.length) return { applied, mode: 'bluesky alt dialog',
        reason: 'Bluesky changed the image order or image controls. Review the remaining descriptions manually.' };
      const before = new Set([...document.querySelectorAll('textarea[aria-label="Alt text"]')].filter(visible));
      current[i].click();
      const editor = await appear(() => [...document.querySelectorAll('textarea[aria-label="Alt text"]')]
        .find(el => visible(el) && !before.has(el) && el.closest('[role="dialog"], dialog')), 6000);
      if (!editor) return { applied, mode: 'bluesky alt dialog',
        reason: `Bluesky did not open the Alt text dialog for image ${i + 1}. Add it manually.` };
      const scope = editor.closest('[role="dialog"], dialog');
      // Only operate on an explicitly labeled alt textarea inside its dialog.
      // Never overwrite a manually entered description with different text.
      const state = safeFill(editor, alt, helpers);
      if (state === 'occupied' || state === 'failed') {
        closeBlueskyAltDialog(scope);
        return { applied, mode: 'bluesky alt dialog',
          reason: state === 'occupied'
            ? `Image ${i + 1} already has a different description. It was not overwritten.`
            : `Bluesky did not accept the description for image ${i + 1}.` };
      }
      if (state === 'already') {
        applied++;
        if (!closeBlueskyAltDialog(scope)) return { applied, mode: 'bluesky alt dialog',
          reason: 'The existing alt text matches, but Bluesky did not close the editor. Review remaining images manually.' };
        await appear(() => !visible(editor), 4000);
        continue;
      }
      // Bluesky uses React state; Save may be initially disabled while the
      // synthetic input event reaches the controlled textarea. Wait for both
      // the expected value and the enabled, specifically labeled Save button.
      const save = await appear(() => {
        if (!visible(editor) || editor.value !== alt) return null;
        const matches = [...scope.querySelectorAll('button[aria-label="Save"]')]
          .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
        return matches.length === 1 ? matches[0] : null;
      }, 6000);
      if (!save) return { applied, mode: 'bluesky alt dialog',
        reason: `The Save button did not become available for image ${i + 1}. Review its description manually.` };
      // Save is the sole action we click in the alt dialog; this code never
      // interacts with Bluesky's Post/Publish controls.
      save.click();
      const closed = await appear(() => !visible(editor) ? true : null, 6000);
      if (!closed) return { applied, mode: 'bluesky alt dialog',
        reason: `Bluesky did not close the alt-text dialog after Save for image ${i + 1}. Check it manually.` };
      applied++;
    }
    return { applied, mode: 'bluesky alt dialog' };
  }
  function closeBlueskyAltDialog(scope) {
    const buttons = [...scope.querySelectorAll('button[aria-label="Close"], button[aria-label="Close dialog"]')]
      .filter(el => visible(el) && !el.disabled);
    if (buttons.length !== 1) return false;
    buttons[0].click();
    return true;
  }
  // Instagram commonly puts caption and per-image alt fields under
  // "Accessibility". Clicking only that named disclosure is safe.
  async function instagramAccessibility(images, helpers) {
    const root = dialog();
    const controls = buttons(root).filter(el => /^accessibility(?: settings)?$/i.test(label(el)));
    if (controls.length === 1) controls[0].click();
    return directFields(images, helpers);
  }
  async function apply(network, media, helpers, handoffId = '') {
    const images = (media || []).filter(item => item?.kind === 'image').map(item => ({ alt: String(item?.alt || '').trim().slice(0, 1500) }));
    const described = images.filter(item => item.alt).length;
    const summary = { total: images.length, described, applied: 0, status: 'none', reason: '' };
    if (!images.length) return summary;
    if (!described) return { ...summary, status: 'missing', reason: 'No source alt text was available. Add image descriptions before publishing.' };
    if (!SUPPORTED.has(network)) return { ...summary, status: 'review', reason: 'No automatic alt-text editor is known for this destination.' };
    const key = `${network}:${handoffId}:${media.map(item => item.mediaId || item.name || '').join('|')}`;
    if (completed.has(key)) return { ...summary, status: 'review', reason: 'Descriptions were already attempted. Check each image before posting.' };
    // Only memoize Bluesky after all described images were saved, so an
    // incomplete or slow upload can be retried from Crossposter's sidebar.
    if (network !== 'bluesky') completed.add(key);
    // Crossposter preserves source order when making File objects. Mixed video
    // + image albums are not supported: target ordering could differ.
    if ((media || []).some(item => item.kind === 'video')) return { ...summary, status: 'review', reason: 'Mixed image/video albums require manual description matching.' };
    try {
      let result;
      if (network === 'bluesky') result = await blueskyAltText(images, helpers);
      else if (network === 'instagram') result = await instagramAccessibility(images, helpers);
      else result = await directFields(images, helpers);
      if (!result) result = await overlayButtons(images, helpers);
      if (network === 'bluesky' && result.applied === described) completed.add(key);
      if (!result) return { ...summary, status: 'review', reason: 'Alt-text controls were not recognized. Add descriptions in the native editor.' };
      const status = result.applied === described ? 'attempted' : 'review';
      return { ...summary, applied: result.applied, status,
        reason: result.reason || (result.applied === described
          ? 'Descriptions entered; confirm each image saved the correct text before publishing.'
          : `Entered ${result.applied} of ${described} descriptions. Finish the rest manually.`) };
    } catch (error) {
      return { ...summary, status: 'review', reason: `Automatic descriptions could not be completed: ${error?.message || String(error)}` };
    }
  }
  globalThis.CrossposterAltText = Object.freeze({ apply });
})();
