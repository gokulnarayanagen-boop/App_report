import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseSummary,overdue,normalizeFilters,mentionedIds,validateMedia,todayISO} from '../dist/workflows.js';
import {filterIssues,Repository} from '../dist/data.js';
test('release readiness excludes trash and counts only active blockers',()=>{
 const rows=[{release_id:'r',severity:'Blocker',status:'Open'},{release_id:'r',severity:'Major',status:'Closed'},{release_id:'r',severity:'Blocker',status:'Open',deleted_at:'2026-10-27'},{release_id:'other',status:'Open'}];
 assert.deepEqual(releaseSummary('r',rows),{total:2,open:1,closed:1,blockers:1,progress:50,ready:false});
 rows[0].status='Closed';assert.equal(releaseSummary('r',rows).ready,true);assert.equal(releaseSummary('empty',rows).ready,false);
});
test('overdue checks use calendar dates and exclude closed or deleted reports',()=>{
 assert.equal(overdue({due_date:'2026-10-26',status:'Open'},'2026-10-27'),true);
 assert.equal(overdue({due_date:'2026-10-27',status:'Open'},'2026-10-27'),false);
 assert.equal(overdue({due_date:'2026-10-26',status:'Closed'},'2026-10-27'),false);
 assert.equal(overdue({due_date:'2026-10-26',status:'Open',deleted_at:'today'},'2026-10-27'),false);
});
test('saved filters discard unexpected keys and preserve only expected types',()=>{const f=normalizeFilters({severity:'Blocker',mine:'true',evil:{role:'admin'},project:42});assert.equal(f.severity,'Blocker');assert.equal(f.mine,false);assert.equal(f.project,'');assert.equal('evil' in f,false);});
test('issue filters combine severity, release, deadlines and report state',()=>{
 const rows=[{id:'good',severity:'Blocker',release_id:'r',due_date:todayISO(),status:'Open'},{id:'other',severity:'Major',release_id:null,status:'Open'}];
 assert.deepEqual(filterIssues(rows,{severity:'Blocker',release:'r',due:'today'},'u').map(i=>i.id),['good']);
 assert.deepEqual(filterIssues(rows,{release:'none',due:'undated'},'u').map(i=>i.id),['other']);
});
test('mentions match complete handles, ignore disabled profiles and deduplicate',()=>{const people=[{id:'1',username:'gokul',active:true},{id:'2',username:'gokul.dev',active:true},{id:'3',username:'disabled',active:false}];assert.deepEqual(mentionedIds('Please @gokul, @GOKUL and @gokul.dev review. @disabled',people),['1','2']);assert.deepEqual(mentionedIds('Email x@gokul and @gokulunknown',people),[]);});
test('media validation enforces type-specific limits and demo quota',()=>{assert.equal(validateMedia({type:'video/mp4',size:52428800}),'video');assert.equal(validateMedia({type:'image/png',size:10485760}),'image');assert.throws(()=>validateMedia({type:'video/webm',size:52428801}));assert.throws(()=>validateMedia({type:'image/png',size:10485761}));assert.throws(()=>validateMedia({type:'text/html',size:20}));assert.throws(()=>validateMedia({type:'video/mp4',size:1500001},true));});
test('session mismatch blocks writes before they reach the database',async()=>{const repo=new Repository();repo.user={id:'admin'};let wrote=false;repo.db={auth:{getSession:async()=>({data:{session:{user:{id:'tester'}}},error:null})},from:()=>{wrote=true;throw new Error('Should not write');}};await assert.rejects(repo.insert('projects',{created_by:'admin'}),e=>e.code==='SESSION_CHANGED');assert.equal(wrote,false);});
test('session refresh adopts the current account and detects sign-out',async()=>{const repo=new Repository();repo.user={id:'old'};repo.db={auth:{getSession:async()=>({data:{session:{user:{id:'new'}}},error:null})}};await repo.syncSession(true);assert.equal(repo.user.id,'new');repo.db.auth.getSession=async()=>({data:{session:null},error:null});await assert.rejects(repo.syncSession(true),e=>e.code==='SESSION_CHANGED');});
