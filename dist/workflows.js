export const SEVERITIES=['Cosmetic','Minor','Major','Blocker'];
export const RELEASE_STATUSES=['Planned','Testing','Released'];
export const MEDIA_TYPES=['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];
export const DEFAULT_FILTERS={project:'',status:'',priority:'',type:'',severity:'',release:'',due:'',search:'',mine:false};
export const BUILTIN_TEMPLATES=[
 {id:'builtin-bug',name:'Bug report',type:'Bug',priority:'Medium',severity:'Major',description:'Describe the problem and who is affected.',steps:'1. Open…\n2. Navigate to…\n3. Observe…',expected:'What should happen?',actual:'What happens instead?'},
 {id:'builtin-improvement',name:'Improvement request',type:'Improvement',priority:'Medium',severity:'Minor',description:'Current experience:\n\nSuggested improvement:\n\nWho benefits and why:',steps:'',expected:'Describe the improved experience.',actual:'Describe the current limitation.'},
 {id:'builtin-feature',name:'Feature request',type:'Feature',priority:'Low',severity:'Minor',description:'As a [user], I want [capability], so that [benefit].\n\nAcceptance criteria:\n- ',steps:'',expected:'How will we know this feature is complete?',actual:''}
];
export function normalizeFilters(value={}){return Object.fromEntries(Object.keys(DEFAULT_FILTERS).map(k=>[k,k==='mine'?value[k]===true:typeof value[k]==='string'?value[k]:DEFAULT_FILTERS[k]]));}
export function todayISO(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function overdue(issue,today=todayISO()){return !!issue.due_date&&issue.due_date<today&&issue.status!=='Closed'&&!issue.deleted_at;}
export function releaseSummary(releaseId,issues){const rows=issues.filter(i=>i.release_id===releaseId&&!i.deleted_at),open=rows.filter(i=>i.status!=='Closed'),closed=rows.length-open.length;return {total:rows.length,open:open.length,closed,blockers:open.filter(i=>i.severity==='Blocker').length,progress:rows.length?Math.round(closed/rows.length*100):0,ready:rows.length>0&&open.length===0};}
export function mentionHandle(profile){return profile.username||'member_'+profile.id.replaceAll('-','').slice(0,12);}
export function mentionedIds(body,profiles){const handles=new Set([...body.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9_.-]*)/gi)].map(m=>m[1].toLowerCase().replace(/[.,-]+$/,'')));return profiles.filter(p=>p.active&&(handles.has(mentionHandle(p).toLowerCase())||new RegExp('(?:^|\\s)@'+mentionHandle(p).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[\\s,!?;:])','i').test(body))).map(p=>p.id);}
export function validateMedia(file,demo=false){const video=file.type.startsWith('video/');if(!MEDIA_TYPES.includes(file.type)||!file.size)throw new Error('Use PNG, JPEG, WebP, GIF, MP4, WebM, or MOV files.');if(file.size>(video?52428800:10485760))throw new Error(video?'Recordings must be 50 MB or smaller.':'Images must be 10 MB or smaller.');if(demo&&file.size>1500000)throw new Error('Demo attachments must be smaller than 1.5 MB. Live recordings support 50 MB.');return video?'video':'image';}
