(() => {
  const core = globalThis.CrossposterContent;
  if (!core) return;

  // Official Mastodon web UI (single/multi-column). Third-party Mastodon
  // frontends use different editors and are intentionally not targeted.
  const COMPOSER_FIELD = "form.compose-form textarea.autosuggest-textarea__textarea, form.compose-form textarea[aria-autocomplete='list'], form.compose-form textarea";
  const INPUT_WAIT_MS = 15000;
  const MESSAGES = Object.freeze({
    locate: "Mastodon’s composer was not found. Make sure you are signed in and using your server’s standard Mastodon web interface, then use the sidebar to copy your post.",
    text: "Mastodon’s composer did not accept the text. Copy it from the Crossposter sidebar.",
    media: "Mastodon did not accept the media automatically. Attach it manually from the Crossposter sidebar."
  });

  core.register({
    id: "mastodon",
    // This adapter is registered only on the HTTPS instance selected in
    // Settings, so no hard-coded hostname is required here.
    matches: host => host === location.hostname,
    async openComposer({ handoff, files, helpers }) {
      const report = stage => helpers.reportComposerStage?.(handoff.handoffId, "mastodon", stage);
      const findField = () => helpers.queryAllDeep(COMPOSER_FIELD).find(helpers.isVisible) || null;
      report("locate");
      let field;
      try { field = await helpers.waitForElement(findField, INPUT_WAIT_MS); }
      catch { return helpers.composerNotFound(MESSAGES.locate); }

      report("fill-text");
      const root = field.closest("form.compose-form") || field;
      // Use the native textarea setter + input event to update Mastodon's
      // controlled React state, preserving newlines. Never append text on retry.
      const textInserted = await helpers.fillComposerTextOnce(field, root, handoff.text || "", { method: "set" });
      let mediaInserted = 0;
      if (files.length) {
        report("attach");
        // UploadButton renders a hidden file input. Its acceptsMedia types
        // vary across servers; never force an incompatible file type.
        let input = helpers.findCompatibleFileInput(files, root);
        if (!input) {
          try { input = await helpers.waitForElement(() => helpers.findCompatibleFileInput(files, document), 4000); }
          catch {}
        }
        if (input) {
          try { mediaInserted = helpers.attachFilesToInput(files, input); }
          catch { mediaInserted = 0; }
        }
      }
      if (textInserted && (!files.length || mediaInserted)) report("ready");
      const problems = [];
      if (!textInserted) problems.push(MESSAGES.text);
      if (files.length && !mediaInserted) problems.push(MESSAGES.media);
      return { ok: true, composerOpened: true, textInserted, mediaInserted, error: problems.join(" ") };
    }
  });
})();
