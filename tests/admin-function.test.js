import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../supabase/functions/admin-users/index.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
function fixture({role='admin',active=true,valid=true}={}){
 let handler,created=0;
 const client={auth:{getUser:async()=>({data:{user:valid?{id:'caller'}:null},error:valid?null:new Error('bad token')}),admin:{createUser:async()=>{created++;return {data:{user:{id:'new-user'}},error:null};},deleteUser:async()=>({error:null})}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role,active},error:null})})}),update:()=>({eq:()=>({then:resolve=>resolve({error:null}),select:()=>({single:async()=>({data:{id:'caller'},error:null})})})})})};
 vm.runInNewContext(source,{createClient:()=>client,Deno:{env:{get:key=>({SUPABASE_SECRET_KEYS:'{"default":"server-test-key"}',SUPABASE_URL:'https://test.example'}[key])},serve:fn=>handler=fn},Response,console});
 return {call:async(body,token='Bearer user-test-token')=>{const headers={'Content-Type':'application/json'};if(token)headers.Authorization=token;const r=await handler(new Request('https://test.example/functions/v1/admin-users',{method:'POST',headers,body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};},count:()=>created};
}
const account={action:'create',full_name:'Sample Tester',username:'sample.tester',email:'sample@example.com',password:'sample-password-123',role:'tester'};
test('account function rejects missing and invalid user sessions',async()=>{assert.equal((await fixture().call(account,'')).status,401);assert.equal((await fixture({valid:false}).call(account)).status,401);});
test('account function rejects tester, developer, and disabled administrator callers',async()=>{for(const setting of [{role:'tester'},{role:'developer'},{active:false}]){const f=fixture(setting);assert.equal((await f.call(account)).status,403);assert.equal(f.count(),0);}});
test('only active admin can create a validated account',async()=>{const f=fixture();assert.equal((await f.call({...account,password:'short'})).status,400);assert.equal((await f.call({...account,role:'superuser'})).status,400);assert.equal(f.count(),0);assert.equal((await f.call(account)).status,200);assert.equal(f.count(),1);});
test('administrator cannot disable their own account',async()=>{assert.equal((await fixture().call({action:'update',user_id:'caller',role:'tester',active:false})).status,400);});

test('admin can set their own username without changing role or active status',async()=>{const result=await fixture().call({action:'set-username',user_id:'caller',username:'gokul'});assert.equal(result.status,200);});
test('only admins can assign usernames and invalid names are rejected',async()=>{assert.equal((await fixture({role:'tester'}).call({action:'set-username',user_id:'caller',username:'gokul'})).status,403);for(const username of ['ab','a@b.com','contains spaces'])assert.equal((await fixture().call({action:'set-username',user_id:'caller',username})).status,400);});
