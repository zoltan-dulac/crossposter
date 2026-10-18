import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = name => readFileSync(`src/${name}`, 'utf8');
const core = file('content.js');
const helper = core.slice(core.indexOf('  function mediaFromNodes(nodes) {'), core.indexOf('  // The rendered text of', core.indexOf('  function mediaFromNodes(nodes) {')));
const context = { exported: null };
vm.runInNewContext(`${helper}\nexported = mediaFromNodes;`, context);
const mediaFromNodes = context.exported;
const img = (url, alt, width = 420, height = 320, aria) => ({
  tagName: 'IMG', src: url, currentSrc: url, alt: alt ?? '', width, height, naturalWidth: width, naturalHeight: height,
  className: '',
  getAttribute(key) { return key === 'alt' ? alt : key === 'aria-label' ? aria ?? null : null; },
  closest() { return null; }
});
const selectors = ({ images = [], videos = [] }) => ({
  querySelectorAll(s) {
    if (/video/i.test(s) && /img/i.test(s)) return [...videos, ...images];
    if (/video/i.test(s)) return videos;
    if (/img|media/i.test(s)) return images;
    return [];
  },
  querySelector() { return null; }
});
const helpers = {
  mediaFromNodes,
  queryAllDeep(s, post) { return post.querySelectorAll(s); },
};
function adapter(name) {
  let registered;
  const source = file(`platforms/${name}/content.js`);
  const exposed = source.replace(/\}\)\(\);\s*$/, `\n if (typeof blueskyEmbedMedia !== 'undefined') globalThis.blueskyEmbedMedia = blueskyEmbedMedia;\n if (typeof instagramMetadataMedia !== 'undefined') globalThis.instagramMetadataMedia = instagramMetadataMedia;\n if (typeof attachmentMedia !== 'undefined') globalThis.attachmentMedia = attachmentMedia;\n})();`);
  const scope = { CrossposterContent: null, URL, location: {hostname:'example.org', origin:'https://example.org', href:'https://example.org/post'}, document: {querySelectorAll(){return [];}}, console, setTimeout, fetch: undefined };
  scope.globalThis = { CrossposterContent: { register(a){ registered=a; } } };
  vm.runInNewContext(exposed, scope);
  assert(registered, `Adapter ${name} not registered`);
  return { registered, exposed:scope.globalThis };
}

const plain=mediaFromNodes([img('https://assets.test/cat.jpg','A black cat'), img('https://assets.test/bike.jpg',null,420,320,'A red bike'), img('https://assets.test/decorative.jpg','',420,320,'Ignore me')]);
assert.equal(plain[0].alt,'A black cat');
assert.equal(plain[1].alt,'A red bike');
assert.equal(plain[2].alt,'');
console.log('PASS: core captures img alt, aria-label fallback, and explicitly empty alt');

const scenarios = [
 ['x', ['[data-testid', img('https://assets.test/x.jpg','A landscape')], 'A landscape'],
 ['facebook', ['img', img('https://assets.test/fb.jpg','Three people at a concert')], 'Three people at a concert'],
 ['linkedin', ['img', img('https://assets.test/li.jpg','Office interior')], 'Office interior'],
 ['threads', ['img', img('https://assets.test/th.jpg','A scarlet bicycle')], 'A scarlet bicycle'],
 ['upscrolled', ['img', img('https://assets.test/up.jpg','Street market')], 'Street market'],
 ['instagram', ['img', img('https://assets.test/in.jpg','Vintage camera')], 'Vintage camera'],
];
for (const [name,[pattern,image],alt] of scenarios) {
 const post=selectors({images:[image]});
 const got=adapter(name).registered.captureMedia({post,helpers}) || [];
 assert(got.length>0, `${name}: no captured image`);
 assert.equal(got[0].alt,alt, `${name}: wrong image alt`);
 console.log(`PASS: ${name} ${got.length} image(s) with alt`);
}
{
 const {exposed}=adapter('bluesky');
 assert.equal(exposed.blueskyEmbedMedia({$type:'app.bsky.embed.images#view',images:[{fullsize:'https://cdn.test/1.jpg',alt:'Bluesky description'}]})[0].alt,'Bluesky description');
 console.log('PASS: Bluesky image API description');
}
{
 const {exposed}=adapter('instagram');
 assert.equal(exposed.instagramMetadataMedia({image_versions2:{candidates:[{url:'https://assets.test/one.jpg',width:400,height:300}]},accessibility_caption:'Instagram metadata description'})[0].alt,'Instagram metadata description');
 console.log('PASS: Instagram metadata description');
}
{
 const {exposed}=adapter('substack');
 const post=selectors({images:[]});
 assert.equal(exposed.attachmentMedia([{type:'image',imageUrl:'https://cdn.test/image.jpg',altText:'Substack description'}],post)[0].alt,'Substack description');
 console.log('PASS: Substack image attachment description');
}
// The renderer is the real Phase 2+ Crossposter implementation, extracted
// as a function and executed with lightweight mocks. HTML is not injected.
{
 const source=file('compose.js');
 const start=source.indexOf('function renderMedia() {');
 const end=source.indexOf('const isMediaFile =',start);
 assert(start>0 && end>start);
 const renderer=source.slice(start,end);
 let markup='';
 const draft={ sourceUrl:'https://example.org/@user/123',media:[
  {kind:'image',url:'https://assets.test/1.jpg',alt:'A <script>alert(1)</script> & an umbrella'},
  {kind:'image',url:'https://assets.test/2.jpg',alt:''},
  {kind:'video',url:'https://assets.test/3.mp4',alt:'Video description'}
 ] };
 const mediaGrid={ classList:{toggle(){}}, querySelectorAll(){return []} };
 const escapeAttr=v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 const fn=new Function('draft','mediaGrid','setHtml','escapeAttr','icon','formatTime','isStreamMedia','renderDestinations',renderer+'\nrenderMedia();');
 globalThis.document = { querySelectorAll() { return []; } };
 fn(draft,mediaGrid,(_el,html)=>markup=html,escapeAttr,()=>'',()=>'',()=>false,()=>{});
 delete globalThis.document;
 assert.equal((markup.match(/Source image alt text:/g)||[]).length,2);
 assert(markup.includes('A &lt;script>alert(1)&lt;/script> &amp; an umbrella'));
 assert(markup.includes('Not available from the source post.'));
 assert(!markup.includes('<script>'));
 console.log('PASS: editor shows original text and absent alt for each image; escapes HTML safely');
}
console.log('ALL PASSED');
