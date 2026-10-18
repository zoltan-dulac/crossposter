(() => {
  const core = globalThis.CrossposterContent;
  if (!core) return;
  const cache = new WeakMap();
  const COMPOSER = "form.compose-form textarea.autosuggest-textarea__textarea, form.compose-form textarea[aria-autocomplete='list'], form.compose-form textarea";
  const textOf = el => String(el?.innerText || el?.textContent || '').trim();
  function webUrl(input) {
    try { const url = new URL(input, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function selectedStatus(post) {
    return post?.matches?.('.status[data-id], .detailed-status[data-id]') ? post
      : post?.querySelector?.('.status[data-id], .detailed-status[data-id]') || post;
  }
  function localId(post) {
    const id = selectedStatus(post)?.getAttribute?.('data-id') || '';
    if (/^\d+$/.test(id)) return id;
    const localLink = post?.querySelector?.('a.status__relative-time[href], a.detailed-status__datetime[href]');
    try {
      const parsed = new URL(localLink?.href || localLink?.getAttribute?.('href'), location.origin);
      const linkId = parsed.origin === location.origin && parsed.pathname.match(/^\/@[^/]+\/(\d+)\/?$/)?.[1];
      if (linkId) return linkId;
    } catch {}
    return location.pathname.match(/^\/@[^/]+\/(\d+)\/?$/)?.[1] || '';
  }
  function parseContent(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const body = doc.body;
    for (const br of [...body.querySelectorAll('br')]) br.replaceWith('\n');
    for (const link of [...body.querySelectorAll('a[href]')]) {
      if (link.matches('.mention, .hashtag') || link.closest('.mention, .hashtag')) continue;
      const href = webUrl(link.getAttribute('href'));
      if (href && (/\.\.\.|…|https?:\/\//i.test(textOf(link)))) link.replaceWith(href);
    }
    for (const block of [...body.querySelectorAll('p, blockquote, li')]) block.append('\n');
    return { text: String(body.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), doc };
  }
  function mediaFromApi(status) {
    return (status?.media_attachments || []).filter(m => ['image','video','gifv'].includes(m.type)).map(m => {
      const url = webUrl(m.url || m.remote_url);
      if (!url) return null;
      return { kind: m.type === 'image' ? 'image' : 'video', url, alt: String(m.description || ''),
        ...(m.preview_url ? { poster: webUrl(m.preview_url) } : {}) };
    }).filter(Boolean).slice(0, 4);
  }
  function linksFromApi(status, result) {
    const links = [];
    for (const link of result.doc.querySelectorAll('a[href]')) {
      if (link.matches('.mention, .hashtag') || link.closest('.mention, .hashtag')) continue;
      const url = webUrl(link.getAttribute('href'));
      if (url && !links.some(item => item.url === url)) links.push({ url, display: textOf(link), inText: result.text.includes(url) });
    }
    const cardUrl = webUrl(status?.card?.url);
    if (cardUrl && !links.some(item => item.url === cardUrl)) links.push({ url: cardUrl, display: status?.card?.title || '', inText: result.text.includes(cardUrl) });
    return links.slice(0, 8);
  }
  function permalink(post) {
    const anchor = post?.querySelector?.('a.status__relative-time[href], a.detailed-status__datetime[href]');
    return webUrl(anchor?.href || anchor?.getAttribute?.('href')) || (location.pathname.match(/^\/@[^/]+\/\d+\/?$/) ? location.href : '');
  }
  function domPublic(post) {
    const el = selectedStatus(post);
    return Boolean(el?.matches?.('.status-public, [data-visibility="public"]') || post?.matches?.('.status-public, [data-visibility="public"]'));
  }
  async function load(post) {
    if (!post || post === document.body) throw new Error('Right-click inside an individual Mastodon status.');
    if (cache.has(post)) return cache.get(post);
    const id = localId(post);
    let status = null;
    if (id) {
      try {
        const response = await fetch(`${location.origin}/api/v1/statuses/${id}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (response.ok) { const responseStatus = await response.json(); status = responseStatus?.reblog || responseStatus; }
      } catch (error) { console.debug('Mastodon API capture unavailable:', error); }
    }
    let result;
    if (status) {
      if (status.visibility !== 'public') throw new Error('Only public Mastodon posts can be cross-posted; unlisted, followers-only and direct posts are excluded.');
      const parsed = parseContent(status.content);
      const navHandle = (document.querySelector('.navigation-bar__profile a[href^="/@"]')?.getAttribute('href') || '').match(/^\/@([^/]+)/)?.[1]?.toLowerCase();
      const authorHandle = String(status.account?.acct || status.account?.username || '').toLowerCase();
      result = {
        text: parsed.text, media: mediaFromApi(status), links: linksFromApi(status, parsed),
        sourceUrl: webUrl(status.url || status.uri) || permalink(post),
        sourceAuthor: status.account?.display_name || status.account?.acct || status.account?.username || '',
        sourceAccount: status.account?.acct || '', sourceIsOwn: Boolean(navHandle && navHandle === authorHandle),
        sourceContentWarning: String(status.spoiler_text || ''), sourceSensitive: status.sensitive === true
      };
    } else {
      // Avoid copying private posts or expanding CWs when the API is unavailable.
      if (!domPublic(post)) throw new Error('This Mastodon post could not be verified as public. Open its original post page and try again.');
      const root = selectedStatus(post);
      if (root?.querySelector?.('.status__content__spoiler, .media-spoiler')) throw new Error('A sensitive or content-warned status requires API metadata to capture safely.');
      const content = root?.querySelector?.('.status__content__text, .detailed-status__content');
      const media = [...(root?.querySelectorAll?.('.media-gallery img, .media-gallery video, .video-player video') || [])].map(el => ({
        kind: el.tagName === 'VIDEO' ? 'video' : 'image', url: webUrl(el.currentSrc || el.src), alt: String(el.alt || ''),
        ...(el.tagName === 'VIDEO' ? { poster: webUrl(el.poster) } : {})
      })).filter(item => item.url).slice(0, 4);
      result = { text: textOf(content), links: [], media, sourceUrl: permalink(post),
        sourceAuthor: textOf(root?.querySelector?.('.display-name__html')), sourceAccount: '',
        sourceIsOwn: false, sourceContentWarning: '', sourceSensitive: false };
    }
    cache.set(post, result);
    return result;
  }

  core.register({
    id: 'mastodon', matches: host => host === location.hostname,
    postSelectors: ['.status[data-id]', '.detailed-status[data-id]', '.status__wrapper', '.detailed-status', '.status'],
    prepareCapture: async ({ post }) => { await load(post); },
    captureText: ({ post }) => cache.get(post)?.text || '',
    captureLinks: ({ post }) => cache.get(post)?.links || [],
    captureMedia: ({ post }) => cache.get(post)?.media || [],
    sourceUrl: ({ post }) => cache.get(post)?.sourceUrl || permalink(post),
    sourceAuthor: ({ post }) => cache.get(post)?.sourceAuthor || '',
    isOwnPost: ({ post }) => cache.get(post)?.sourceIsOwn === true,
    captureExtras: ({ post }) => ({ sourceNetwork: 'mastodon', sourceContentWarning: cache.get(post)?.sourceContentWarning || '',
      sourceSensitive: cache.get(post)?.sourceSensitive === true, sourceAccount: cache.get(post)?.sourceAccount || '' }),
    videoInfo: ({ post }) => ({ source: 'mastodon', src: cache.get(post)?.media.find(item => item.kind === 'video')?.url || '' }),
    async openComposer({ handoff, files, helpers }) {
      const report = stage => helpers.reportComposerStage?.(handoff.handoffId, 'mastodon', stage);
      const findField = () => helpers.queryAllDeep(COMPOSER).find(helpers.isVisible) || null;
      report('locate');
      let field;
      try { field = await helpers.waitForElement(findField, 15000); }
      catch { return helpers.composerNotFound('Mastodon’s composer was not found. Sign in to the configured instance and use the Crossposter sidebar.'); }
      report('fill-text');
      const root = field.closest('form.compose-form') || field;
      const textInserted = await helpers.fillComposerTextOnce(field, root, handoff.text || '', { method: 'set' });
      let mediaInserted = 0;
      if (files.length) {
        report('attach');
        let input = helpers.findCompatibleFileInput(files, root);
        if (!input) { try { input = await helpers.waitForElement(() => helpers.findCompatibleFileInput(files, document), 4000); } catch {} }
        if (input) { try { mediaInserted = helpers.attachFilesToInput(files, input); } catch {} }
      }
      if (textInserted && (!files.length || mediaInserted)) report('ready');
      return { ok: true, composerOpened: true, textInserted, mediaInserted,
        error: [!textInserted && 'Mastodon did not accept the text.', files.length && !mediaInserted && 'Attach the media manually.'].filter(Boolean).join(' ') };
    }
  });
})();
