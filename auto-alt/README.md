# Crossposter — native destination image-alt transfer (experimental)

This is an incremental **best-effort** update for the fork containing the previously tested:
- Crossposter v0.3.8 + Mastodon Phase 1 and Phase 2 (including original URL fix)
- Source-image alt-text capture/display upgrade

## Install on your fork

Commit your current working code first. Extract this ZIP into the **root** of the repo so `auto-alt/` is beside `package.json`:

```sh
python3 auto-alt/apply-auto-alt.py
node --test auto-alt/tests/test-auto-alt.mjs
npm run build -- firefox
```

In Firefox, open `about:debugging` → **This Firefox** → find Crossposter → **Reload**. Refresh your social-media tabs if needed. For each destination, prepare a post with one authored image and a visible source alt description. When Crossposter has attached the image in the native composer, it attempts to copy the description into a confidently recognized alt-text field.

**Publishing is never automatic. Review all images, descriptions, privacy settings and content warnings before clicking Post/Publish/Share yourself.** The handoff panel says **Review image descriptions** and tells you to confirm the result.

## How it works

- Copies `media[].alt` into the prepared image references. This preserves order even if an earlier source download failed, and it is retained for retry handoffs.
- Loads a small isolated content script on destination networks. The script only attempts to fill fields that explicitly identify themselves as **Alt text**, **Image description**, **Describe this image**, etc.
- Supports either (a) an existing matching set of labeled per-image alt inputs, or (b) per-image `+ALT`/`ALT`/`Add description` buttons opening **new** dialogs with a labeled alt editor and a clearly labeled Save/Done/Apply action.
- Instagram also tries to open the named **Accessibility** disclosure before searching for its image-description fields.
- Refuses to guess image order unless the number of matched alt fields/buttons equals the number of prepared images.
- Never overrides a different, already-filled destination description.
- Never clicks the site's publication buttons, writes to APIs or changes permissions.
- Reports **Review image descriptions** in the Crossposter handoff status for all transferred images, because DOM insertion does *not* prove the destination saved the text.

## Platform coverage and limitations

| Destination | Attempted automatic workflow | What may prevent it |
|---|---|---|
| Bluesky | `+ALT` per thumbnail → alt dialog | Modal markup may change; title/Save label may be localized |
| X / Twitter | `ALT` or Add description → alt dialog | Different versions of media editor; description length limit |
| Mastodon | Recognized edit-description control/dialog or visible labeled field | Mastodon instance, version and custom frontend differences |
| Instagram | Accessibility disclosure → Write alt text inputs | Only standard web photo composer, not Stories/Reels; fields may not be exposed until later |
| LinkedIn | `Alt.text` per-photo control or labeled field | LinkedIn media-edit detour may close before caption composer opens; unsupported client variants |
| Facebook | Recognized per-image alt editor | Facebook's edit/override auto-generated alt workflow may not expose direct labeled fields |
| Threads | Recognized per-image alt editor | Availability and location of alt controls vary by rollout |
| UpScrolled | Recognized per-image alt editor | Custom interface may provide no such controls |
| Substack Notes | Recognized per-image alt editor | May not expose alt fields in Notes composer |

These are **capabilities attempted by the patch**, not nine independently verified successful live integrations. This ZIP has no authenticated live-site test results; an unsupported UI must be finished manually.

Additional limits:
- **Only static images** with captured, nonempty alt text. It does not generate descriptions; it does not handle video captions, audio descriptions, GIF equivalents or mixed image/video sets.
- More than one image requires a clear one-to-one correspondence between uploaded images and native alt controls. The extension skips ambiguous carousels rather than risk swapped descriptions.
- Alt text is capped at 1,500 characters by the existing capture pipeline; destination limits may be shorter (review/truncate as appropriate).
- Source platforms may supply machine-generated descriptions, which can be poor or incorrect; review their quality before reuse.
- Standard English interface labels are recognized. Localized interfaces, changing `data-testid` names, shadow DOM, delayed uploads, restricted permissions, or collapsed controls can prevent transfer. No API access to private/unauthorized content is attempted.
- The status **attempted** means the text was entered in a recognized field and, for dialog editors, a Save/Done action was clicked. It does **not** certify that the platform persisted or published that alt text.
- Repeating a handoff won't overwrite existing destination descriptions.

## Tests

The Node fixtures cover labeled inputs, two-image ordering, preserving existing alt, missing descriptions, mixed-album rejection, a new alt dialog and safe Save, as well as ambiguous control counts. The installer was separately preflighted and run twice for idempotence. **No actual posts were published during testing.**

## Revert

If you commit this as a separate commit, use `git revert <commit>`. Otherwise review your changes with `git diff` before reverting. This installer refuses to overwrite a pre-existing, different `src/alt-text-handoff.js`.
