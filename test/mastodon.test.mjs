import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_MASTODON_INSTANCE, mastodonHomeUrl, mastodonOriginPattern, normalizeMastodonInstance } from '../src/shared/mastodon.js';
import { NATIVE_DESTINATIONS, destinationUrl, selectedNativeDestinations } from '../src/shared/destinations.js';
import { platformContentScriptForUrl, contentScriptFilesForUrl, registeredPlatformContentScripts } from '../src/shared/content-scripts.js';
import { requestCompletePlatformPermissions, allPlatformIds } from '../src/shared/platform-permissions.js';
import { readFile } from 'node:fs/promises';

const instance = 'https://example.social';
test('configurable instance is validated, normalized and never interpolates unsafe URLs', () => {
  assert.equal(normalizeMastodonInstance(' Example.Social '), instance);
  assert.equal(normalizeMastodonInstance('https://example.social/'), instance);
  assert.equal(normalizeMastodonInstance(''), DEFAULT_MASTODON_INSTANCE);
  assert.equal(mastodonHomeUrl(instance), 'https://example.social/home');
  assert.equal(mastodonOriginPattern(instance), 'https://example.social/*');
  for (const invalid of ['http://example.social', 'https://example.social/evil', 'https://u:p@example.social', 'https://example.social:8080', 'https://example.social/?x=1', 'javascript:alert(1)', 'https://example.social#fragment', 'bad/name']) {
    assert.throws(() => normalizeMastodonInstance(invalid), Error, invalid);
  }
});

test('destination and custom instance registrations are consistent', () => {
  assert.ok(NATIVE_DESTINATIONS.find(x => x.id === 'mastodon'));
  assert.ok(selectedNativeDestinations({ destinations: ['mastodon'], media: [] }).some(x => x.id === 'mastodon'));
  const reg = registeredPlatformContentScripts(['mastodon'], instance);
  const adaptor = reg.find(script => script.id === 'crossposter-mastodon');
  const overlay = reg.find(script => script.id === 'crossposter-handoff-overlay');
  assert.deepEqual(adaptor.matches, ['https://example.social/*']);
  assert.deepEqual(adaptor.js, ['content.js','platforms/mastodon/content.js']);
  assert.deepEqual(overlay.matches, ['https://example.social/*']);
  assert.equal(platformContentScriptForUrl('https://example.social/home', instance)?.platformId, 'mastodon');
  assert.equal(platformContentScriptForUrl('https://other.social/home', instance), null);
  assert.deepEqual(contentScriptFilesForUrl('https://example.social/home', ['mastodon'], instance), adaptor.js);
  assert.deepEqual(contentScriptFilesForUrl('https://example.social/home', [], instance), []);
  assert.deepEqual(destinationUrl({ id: 'mastodon', homeUrl: mastodonHomeUrl(instance) }, 'hello'), { url: 'https://example.social/home', prefilled: false });
});

test('only per-instance optional permission is requested, checked and reported', async () => {
  const requests = [];
  let granted = false;
  const permissions = {
    async request({ origins }) { requests.push(origins); granted = true; return true; },
    async contains({ origins }) { return granted && origins.every(origin => origin === 'https://example.social/*'); }
  };
  const done = await requestCompletePlatformPermissions(permissions, ['mastodon'], ['https://example.social/*']);
  assert.equal(done.ok, true);
  assert.deepEqual(requests, [['https://example.social/*']]);
  granted = false;
  permissions.request = async ({origins}) => { requests.push(origins); return false; };
  const denied = await requestCompletePlatformPermissions(permissions, ['mastodon'], ['https://example.social/*']);
  assert.equal(denied.ok, false);
  assert.deepEqual(denied.missing, ['mastodon']);
});

test('manifest declares optional dynamic hosts without treating them as a static platform permission bundle', async () => {
  const firefox = JSON.parse(await readFile('src/manifest.firefox.json', 'utf8'));
  assert.deepEqual(firefox.optional_host_permissions, ['https://*/*']);
  assert.ok(!allPlatformIds(firefox).includes('mastodon'));
  assert.notEqual(firefox.browser_specific_settings.gecko.id, 'crossposter@mochi.is');
});

function adapterStub() {
  let adapter;
  const fake = { register(value) { adapter = value; } };
  const source = readFileSync('src/platforms/mastodon/content.js', 'utf8');
  vm.runInNewContext(source, { globalThis: { CrossposterContent: fake }, location: { hostname: 'example.social' }, document: {} });
  return adapter;
}

test('Mastodon adapter fills text and attaches images but never clicks publish', async () => {
  const adapter = adapterStub();
  let setCount = 0, attachedCount = 0;
  const root = { tag: 'form' };
  const field = { closest() { return root; } };
  const stages = [];
  const helpers = {
    queryAllDeep() { return [field]; }, isVisible() { return true; },
    async waitForElement(fn) { return fn(); },
    async fillComposerTextOnce(node, container, text) { assert.equal(node, field); assert.equal(container, root); assert.equal(text, 'hello\nworld'); setCount++; return true; },
    findCompatibleFileInput() { return { type: 'file' }; },
    attachFilesToInput() { attachedCount++; return 1; },
    reportComposerStage(_id, _network, stage) { stages.push(stage); }
  };
  const handoff = { handoffId: 'test', text: 'hello\nworld' };
  const result = await adapter.openComposer({ handoff, files: [{type:'image/png',name:'photo.png'}], helpers });
  assert.equal(result.error, '');
  assert.equal(result.textInserted, true);
  assert.equal(result.mediaInserted, 1);
  assert.equal(setCount, 1);
  assert.equal(attachedCount, 1);
  assert.deepEqual(stages, ['locate','fill-text','attach','ready']);
  assert.ok(!('nativePostSubmission' in adapter));
});

test('adapter reports when composer is absent rather than claiming success', async () => {
  const adapter = adapterStub();
  const result = await adapter.openComposer({ handoff: {text:'hi'}, files: [], helpers: {
    reportComposerStage() {}, queryAllDeep() { return []; }, isVisible() { return false; },
    async waitForElement() { throw Error('timed out'); },
    composerNotFound(msg) { return {error: msg, composerOpened: false}; }
  }});
  assert.match(result.error, /not found/i);
  assert.equal(result.composerOpened, false);
});
