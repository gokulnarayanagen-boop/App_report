import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../supabase/functions/username-login/index.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
function fixture({exists=true,active=true,valid=true,allowed=true}={}){
 let handler;const seen=[];
 const admin={rpc:async()=>({data:allowed,error:null}),from:()=>({select:()=>({eq:(field,username)=>{seen.push({field,username});return {maybeSingle:async()=>({data:exists?{id:'member',email:'private@example.com',active}:null,error:null})};}})})};
 const auth={auth:{signInWithPassword:async credentials=>{seen.push(credentials);return {data:valid?{user:{id:'member'},session:{access_token:'access',refresh_token:'refresh'}}:{},error:valid?null:new Error('Invalid credentials')};}}};
 vm.runInNewContext(source,{createClient:(_url,key)=>key==='secret'?admin:auth,Deno:{env:{get:key=>({SUPABASE_SECRET_KEYS:'{"default":"secret"}',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public"}',SUPABASE_URL:'https://test.example'}[key])},serve:fn=>handler=fn},Response});
 return {seen,call:async(body,method='POST')=>{const r=await handler(new Request('https://test.example',{method,...(method==='POST'?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:method==='OPTIONS'?null:await r.json()};}};
}
test('username login normalizes name, verifies password, and returns only session tokens',async()=>{const f=fixture();const r=await f.call({username:'  GoKul  ',password:'private-password'});assert.equal(r.status,200);assert.equal(f.seen[0].username,'gokul');assert.equal(f.seen[1].password,'private-password');assert.deepEqual(r.body,{access_token:'access',refresh_token:'refresh'});});
test('unknown, disabled, and wrong-password accounts return the same error',async()=>{const responses=[];for(const opts of [{exists:false},{active:false},{valid:false}]){const r=await fixture(opts).call({username:'gokul',password:'wrong'});assert.equal(r.status,401);responses.push(r.body);}assert.deepEqual(responses[0],responses[1]);assert.deepEqual(responses[1],responses[2]);});
test('throttled login never reaches password authentication',async()=>{const f=fixture({allowed:false});assert.equal((await f.call({username:'gokul',password:'password'})).status,429);assert.equal(f.seen.length,0);});
test('invalid usernames and missing passwords are rejected before lookup',async()=>{for(const body of [{username:'a@b.com',password:'password'},{username:'ab',password:'password'},{username:'gokul'}]){const f=fixture();assert.equal((await f.call(body)).status,401);assert.equal(f.seen.length,0);}});
test('username function supports CORS preflight and refuses GET',async()=>{assert.equal((await fixture().call({},'OPTIONS')).status,200);assert.equal((await fixture().call({},'GET')).status,405);});
