import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)),'..');
const js = readFileSync(join(root,'src/alt-text-handoff.js'),'utf8');
function fixture({fields = [], controls = [], images = []}={}) {
  const events=[];
  function element({text='',placeholder='',value='',type='button',onClick=()=>{}}={}) {
    return {
      isConnected: true, offsetWidth:30, offsetHeight:30, disabled:false, type, value, textContent:text, innerText:text,
      getClientRects(){return [1]}, getAttribute(n){return n==='placeholder' ? placeholder : null},
      matches(sel){ return sel==='button[type="submit"]' && type==='submit'; },
      closest(){ return altDialogOpen ? modal : document; }, click(){events.push(`click:${text}`);onClick();}
    };
  }
  let altDialogOpen = false;
  const modal = {querySelectorAll(sel){ if(sel.includes('button')) return controls; if(sel.includes('textarea')) return fields; return []; }};
  const document = {querySelectorAll(sel){
    if(sel==='[role="dialog"],dialog') return altDialogOpen ? [modal] : [];
    if(sel.includes('button')) return controls;
    if(sel.includes('textarea')) return fields;
    return [];
  }};
  const sandbox={globalThis:{},document,setTimeout,Date};
  vm.runInNewContext(js,sandbox);
  const helpers={setComposerText(el,text){ el.value=text; events.push('fill:'+text); return true; }};
  return {apply:sandbox.globalThis.CrossposterAltText.apply,events,element,fields,controls,helpers, document, openDialog(){altDialogOpen=true;}};
}
test('a single visible alt editor gets source alt text, never posts',async()=>{
 const f=fixture(), field=f.element({placeholder:'Alt text'}); f.fields.push(field);
 const result=await f.apply('bluesky',[{kind:'image',alt:'A blue bicycle'}],f.helpers,'a');
 assert.equal(field.value,'A blue bicycle'); assert.equal(result.applied,1);assert.equal(result.status,'attempted');
 assert.deepEqual(f.events,['fill:A blue bicycle']);
});
test('two descriptions map one-to-one only if exactly two editors',async()=>{
 const f=fixture();f.fields.push(f.element({placeholder:'Image description'}),f.element({placeholder:'Write alt text'}));
 const result=await f.apply('instagram',[{kind:'image',alt:'First'},{kind:'image',alt:'Second'}],f.helpers,'b');
 assert.deepEqual(f.fields.map(x=>x.value),['First','Second']); assert.equal(result.applied,2);
});
test('existing manual destination alt text is never overwritten',async()=>{
 const f=fixture();const input=f.element({placeholder:'Alt text',value:'Destination description'});f.fields.push(input);
 const result=await f.apply('mastodon',[{kind:'image',alt:'Source description'}],f.helpers,'c');
 assert.equal(input.value,'Destination description');assert.equal(result.applied,0);
});
test('mixed albums are refused, no edits',async()=>{
 const f=fixture();f.fields.push(f.element({placeholder:'Alt text'}));
 const result=await f.apply('x',[{kind:'image',alt:'Photo'},{kind:'video',alt:''}],f.helpers,'d');
 assert.equal(result.status,'review');assert.equal(f.events.length,0);
});
test('missing descriptions do not invent text',async()=>{
 const f=fixture();const result=await f.apply('facebook',[{kind:'image',alt:''}],f.helpers,'e');
 assert.equal(result.status,'missing');assert.equal(f.events.length,0);
});
test('only named alt buttons and named Save are clicked, never Post',async()=>{
 const f=fixture();
 const input=f.element({placeholder:'Alt text'});
 const post=f.element({text:'Post'}), save=f.element({text:'Save'});
 f.controls.push(f.element({text:'+ALT',onClick(){f.openDialog();f.fields.push(input);f.controls.push(save);}}),post);
 const r=await f.apply('bluesky',[{kind:'image',alt:'Nice hat'}],f.helpers,'f');
 assert.equal(r.applied,1);assert.deepEqual(f.events,['click:+ALT','fill:Nice hat','click:Save']);
});
test('mismatched alt controls do not risk wrong image mapping',async()=>{
 const f=fixture(); f.controls.push(f.element({text:'+ALT'}));
 const r=await f.apply('x',[{kind:'image',alt:'A'},{kind:'image',alt:'B'}],f.helpers,'g');
 assert.equal(r.status,'review');assert.equal(r.applied,0);assert.equal(f.events.length,0);
});
