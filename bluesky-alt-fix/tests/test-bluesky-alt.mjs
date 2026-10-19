import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script = readFileSync(new URL('../alt-text-handoff.js', import.meta.url),'utf8');
function fixture({ descriptions = ['Photo description'], delayPreview = 0, existing = {}, slowState = 15, suppressSave = false } = {}) {
  const events = [];
  let opened = null;
  let controls = [];
  let postClicks = 0;
  const ready = () => controls = descriptions.map((_, i) => makeControl(i));
  function makeControl(i) {
    return {
      isConnected:true, offsetWidth:20, offsetHeight:20, disabled:false,
      getAttribute(n) {return n === 'aria-label' ? (events.includes('save:' + i) ? 'Edit alt text' : 'Add alt text') : null;},
      click() { events.push('add:' + i); openAlt(i); }
    };
  }
  function button(name, fn, disabled=false) { return {
    isConnected:true,offsetWidth:12,offsetHeight:12,disabled,
    getAttribute(n) {return n==='aria-label'?name:null;},
    click() {events.push('click:'+name);fn();}
  }; }
  const post = button('Post',()=>postClicks++);
  function openAlt(i) {
    const field = {
      isConnected:true,offsetWidth:140,offsetHeight:20,value:existing[i] || '',
      getAttribute(n){ return n==='aria-label'?'Alt text':null; },
      closest(sel) { assert.equal(sel,'[role="dialog"], dialog'); return dialog; }
    };
    const dialog = {
      querySelectorAll(query) {
        if(query === 'button[aria-label="Save"]') return [save];
        if(query.includes('button[aria-label="Close"]')) return [close];
        return [];
      }
    };
    const hide=()=>{ field.isConnected=false; opened=null; };
    const save = button('Save', ()=>{events.push('save:'+i); hide();},true);
    const close = button('Close',()=>{events.push('close:'+i); hide();});
    opened={index:i,field,save,dialog};
  }
  const document = {
    querySelectorAll(query) {
      if(query === 'button[aria-label="Add alt text"], button[aria-label="Edit alt text"]') return [...controls,post].filter(b=>['Add alt text','Edit alt text'].includes(b.getAttribute('aria-label')));
      if(query === 'textarea[aria-label="Alt text"]') return opened ? [opened.field] : [];
      return [];
    }
  };
  const helpers = {
    setComposerText(el, text) {
      if(el.value) return false;
      el.value=text;
      events.push('fill:'+text);
      if(!suppressSave) setTimeout(()=>{if(opened?.field===el) opened.save.disabled=false;},slowState);
      return true;
    }
  };
  const sandbox={document,globalThis:{},Date,setTimeout};
  vm.runInNewContext(script,sandbox);
  if(delayPreview) setTimeout(ready,delayPreview); else ready();
  const apply=(id='handoff-1')=>sandbox.globalThis.CrossposterAltText.apply('bluesky',descriptions.map(alt=>({kind:'image',alt})),helpers,id);
  return {events,apply, get postClicks(){return postClicks},get opened(){return opened}, helpers, document};
}
test('one image: wait for async upload, then Add alt text -> textarea -> enabled Save', async()=>{
  const f=fixture({delayPreview:250,slowState:250});
  const out=await f.apply();
  assert.equal(out.applied,1);
  assert.equal(out.status,'attempted');
  assert.deepEqual(f.events,['add:0','fill:Photo description','click:Save','save:0']);
  assert.equal(f.postClicks,0);
});
test('two images: each thumbnail gets only its matching description', async()=>{
  const f=fixture({descriptions:['A red bike','A blue house']});
  const out=await f.apply('two');
  assert.equal(out.applied,2);
  assert.deepEqual(f.events,['add:0','fill:A red bike','click:Save','save:0','add:1','fill:A blue house','click:Save','save:1']);
  assert.equal(f.postClicks,0);
});
test('does not overwrite an existing different description', async()=>{
  const f=fixture({existing:{0:'My personally edited alt text'}});
  const out=await f.apply('existing');
  assert.equal(out.applied,0);
  assert.equal(out.status,'review');
  assert.match(out.reason,/not overwritten/);
  assert.deepEqual(f.events,['add:0','click:Close','close:0']);
});
test('if the source has no alt text no editor is touched', async()=>{
  const f=fixture({descriptions:['']});
  const out=await f.apply('missing');
  assert.equal(out.applied,0);
  assert.equal(out.status,'missing');
  assert.deepEqual(f.events,[]);
});
test('waits for a controlled Save to become enabled; does not claim saved otherwise', async()=>{
  const f=fixture({suppressSave:true});
  // Accelerate Date.now for this long-timeout case, without waiting 6 sec.
  let offset=0;
  const fakeDate=class extends Date { static now(){offset+=1600;return offset;} };
  const sandbox={document:f.document,globalThis:{},Date:fakeDate,setTimeout};
  vm.runInNewContext(script,sandbox);
  const out=await sandbox.globalThis.CrossposterAltText.apply('bluesky',[{kind:'image',alt:'Photo description'}],f.helpers,'never-save');
  assert.equal(out.status,'review');
  assert.equal(out.applied,0);
  assert.match(out.reason,/Save button/);
  assert.equal(f.postClicks,0);
  assert.ok(!f.events.includes('click:Save'));
});
