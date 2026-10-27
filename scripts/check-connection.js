import {SUPABASE_URL,SUPABASE_KEY} from '../dist/config.js';
for(const endpoint of ['/auth/v1/settings','/rest/v1/projects?select=id&limit=0']){
 try{const r=await fetch(SUPABASE_URL+endpoint,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(15000)});const body=await r.json();console.log(JSON.stringify({endpoint,status:r.status,...(endpoint.includes('settings')?{signup_disabled:body.disable_signup}:{code:body.code,message:body.message})}));}catch(e){console.log(JSON.stringify({endpoint,error:e.message}));}
}
