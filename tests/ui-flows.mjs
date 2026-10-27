const {Window}=await import(process.argv[2]);
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Repository,STATUSES,PRIORITIES,TYPES,filterIssues,csvValue,DEMO_KEY} from '../dist/data.js';
import * as workflows from '../dist/workflows.js';
const window=new Window({url:'https://gnits.test/',settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
window.document.body.innerHTML='<div id="app"></div><div id="modal-root"></div><div id="toast-root"></div>';
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
window.scrollTo=()=>{};window.history.replaceState=()=>{};
window.GnitsTheme={toggle(){},apply(){}};
Object.assign(window,{Repository,STATUSES,PRIORITIES,TYPES,filterIssues,csvValue,DEMO_KEY,SUPABASE_URL:'https://test.supabase.co',...workflows});
globalThis.localStorage=window.localStorage;
// Stop automatic startup; the tests enter demo mode deliberately below.
let source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export const esc','const esc').replace(/^boot\(\);$/m,'').replace(/^setInterval\(.*$/m,'');
window.eval(source+`\nwindow.testApp={get repo(){return repo;},get data(){return data;},get me(){return me;},navigate,issueForm,releaseForm,templateForm,bulkForm,load,render,openIssue,closeModal,actions,applyTemplate,renderComment,get filters(){return filters;},set filters(v){filters=v;},get selected(){return selectedIssues;},get view(){return view;}};`);
const app=window.testApp;
const settle=async()=>{for(let n=0;n<8;n++)await new Promise(r=>setImmediate(r));};
const query=s=>window.document.querySelector(s);
const click=async selector=>{const el=query(selector);assert.ok(el,`Missing ${selector}`);el.click();await settle();};
const change=async(selector,value)=>{const el=query(selector);assert.ok(el,`Missing ${selector}`);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));await settle();};
const submit=async(selector='dialog form')=>{const form=query(selector);assert.ok(form);form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();};
await app.actions.demo();await settle();assert.equal(app.data.releases.length,3);assert.ok(query('[data-view="releases"]'));
app.navigate('releases');assert.equal(query('.release-grid').children.length,3);app.releaseForm();query('[name="name"]').value='QA Release';query('[name="version"]').value='2.0';await submit();assert.ok(app.data.releases.some(r=>r.version==='2.0'));
app.navigate('templates');app.templateForm();query('[name="name"]').value='QA template';query('[name="description"]').value='A custom template prompt';await submit();assert.ok(app.data.issue_templates.some(t=>t.name==='QA template'));
const template=app.data.issue_templates.find(t=>t.name==='QA template');app.issueForm(null,template.id);assert.equal(query('[name="description"]').value,'A custom template prompt');query('[name="summary"]').value='QA issue with release and deadline';query('[name="severity"]').value='Blocker';query('[name="due_date"]').value='2026-11-10';query('[name="release_id"]').value=app.data.releases.find(r=>r.project_id===template.project_id).id;await submit();
const issue=app.data.issues.find(i=>i.summary==='QA issue with release and deadline');assert.ok(issue);assert.equal(issue.severity,'Blocker');assert.equal(issue.due_date,'2026-11-10');assert.ok(query('[data-action="record-screen"]'));
query('[name="body"]').value='Please review ';await change('[data-mention-picker]',app.data.profiles.find(p=>p.role==='developer').id);assert.ok(query('[name="body"]').value.includes('@'));await submit('form[data-form="comment"]');assert.equal(app.repo.store.comments[0].mention_ids.length,1);assert.ok(query('.mention'));
app.closeModal();app.navigate('issues');await change('[data-filter="severity"]','Blocker');await click('[data-action="save-view"]');query('[name="name"]').value='QA blockers';await submit();assert.ok(app.data.saved_views.some(v=>v.name==='QA blockers'));
await click('[data-action="clear-filters"]');await change('[data-saved-view]',app.data.saved_views[0].id);assert.equal(app.filters.severity,'Blocker');
await click('[data-action="clear-filters"]');const checkbox=query('[data-select-issue="'+issue.id+'"]');assert.ok(checkbox);checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));await settle();await click('[data-action="bulk-edit"]');await change('[data-bulk-field]','priority');query('[name="bulk_value"]').value='Critical';await submit();assert.equal(app.data.issues.find(i=>i.id===issue.id).priority,'Critical');
await app.openIssue(issue.id);await click('[data-action="trash-issue"]');await click('[data-action="confirm-trash-issue"]');assert.ok(app.data.trash.some(i=>i.id===issue.id));app.navigate('trash');await click('[data-action="restore-issue"][data-id="'+issue.id+'"]');assert.ok(app.data.issues.some(i=>i.id===issue.id));
// Screen capture lifecycle uses a fake stream; real capture still needs browser permission.
globalThis.FileReader=window.FileReader;
class FakeRecorder extends window.EventTarget{
 static isTypeSupported(){return true;}
 constructor(){super();this.state='inactive';this.mimeType='video/webm';}
 start(){this.state='recording';}
 stop(){this.state='inactive';const event=new window.Event('dataavailable');event.data=new window.Blob(['sample recording'],{type:'video/webm'});this.dispatchEvent(event);this.dispatchEvent(new window.Event('stop'));}
}
window.MediaRecorder=FakeRecorder;
const fakeTrack=new window.EventTarget();fakeTrack.stop=()=>{};
Object.defineProperty(window.navigator,'mediaDevices',{value:{getDisplayMedia:async()=>({getTracks:()=>[fakeTrack],getVideoTracks:()=>[fakeTrack]})},configurable:true});
await app.openIssue(issue.id);await click('[data-action="record-screen"]');assert.ok(query('[data-action="stop-recording"]'));await click('[data-action="stop-recording"]');await new Promise(r=>setTimeout(r,25));await settle();assert.equal(app.repo.store.attachments.filter(a=>a.issue_id===issue.id&&a.mime_type==='video/webm').length,1);
assert.ok(query('video'));
app.closeModal();
assert.equal(app.renderComment('<script>alert(1)</script>',[]),'&lt;script&gt;alert(1)&lt;/script&gt;');
console.log('UI interactions passed: releases, custom templates, issue fields, mentions, saved filters, bulk edits, and trash/restore.');
await window.happyDOM.close();
