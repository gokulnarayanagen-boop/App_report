import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
export const STATUSES=['Open','In progress','Ready for testing','Closed'];
export const PRIORITIES=['Low','Medium','High','Critical'];
export const TYPES=['Bug','Improvement','Feature'];
export const uid=()=>crypto.randomUUID();
export const DEMO_KEY='gnits-demo-v1';
let clientPromise;
export async function getClient(){
 if(!clientPromise) clientPromise=import('https://esm.sh/@supabase/supabase-js@2.57.4').then(({createClient})=>createClient(SUPABASE_URL,SUPABASE_KEY));
 try{return await clientPromise;}catch{clientPromise=null;throw new Error('Could not load the connection library. Check your internet connection and retry.');}
}
export function demoSeed(){
 const now=Date.now(),ago=n=>new Date(now-n*3600000).toISOString();
 const people=[['a1111111-1111-4111-8111-111111111111','Gokul','gokul@example.com','admin'],['a2222222-2222-4222-8222-222222222222','Ananya Rao','ananya@example.com','tester'],['a3333333-3333-4333-8333-333333333333','Rahul Kumar','rahul@example.com','developer'],['a4444444-4444-4444-8444-444444444444','Sneha Reddy','sneha@example.com','tester']].map(([id,full_name,email,role])=>({id,full_name,email,role,active:true,created_at:ago(240)}));
 const projects=[['b1111111-1111-4111-8111-111111111111','Campus Connect','CAMP','The everyday campus companion.','#7860dc'],['b2222222-2222-4222-8222-222222222222','Student Portal','STUD','A better home for student services.','#e59454'],['b3333333-3333-4333-8333-333333333333','Faculty Hub','FAC','Tools that give faculty time back.','#5b9b87']].map(([id,name,prefix,description,color])=>({id,name,prefix,description,color,archived:false,created_by:people[0].id,created_at:ago(200)}));
 const titles=['Login screen freezes after entering OTP','Attendance count does not refresh','Add dark mode to the student dashboard','Push notifications arrive twice','Timetable overlaps on smaller screens','Improve the course search experience','Profile photo fails to upload','Export attendance as a spreadsheet','Password reset link expires too early','Show empty state for announcements','Assignment due date shows wrong timezone','Add a confirmation before signing out'];
 const statuses=['Open','In progress','Open','Ready for testing','Open','In progress','Ready for testing','Closed','Open','Closed','In progress','Closed'];
 const priorities=['Critical','High','Low','High','Medium','Medium','High','Low','High','Low','Medium','Low'];
 const issues=titles.map((summary,n)=>({id:uid(),issue_no:n+1,summary,project_id:projects[n%3].id,status:statuses[n],priority:priorities[n],type:n===2||n===7?'Feature':n===5||n===9||n===11?'Improvement':'Bug',description:n===0?'The login screen becomes unresponsive after a valid OTP is entered. This blocks students from accessing the app.':'Reported during the latest round of testing. Please review the reproduction steps and verify on the listed device.',steps:'1. Open the app and sign in.\n2. Navigate to the affected screen.\n3. Repeat the action and observe the result.',expected:'The action completes successfully and the interface stays responsive.',actual:'The screen does not display the expected result.',app_version:'1.4.2',device:n%2?'Chrome · Windows 11':'Android 14 · Pixel 7',assignee_id:n%3?people[2].id:null,created_by:people[n%2?3:1].id,duplicate_of:null,created_at:ago(4+n*9),updated_at:ago(n*3)}));
 const members=projects.flatMap(p=>people.slice(1).map(u=>({project_id:p.id,user_id:u.id})));
 const activity=issues.slice(0,8).map((i,n)=>({id:uid(),project_id:i.project_id,issue_id:i.id,actor_id:n%2?people[2].id:i.created_by,message:n%2?'changed status to '+i.status:'created this issue',created_at:ago(n*2+.5)}));
 return {profiles:people,projects,project_members:members,issues,comments:[],attachments:[],activity,notifications:[{id:uid(),user_id:people[0].id,project_id:projects[0].id,issue_id:issues[0].id,message:'Login screen freezes after entering OTP — created this issue',read_at:null,created_at:ago(1)}]};
}
export class Repository {
 constructor(demo=false){this.demo=demo;this.db=null;this.store=null;this.user=null;this.channel=null;}
 async init(){
  if(this.demo){try{this.store=JSON.parse(localStorage.getItem(DEMO_KEY));}catch{}if(!this.store)this.store=demoSeed();this.user={id:this.store.profiles[0].id,email:this.store.profiles[0].email};return this.user;}
  this.db=await getClient();const {data,error}=await this.db.auth.getSession();if(error)throw error;this.user=data.session?.user||null;return this.user;
 }
 async login(identifier,password){
  this.db=await getClient();identifier=identifier.trim();
  if(identifier.includes('@')){const {data,error}=await this.db.auth.signInWithPassword({email:identifier,password});if(error)throw error;this.user=data.user;return data.user;}
  const response=await fetch(SUPABASE_URL+'/functions/v1/username-login',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify({username:identifier.toLowerCase(),password})});
  let result;try{result=await response.json();}catch{throw new Error('Username sign-in is unavailable. Use your email for now.');}
  if(!response.ok)throw new Error(result.error||'Username sign-in is unavailable. Deploy the username-login function, or sign in with your email.');
  const {data,error}=await this.db.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});if(error)throw error;this.user=data.user;return data.user;
 }
 async logout(){this.channel&&await this.db?.removeChannel(this.channel);if(!this.demo&&this.db){const {error}=await this.db.auth.signOut();if(error)throw error;}this.user=null;}
 persist(){try{localStorage.setItem(DEMO_KEY,JSON.stringify(this.store));}catch{throw new Error('Demo storage is full. Remove a screenshot or reset the demo.');}}
 async all(table){if(this.demo)return structuredClone(this.store[table]||[]);const rows=[];for(let offset=0;;offset+=1000){const {data,error}=await this.db.from(table).select('*').order(table==='project_members'?'project_id':'id').range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}return rows;}
 async load(){const tables=['profiles','projects','project_members','issues','activity','notifications'];const values=await Promise.all(tables.map(t=>this.all(t)));return Object.fromEntries(tables.map((t,n)=>[t,values[n]]));}
 demoEvent(issue,message){this.store.activity.unshift({id:uid(),project_id:issue.project_id,issue_id:issue.id,actor_id:this.user.id,message,created_at:new Date().toISOString()});}
 async insert(table,values){
  if(this.demo){const row={id:uid(),created_at:new Date().toISOString(),...values};if(table==='issues'){row.issue_no=Math.max(0,...this.store.issues.map(i=>i.issue_no))+1;row.updated_at=row.created_at;this.demoEvent(row,'created this issue');}if(table==='comments')this.demoEvent(this.store.issues.find(i=>i.id===row.issue_id),'added a comment');this.store[table].push(row);this.persist();return structuredClone(row);}
  const {data,error}=await this.db.from(table).insert(values).select().single();if(error)throw error;return data;
 }
 async update(table,id,values){if(this.demo){const row=this.store[table].find(r=>r.id===id);if(!row)throw new Error('Record not found');const before={...row};Object.assign(row,values);if(table==='issues'){row.updated_at=new Date().toISOString();this.demoEvent(row,before.status!==row.status?'changed status to '+row.status:'updated this issue');}this.persist();return structuredClone(row);}const {data,error}=await this.db.from(table).update(values).eq('id',id).select().single();if(error)throw error;return data;}
 async memberships(projectId,userIds){
  // Add first: existing access is preserved if a subsequent request fails.
  const current=(await this.all('project_members')).filter(m=>m.project_id===projectId).map(m=>m.user_id);
  const add=userIds.filter(id=>!current.includes(id)),remove=current.filter(id=>!userIds.includes(id));
  if(this.demo){this.store.project_members=this.store.project_members.filter(m=>m.project_id!==projectId);this.store.project_members.push(...userIds.map(user_id=>({project_id:projectId,user_id})));this.persist();return;}
  if(add.length){const {error}=await this.db.from('project_members').insert(add.map(user_id=>({project_id:projectId,user_id})));if(error)throw error;}
  if(remove.length){const {error}=await this.db.from('project_members').delete().eq('project_id',projectId).in('user_id',remove);if(error)throw error;}
 }
 async details(id){if(this.demo)return {comments:structuredClone(this.store.comments.filter(c=>c.issue_id===id)),attachments:structuredClone(this.store.attachments.filter(c=>c.issue_id===id))};const [c,a]=await Promise.all([this.db.from('comments').select('*').eq('issue_id',id).order('created_at'),this.db.from('attachments').select('*').eq('issue_id',id).order('created_at')]);if(c.error||a.error)throw c.error||a.error;return{comments:c.data,attachments:a.data};}
 async upload(issue,file){
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>10485760||file.size===0)throw new Error('Use PNG, JPEG, WebP, or GIF images up to 10 MB.');
  const path=`${issue.project_id}/${issue.id}/${uid()}.${file.type.split('/')[1]}`;
  const values={issue_id:issue.id,path,name:file.name,mime_type:file.type,size:file.size,created_by:this.user.id};
  if(this.demo){if(file.size>1500000)throw new Error('Demo images must be smaller than 1.5 MB. Live uploads support 10 MB.');values.demo_url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});return this.insert('attachments',values);}
  const {error}=await this.db.storage.from('issue-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
  try{return await this.insert('attachments',values);}catch(e){await this.db.storage.from('issue-images').remove([path]);throw e;}
 }
 async imageUrl(attachment){if(this.demo)return attachment.demo_url;const {data,error}=await this.db.storage.from('issue-images').createSignedUrl(attachment.path,600);if(error)throw error;return data.signedUrl;}
 async removeAttachment(a){if(this.demo){this.store.attachments=this.store.attachments.filter(r=>r.id!==a.id);this.persist();return;}const {error}=await this.db.storage.from('issue-images').remove([a.path]);if(error)throw error;const {error:e}=await this.db.from('attachments').delete().eq('id',a.id);if(e)throw e;}
 async admin(values){if(this.demo){if(values.action==='create')return this.insert('profiles',{full_name:values.full_name,email:values.email,username:values.username,role:values.role,active:true});if(values.action==='set-username'){const username=values.username.trim().toLowerCase();if(this.store.profiles.some(u=>u.username===username&&u.id!==values.user_id))throw new Error('That username is already in use.');return this.update('profiles',values.user_id,{username});}if(values.action==='update')return this.update('profiles',values.user_id,{role:values.role,active:values.active});return {ok:true};}const {data,error}=await this.db.functions.invoke('admin-users',{body:values});if(error){let message='Account management is unavailable. Deploy the admin-users function from the setup guide.';try{const b=await error.context?.json();if(b?.error)message=b.error;}catch{}throw new Error(message);}if(data.error)throw new Error(data.error);return data;}
 async changePassword(password){if(this.demo)return;const {error}=await this.db.auth.updateUser({password});if(error)throw error;}
 subscribe(callback){if(this.demo)return;this.channel=this.db.channel('workspace-'+this.user.id).on('postgres_changes',{event:'*',schema:'public',table:'issues'},callback).on('postgres_changes',{event:'*',schema:'public',table:'notifications'},callback).subscribe();}
}
export function filterIssues(issues,filters,userId){return issues.filter(i=>(!filters.project||i.project_id===filters.project)&&(!filters.status||i.status===filters.status)&&(!filters.priority||i.priority===filters.priority)&&(!filters.type||i.type===filters.type)&&(!filters.mine||i.assignee_id===userId)&&(!filters.search||`${i.summary} ${i.description} ${i.issue_no}`.toLowerCase().includes(filters.search.toLowerCase())));}
export function csvValue(value){const text=String(value??'');const safe=/^[\s]*[=+\-@\t\r]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';}
