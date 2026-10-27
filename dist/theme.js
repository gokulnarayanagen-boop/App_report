// Run before styles load so a saved dark preference never flashes a light page.
(() => {
 const key='gnits-theme';
 const system=window.matchMedia('(prefers-color-scheme: dark)');
 let preference='system';
 try { const saved=localStorage.getItem(key);if(['light','dark','system'].includes(saved))preference=saved; } catch {}
 function apply(next=preference,save=false){
  if(!['light','dark','system'].includes(next))return;
  preference=next;
  const dark=preference==='dark'||preference==='system'&&system.matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.dataset.themePreference=preference;
  document.documentElement.style.colorScheme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#14141d':'#f6f5f9');
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(button=>{
   const label=dark?'Switch to light mode':'Switch to dark mode';
   button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));
  });
  document.querySelectorAll('[data-theme-select]').forEach(select=>select.value=preference);
  if(save)try{localStorage.setItem(key,preference);}catch{}
 }
 window.GnitsTheme={apply:next=>apply(next,true),toggle:()=>apply(document.documentElement.dataset.theme==='dark'?'light':'dark',true)};
 system.addEventListener('change',()=>{if(preference==='system')apply();});
 window.addEventListener('storage',event=>{if(event.key===key)apply(['light','dark','system'].includes(event.newValue)?event.newValue:'system');});
 apply();
})();
