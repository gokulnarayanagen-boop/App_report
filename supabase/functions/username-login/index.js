import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const invalid=()=>reply({error:'Invalid username or password.'},401);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const {username:raw,password}=await req.json();
  const username=String(raw||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)||typeof password!=='string'||!password||password.length>4096)return invalid();
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const publicKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey=publicKeys.default||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY');
  if(!secret||!publicKey)return reply({error:'Username sign-in is not configured yet.'},503);
  const url=Deno.env.get('SUPABASE_URL'),config={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,secret,config);
  const {data:allowed,error:limitError}=await admin.rpc('consume_username_login',{login_name:username});
  if(limitError)return reply({error:'Username sign-in setup is incomplete.'},503);
  if(!allowed)return reply({error:'Too many attempts. Wait 15 minutes or sign in with your email.'},429);
  const {data:profile,error}=await admin.from('profiles').select('id,email,active').eq('username',username).maybeSingle();
  if(error)return reply({error:'Username sign-in setup is incomplete.'},503);
  // A missing or disabled user still goes through password authentication to avoid a lookup-only endpoint.
  const email=profile?.active?profile.email:'username-login-unavailable@invalid.example';
  const auth=createClient(url,publicKey,config);
  const {data,error:authError}=await auth.auth.signInWithPassword({email,password});
  if(authError||!profile?.active||!data.session||data.user?.id!==profile.id)return invalid();
  return reply({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return invalid();}
});
