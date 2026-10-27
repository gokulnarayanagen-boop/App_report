import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const respond = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 if(req.method!=='POST') return respond({error:'Method not allowed'},405);
 try {
  // JWT verification happens here even though the gateway check is disabled.
  const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const secret=keys.default||Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret) return respond({error:'Server configuration is missing'},503);
  const db=createClient(Deno.env.get('SUPABASE_URL'),secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) return respond({error:'Sign in first'},401);
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user) return respond({error:'Session expired. Sign in again.'},401);
  const {data:caller,error:callerError}=await db.from('profiles').select('role,active').eq('id',user.id).single();
  if(callerError||caller?.role!=='admin'||!caller.active) return respond({error:'Administrator access required'},403);
  const body=await req.json();
  if(body.action==='create') {
   const name=String(body.full_name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   const role=body.role;
   const username=String(body.username||'').trim().toLowerCase();
   if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return respond({error:'Username must be 3–32 characters: letters, numbers, dots, underscores, or hyphens.'},400);
   if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||!['tester','developer','admin'].includes(role)) return respond({error:'Enter a name, valid email, role, and a password of at least 12 characters.'},400);
   const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
   if(error) return respond({error:error.message},400);
   const {error:profileError}=await db.from('profiles').update({role,full_name:name,username}).eq('id',data.user.id);
   if(profileError) { await db.auth.admin.deleteUser(data.user.id); return respond({error:profileError.code==='23505'?'That username is already in use.':'Account could not be provisioned. Apply both database migrations.'},400); }
   return respond({id:data.user.id});
  }
  if(body.action==='set-username') {
   const username=String(body.username||'').trim().toLowerCase();
   if(!body.user_id||!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return respond({error:'Enter a valid username of 3–32 characters.'},400);
   const {data,error}=await db.from('profiles').update({username}).eq('id',body.user_id).select('id').single();
   if(error||!data) return respond({error:error?.code==='23505'?'That username is already in use.':'Username could not be saved. Apply the username migration and select an existing account.'},400);
   return respond({ok:true});
  }
  if(body.action==='update') {
   if(body.user_id===user.id) return respond({error:'You cannot disable or change your own administrator account.'},400);
   if(!['tester','developer','admin'].includes(body.role)||typeof body.active!=='boolean') return respond({error:'Invalid role or account status'},400);
   const {data:target,error:targetError}=await db.from('profiles').select('id').eq('id',body.user_id).single();
   if(targetError||!target) return respond({error:'Account not found'},404);
   const {error}=await db.from('profiles').update({role:body.role,active:body.active}).eq('id',body.user_id);
   if(error) throw error;
   return respond({ok:true});
  }
  if(body.action==='reset-password') {
   if(!body.user_id||String(body.password||'').length<12) return respond({error:'A password of at least 12 characters is required'},400);
   const {error}=await db.auth.admin.updateUserById(body.user_id,{password:body.password});
   if(error) return respond({error:error.message},400);
   return respond({ok:true});
  }
  return respond({error:'Unknown action'},400);
 } catch(error) { console.error('admin-users failed',error.message); return respond({error:'Account action failed. Check the function logs.'},500); }
});
