import test from 'node:test';
import assert from 'node:assert/strict';
import {filterIssues,csvValue,demoSeed} from '../dist/data.js';
test('combined filters isolate project, status, priority, type, assignee, and search',()=>{
 const rows=[{project_id:'a',status:'Open',priority:'High',type:'Bug',assignee_id:'u',summary:'Login blocked',description:'OTP',issue_no:21},{project_id:'b',status:'Open',priority:'High',type:'Bug',assignee_id:'u',summary:'Login blocked',description:'OTP',issue_no:22},{project_id:'a',status:'Closed',priority:'High',type:'Bug',assignee_id:'u',summary:'Login blocked',description:'OTP',issue_no:23}];
 assert.equal(filterIssues(rows,{project:'a',status:'Open',priority:'High',type:'Bug',mine:true,search:'otp'},'u').length,1);
 assert.equal(filterIssues(rows,{mine:true},'other').length,0);
 assert.equal(filterIssues(rows,{search:'21'},'u')[0].issue_no,21);
});
test('CSV exports neutralize spreadsheet formulas and escape quotes',()=>{
 for(const value of ['=HYPERLINK("bad")','+1+1','-1+1','@SUM(1)','  =1','\t=1'])assert.ok(csvValue(value).startsWith('"\''));
 assert.equal(csvValue('He said "hello"'),'"He said ""hello"""');
 assert.equal(csvValue('line\none'),'"line\none"');
});
test('demo records reference existing projects, reporters, and memberships',()=>{
 const data=demoSeed();assert.equal(data.projects.length,3);assert.equal(data.issues.length,12);
 for(const issue of data.issues){assert.ok(data.projects.some(p=>p.id===issue.project_id));assert.ok(data.profiles.some(p=>p.id===issue.created_by));}
 assert.equal(new Set(data.issues.map(i=>i.id)).size,12);
});
