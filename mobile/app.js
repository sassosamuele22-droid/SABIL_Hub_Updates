import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://enzqritietjhrdezdkxj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tzzD7ia5MXerBKnREOzAvA_7duHc6Lr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={session:null,profile:null,profiles:[],currentPage:'home',subpageKind:null,subscriptions:[],deferredInstall:null,ownerEdit:false,events:[],eventFilter:'all',eventCalendarOpen:false,currentEvent:null,currentEntries:[],currentAttendance:[],teamCars:[],results:[],resultFilter:'all',announcements:[],files:[],fileFilter:'all',avatarCache:new Map()};

const safe=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials=(n='?')=>n.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>{if(!d)return'—';const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:String(d)};
const fmtTime=t=>t?String(t).slice(0,5):'—';
const fmtTs=t=>t?new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'';
const empty=t=>`<div class="empty">${safe(t)}</div>`;
const roleRank=r=>({owner:3,admin:2,driver:1}[String(r||'').toLowerCase()]||0);
const effectiveRole=p=>roleRank(p?.secondary_role)>roleRank(p?.role)?p.secondary_role:p?.role;
const isOwner=()=>effectiveRole(state.profile)==='owner';
const isManagement=()=>['owner','admin'].includes(String(effectiveRole(state.profile)||'').toLowerCase());
const normTag=v=>String(v||'').toLowerCase().replace(/[\s-]+/g,'_');
const hasTag=(p,t)=>Array.isArray(p?.role_tags)&&p.role_tags.some(x=>normTag(x)===normTag(t));
const simKey=v=>{const x=String(v||'').trim().toLowerCase();if(x.includes('iracing'))return 'iracing';if(x==='lmu'||x.includes('le mans'))return 'lmu';return 'other'};
const simMatches=(row,filter)=>filter==='all'||simKey(row?.simulation)===filter;
const simCount=(rows,filter)=>filter==='all'?rows.length:rows.filter(r=>simMatches(r,filter)).length;
const simFilters=(rows,active,attr)=>[['all','All'],['iracing','iRacing'],['lmu','Le Mans Ultimate']].map(([key,label])=>`<button type="button" class="filter-chip ${active===key?'active':''}" ${attr}="${key}" aria-pressed="${active===key?'true':'false'}">${label} (${simCount(rows,key)})</button>`).join('');
const LMU_EXTRA_TRACKS=['Long Beach','Road Atlanta'];
function lmuTrackOptions(){const existing=(state.events||[]).filter(e=>simKey(e.simulation)==='lmu').map(e=>e.track).filter(Boolean);return [...new Set([...existing,...LMU_EXTRA_TRACKS])].sort((a,b)=>String(a).localeCompare(String(b))).map(track=>`<option value="${safe(track)}"></option>`).join('')}
const trackField=(label,id,value='')=>`<div class="dialog-field"><label for="${id}">${safe(label)}</label><input id="${id}" list="lmuTrackOptions" value="${safe(value)}"><datalist id="lmuTrackOptions">${lmuTrackOptions()}</datalist></div>`;

const FILE_BUCKET='sabil-files';
const canManageLineup=en=>!!en&&(isManagement()||en.created_by===state.session?.user?.id);
const canManagePlanner=en=>!!en&&(isManagement()||en.created_by===state.session?.user?.id);
const scheduleLabel=x=>{
  const t=String(x?.item_type||x?.type||'').toLowerCase();
  if(t==='qualifying')return'Qualifying';
  if(t==='race_start')return'Race start';
  if(t==='stint')return'Stint';
  if(t==='practice')return'Practice';
  return x?.title||'Session';
};
const addMinutesLabel=(date,time,duration)=>{
  if(!date||!time||!Number(duration))return'—';
  const d=new Date(`${date}T${String(time).slice(0,5)}:00`);
  if(Number.isNaN(d.getTime()))return'—';
  d.setMinutes(d.getMinutes()+Number(duration));
  return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
};
async function notifyAllTeam(title,message,type='info',entityType=null,entityId=null){
  try{
    const {error}=await supabase.rpc('mobile_notify_all_team',{
      p_title:title,p_message:message||null,p_type:type||'info',
      p_entity_type:entityType||null,p_entity_id:entityId||null
    });
    if(error)console.warn('notifyAllTeam',error.message)
  }catch(e){console.warn('notifyAllTeam',e)}
}
async function notifyEntryTeam(entryId,title,message,type='lineup'){
  try{
    const {error}=await supabase.rpc('mobile_notify_entry_team',{
      p_entry_id:entryId,p_title:title,p_message:message||null,p_type:type||'lineup'
    });
    if(error)console.warn('notifyEntryTeam',error.message)
  }catch(e){console.warn('notifyEntryTeam',e)}
}
async function loadTeamCars(simulation=null){
  let q=supabase.from('team_cars').select('*').eq('active',true).order('car_name');
  if(simulation)q=q.eq('simulation',simulation);
  const {data,error}=await q;
  if(error){console.warn(error.message);return[]}
  return data||[]
}
const avatarSrc=p=>p?.avatarDisplayUrl||p?.avatar_url||'';
async function resolveStorageUrl(path,ttl=21600){
  const raw=String(path||'').trim();
  if(!raw)return'';
  if(/^https?:\/\//i.test(raw)||/^data:/i.test(raw))return raw;
  if(state.avatarCache.has(raw))return state.avatarCache.get(raw);
  try{
    const {data,error}=await supabase.storage.from(FILE_BUCKET).createSignedUrl(raw,ttl);
    const url=!error&&data?.signedUrl?data.signedUrl:raw;
    state.avatarCache.set(raw,url);
    return url;
  }catch{
    return raw;
  }
}
async function hydrateAvatar(p){
  if(!p)return p;
  return {...p,avatarDisplayUrl:await resolveStorageUrl(p.avatar_url)};
}
function avatarHtml(p,cls='profile-avatar'){
  const src=avatarSrc(p);
  return src?`<img src="${safe(src)}" alt="" class="${cls}" loading="lazy" referrerpolicy="no-referrer">`:initials(p?.full_name||p?.nickname);
}
const eventSortValue=e=>e?.event_date?Date.parse(`${e.event_date}T00:00:00`):Number.MAX_SAFE_INTEGER;
const sortEventsByDate=list=>[...(list||[])].sort((x,y)=>eventSortValue(x)-eventSortValue(y)||String(x.name||'').localeCompare(String(y.name||'')));
const eventDateLabel=e=>{
  const a=fmtDate(e?.event_date),b=fmtDate(e?.event_end_date);
  return e?.event_end_date&&e.event_end_date!==e.event_date?`${a} → ${b}`:a;
};
const eventClassBadges=classes=>(classes||[]).map(x=>`<span class="tag event-class-badge">${safe(x)}</span>`).join('');
const fileCategoryLabel=v=>{
  const x=String(v||'').toLowerCase();
  if(x==='setups')return'Setups';
  if(x==='liveries')return'Liveries';
  if(x==='docs'||x==='documents')return'Docs';
  if(x==='media'||x==='photo & clip links'||x==='photos')return'Photo & Clip Links';
  return String(v||'Files');
};
const cleanObjectName=v=>String(v||'file').replace(/[^\w.\-]+/g,'_').slice(0,180)||'file';

function toast(msg,type='info'){const e=document.createElement('div');e.className=`toast ${type==='error'?'error':''}`;e.textContent=msg;$('#toastHost').append(e);setTimeout(()=>e.remove(),3600)}
function updateOnline(){ $('#offlineBanner').classList.toggle('hidden',navigator.onLine); $('#connectionLabel').textContent=navigator.onLine?'Connected':'Offline'; }
window.addEventListener('online',updateOnline); window.addEventListener('offline',updateOnline);
window.addEventListener('error',e=>toast(e.message,'error'));
window.addEventListener('unhandledrejection',e=>toast(e.reason?.message||String(e.reason||'Unexpected error'),'error'));

function openDialog(title,body,actions=[]){
  $('#dialogTitle').textContent=title; $('#dialogBody').innerHTML=body;
  $('#dialogActions').innerHTML=actions.map((a,i)=>`<button type="button" data-dialog-action="${i}" class="${a.primary?'primary':''} ${a.danger?'danger-btn':''}">${safe(a.label)}</button>`).join('');
  $('#dialogActions').onclick=async e=>{const b=e.target.closest('[data-dialog-action]'); if(!b)return; const a=actions[Number(b.dataset.dialogAction)]; try{const close=await a.run(); if(close!==false) $('#appDialog').close();}catch(err){toast(err.message||String(err),'error')}};
  $('#appDialog').showModal();
}
const field=(label,id,type='text',value='',extra='')=>`<div class="dialog-field"><label for="${id}">${safe(label)}</label><input id="${id}" type="${type}" value="${safe(value)}" ${extra}></div>`;

$('#togglePassword').onclick=()=>{const i=$('#password');i.type=i.type==='password'?'text':'password'};
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginError').classList.add('hidden');const {error}=await supabase.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error){$('#loginError').textContent=error.message;$('#loginError').classList.remove('hidden')}};

supabase.auth.onAuthStateChange((_e,s)=>{state.session=s;s?enterApp():showLogin()});
const {data:{session}}=await supabase.auth.getSession();state.session=session;session?await enterApp():showLogin();

function showLogin(){cleanupRealtime();$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden')}
async function enterApp(){ $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');await loadProfile();await loadProfiles();await Promise.allSettled([loadHome(),loadEvents(),loadAnnouncements(),loadPolls()]);startRealtime(); }

async function loadProfile(){
  const {data,error}=await supabase.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();
  if(error)toast(error.message,'error');
  state.profile=await hydrateAvatar(data||{id:state.session.user.id,full_name:state.session.user.email,role:'driver'});
  const topAvatar=$('#avatarInitials');
  if(topAvatar)topAvatar.innerHTML=avatarSrc(state.profile)?`<img src="${safe(avatarSrc(state.profile))}" alt="" class="top-avatar-image">`:safe(initials(state.profile.full_name||state.profile.nickname));
  $('#editModeButton').classList.toggle('hidden',!isOwner());
  applyEditMode()
}
async function loadProfiles(){
  const {data,error}=await supabase.from('profiles').select('*').eq('active',true).order('full_name');
  if(error){toast(error.message,'error');return}
  state.profiles=await Promise.all((data||[]).map(hydrateAvatar))
}

function applyEditMode(){if(!isOwner())state.ownerEdit=false;document.body.classList.toggle('owner-editing',isOwner()&&state.ownerEdit);$('#editModeButton').textContent=state.ownerEdit?'Finish edit':'Edit'}
$('#editModeButton').onclick=()=>{if(!isOwner())return;state.ownerEdit=!state.ownerEdit;applyEditMode();toast(state.ownerEdit?'Edit mode on':'Edit mode off')};

function nav(page){state.currentPage=page;if(page!=='subpage')state.subpageKind=null;$$('.page').forEach(p=>p.classList.add('hidden'));$(`.page[data-page="${page}"]`)?.classList.remove('hidden');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));window.scrollTo(0,0);if(page==='home')loadHome();if(page==='events')loadEvents();if(page==='training')renderTraining($('#trainingPageContent'));if(page==='updates'){loadAnnouncements();loadPolls()}}
$$('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));$('#profileButton').onclick=()=>showSubpage('settings');$('#backMore').onclick=()=>nav('more');$$('[data-subpage]').forEach(b=>b.onclick=()=>showSubpage(b.dataset.subpage));

function renderHomeProfile(){const p=state.profile||{};$('#homeProfile').innerHTML=`<div class="profile-row"><div class="profile-avatar">${avatarHtml(p)}</div><div><p class="eyebrow">Signed in</p><h3>${safe(p.full_name||p.nickname||'Team member')}</h3><p>${safe(p.nickname||'')} ${p.race_number?`#${safe(p.race_number)}`:''}</p></div></div><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'lmu_driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iracing_driver')?'<span class="tag">iRacing Driver</span>':''}</div>`}
function renderHomeAnnouncement(){
  const box=$('#homeLatestAnnouncement');if(!box)return;
  const x=state.announcements?.[0];
  if(!x){box.innerHTML=empty('No announcement yet');return}
  box.innerHTML=`<button class="announcement-home ${x.highlighted?'highlighted':''}" data-nav="updates">${x.highlighted?'<span class="announcement-dot"></span>':''}<strong>${safe(x.title)}</strong><p class="announcement-meta">${fmtTs(x.created_at)}</p><p>${safe(x.message||'')}</p></button>`;
  box.querySelector('[data-nav]')?.addEventListener('click',()=>nav('updates'));
}
async function loadHome(){
  renderHomeProfile();
  const [ev,not,ann]=await Promise.all([
    supabase.from('events').select('*').order('event_date',{ascending:true}).limit(100),
    supabase.from('notifications').select('*').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(8),
    supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(10)
  ]);
  const upcoming=sortEventsByDate((ev.data||[]).filter(e=>(e.event_end_date||e.event_date||'9999-12-31')>=today())).slice(0,3);
  $('#homeEvents').innerHTML=ev.error?empty('Events unavailable'):renderEvents(upcoming,true);
  $('#homeNotifications').innerHTML=not.error?empty('Notifications unavailable'):(not.data?.length?not.data.map(n=>`<button class="list-card notification-card ${n.is_read?'':'unread'}" data-notification-id="${n.id}" data-notification-type="${safe(n.entity_type||'')}" data-notification-entity="${n.entity_id||''}"><div class="card-icon">${n.is_read?'○':'●'}</div><div><strong>${safe(n.title||'Notification')}</strong><p>${safe(n.message||'')}</p><small>${fmtTs(n.created_at)}</small></div></button>`).join(''):empty('No notifications'));
  if(!ann.error)state.announcements=ann.data||[];
  renderHomeAnnouncement();
}
$('#markNotificationsRead').onclick=async()=>{const {error}=await supabase.from('notifications').update({is_read:true}).eq('user_id',state.session.user.id).eq('is_read',false);if(error)return toast(error.message,'error');loadHome()};

async function loadEvents(){
  const {data,error}=await supabase.from('events').select('*').order('event_date',{ascending:true}).limit(200);
  if(error){state.events=[];$('#eventFilters').innerHTML='';$('#eventsList').innerHTML=empty(error.message);return}
  state.events=sortEventsByDate(data||[]);
  renderEventList();
}
function renderEventList(){
  const rows=state.events||[],filters=$('#eventFilters'),list=$('#eventsList'),calendar=$('#eventsCalendar'),btn=$('#calendarButton');
  if(state.eventCalendarOpen){
    filters.classList.add('hidden');list.classList.add('hidden');calendar.classList.remove('hidden');if(btn)btn.textContent='☷ List';renderEventsCalendar();return;
  }
  filters.classList.remove('hidden');list.classList.remove('hidden');calendar.classList.add('hidden');if(btn)btn.textContent='▦ Calendar';
  filters.innerHTML=simFilters(rows,state.eventFilter,'data-event-filter');
  list.innerHTML=renderEvents(sortEventsByDate(rows.filter(e=>simMatches(e,state.eventFilter))),false);
}
function renderEventsCalendar(){
  const box=$('#eventsCalendar'),rows=sortEventsByDate(state.events||[]);
  box.innerHTML=rows.length?rows.map(e=>`<button class="calendar-row" data-event-id="${e.id}"><span class="calendar-date">${eventDateLabel(e)}</span><span class="calendar-name">${safe(e.name)}</span><span class="calendar-sim">${safe(e.simulation||'Simracing')}</span></button>`).join(''):empty('No events yet');
}
function renderEvents(events,compact=false){
  if(!events.length)return empty(compact?'No events yet':'No events for this filter');
  return sortEventsByDate(events).map(e=>`<button class="event-card event-card-v05" data-event-id="${e.id}">
    <div class="event-top">
      <div><strong>${safe(e.name)}</strong><div class="event-date">${eventDateLabel(e)}</div></div>
      <span class="status-pill">${safe(e.status||'open')}</span>
    </div>
    <div class="event-route">
      <div class="event-route-row"><small>TRACK</small><span>${safe(e.track||'—')}</span></div>
      <div class="event-route-row"><small>SIM</small><span>${safe(e.simulation||'Simracing')}</span></div>
    </div>
    <div class="event-footer">
      <div class="profile-tags">${eventClassBadges(e.classes)}</div>
      <div class="event-series">${safe(e.championship||'')}</div>
    </div>
  </button>`).join('');
}
$('#calendarButton').onclick=()=>{state.eventCalendarOpen=!state.eventCalendarOpen;renderEventList()};
document.addEventListener('click',e=>{
  const ef=e.target.closest('[data-event-filter]');if(ef){state.eventFilter=ef.dataset.eventFilter||'all';renderEventList();return}
  const rf=e.target.closest('[data-result-filter]');if(rf){state.resultFilter=rf.dataset.resultFilter||'all';renderResultsContent($('#subpageContent'));return}
  const cal=e.target.closest('[data-open-calendar]');if(cal){state.eventCalendarOpen=true;nav('events');return}
  const mark=e.target.closest('[data-announcement-mark]');if(mark){toggleAnnouncementHighlight(mark.dataset.announcementMark,mark.dataset.value==='true');return}
  const fileFilter=e.target.closest('[data-file-filter]');if(fileFilter){state.fileFilter=fileFilter.dataset.fileFilter||'all';renderFilesContent($('#subpageContent'));return}
  const fileDownload=e.target.closest('[data-file-download]');if(fileDownload){downloadTeamFile(fileDownload.dataset.fileDownload);return}
  const fileDelete=e.target.closest('[data-file-delete]');if(fileDelete){confirmDeleteTeamFile(fileDelete.dataset.fileDelete);return}
  const b=e.target.closest('[data-event-id]');if(b){showEventDetail(b.dataset.eventId);return}
  const m=e.target.closest('[data-member-id]');if(m)showMemberProfile(m.dataset.memberId)
});
async function fetchEventBundle(id){
  const [ev,en,at]=await Promise.all([
    supabase.from('events').select('*').eq('id',id).single(),
    supabase.from('event_entries').select('*').eq('event_id',id).order('created_at'),
    supabase.from('event_attendance').select('*').eq('event_id',id)
  ]);
  if(ev.error)throw ev.error;
  const entries=en.data||[],attendance=at.data||[];
  let drivers={},schedule={};
  if(entries.length){
    const ids=entries.map(x=>x.id);
    const [{data:eds,error:de},{data:sch,error:se}]=await Promise.all([
      supabase.from('event_entry_drivers').select('*').in('entry_id',ids),
      supabase.from('entry_schedule_items').select('*').in('entry_id',ids).order('session_date').order('start_time').order('sort_order')
    ]);
    if(de)throw de;if(se)throw se;
    for(const d of eds||[])(drivers[d.entry_id]??=[]).push(d.driver_id);
    for(const x of sch||[])(schedule[x.entry_id]??=[]).push(x)
  }
  const hydrated=entries.map(x=>({...x,driverIds:drivers[x.id]||[],schedule:schedule[x.id]||[]}));
  return {event:ev.data,entries:hydrated,attendance};
}
function memberLabel(id){
  const p=state.profiles.find(x=>x.id===id);
  return p?.full_name||p?.nickname||'Driver'
}
function memberPill(id){
  const p=state.profiles.find(x=>x.id===id);
  return `<span class="driver-pill"><span class="driver-mini-avatar">${p?avatarHtml(p,'driver-mini-img'):safe(initials(memberLabel(id)))}</span><span>${safe(memberLabel(id))}</span></span>`
}
async function showEventDetail(id){
  nav('subpage');state.subpageKind='event';$('#subpageContent').innerHTML=empty('Loading event…');
  try{
    const bundle=await fetchEventBundle(id);
    state.currentEvent=bundle.event;state.currentEntries=bundle.entries;
    renderEventDetail(bundle)
  }catch(e){
    $('#subpageContent').innerHTML=empty(e.message||'Event unavailable')
  }
}
function renderEventDetail({event,entries,attendance}){
  state.currentAttendance=attendance||[];
  const id=event.id,my=attendance.find(x=>x.driver_id===state.session.user.id)?.status||'';
  const counts={in:attendance.filter(x=>x.status==='in').length,unsure:attendance.filter(x=>x.status==='unsure').length,out:attendance.filter(x=>x.status==='out').length};
  const currentStatus=String(event.status||'open');
  const ownerActions=isOwner()&&state.ownerEdit?`<div class="event-management-actions">
    <button class="chip-btn" data-event-edit="${id}">Edit event</button>
    ${currentStatus==='finished'?`<button class="chip-btn" data-event-status="open" data-event="${id}">Reopen</button>`:`<button class="chip-btn success" data-event-status="finished" data-event="${id}">Mark finished</button>`}
    <button class="chip-btn danger" data-event-delete="${id}">Delete</button>
  </div>`:'';
  const lineupButton=currentStatus==='open'?`<button class="chip-btn primary lineup-create-btn" data-lineup-new="${id}">+ Create line-up</button>`:'';

  $('#subpageContent').innerHTML=`
    <div class="page-heading row-between">
      <div><p class="eyebrow">${safe(event.championship||'Event')}</p><h2>${safe(event.name)}</h2><p class="subtle">${eventDateLabel(event)} · ${safe(currentStatus)}</p></div>
      ${lineupButton}
    </div>
    ${ownerActions}
    <div class="hero-card event-detail-hero">
      <div class="event-detail-row"><small>TRACK</small><strong>${safe(event.track||'—')}</strong></div>
      <div class="event-detail-row"><small>SIM</small><strong>${safe(event.simulation||'Simracing')}</strong></div>
      <div class="profile-tags">${eventClassBadges(event.classes)}</div>
      ${event.notes?`<p class="event-notes">${safe(event.notes)}</p>`:''}
    </div>

    <div class="section-title row-between"><h3>Attendance</h3><button class="link-btn" data-attendance-more="${id}">More</button></div>
    <div class="attendance-grid">
      ${[['in',`Confirmed (${counts.in})`],['unsure',`Unsure (${counts.unsure})`],['out',`Can't race (${counts.out})`]].map(([v,l])=>`<button class="attendance-btn ${my===v?'active':''}" data-attendance="${v}" data-event="${id}">${l}</button>`).join('')}
    </div>

    <div class="section-title row-between"><h3>Entries / Line-ups</h3><span class="subtle">${entries.length}</span></div>
    <div class="card-list">${entries.length?entries.map(en=>{
      const plannerAllowed=canManagePlanner(en),lineupAllowed=canManageLineup(en);
      const sched=en.schedule||[];
      return `<div class="lineup-card">
        <div class="event-top">
          <div><strong>${safe(en.entry_name||'SABIL Entry')}${en.car_number?` · #${safe(en.car_number)}`:''}</strong><p>${safe(en.vehicle||'')}</p></div>
          ${lineupAllowed?`<select class="lineup-status-select status-pill" data-lineup-status="${en.id}">
            <option value="draft" ${en.status==='draft'?'selected':''}>draft</option>
            <option value="ready" ${en.status==='ready'?'selected':''}>ready</option>
            <option value="confirmed" ${en.status==='confirmed'?'selected':''}>confirmed</option>
          </select>`:`<span class="status-pill">${safe(en.status||'draft')}</span>`}
        </div>
        <div class="lineup-meta-grid">
          <div><small>RACE DATE</small><strong>${en.race_date?fmtDate(en.race_date):'—'}</strong></div>
          <div><small>START</small><strong>${en.race_time?fmtTime(en.race_time):'—'}</strong></div>
          <div><small>CAR</small><strong>${safe(en.vehicle||'—')}</strong></div>
          <div><small>NUMBER</small><strong>${safe(en.car_number||'—')}</strong></div>
          ${en.iracing_team_name?`<div><small>iRACING TEAM</small><strong>${safe(en.iracing_team_name)}</strong></div>`:''}
          ${en.iracing_team_id?`<div><small>TEAM ID</small><strong>${safe(en.iracing_team_id)}</strong></div>`:''}
        </div>
        <div class="driver-pill-list">${(en.driverIds||[]).length?en.driverIds.map(memberPill).join(''):'<span class="subtle">No drivers assigned</span>'}</div>
        ${lineupAllowed?`<div class="lineup-actions"><button class="small-action" data-lineup-edit="${en.id}">Edit</button><button class="small-action danger" data-lineup-delete="${en.id}">Delete</button></div>`:''}

        <div class="planner-card">
          <div class="planner-title"><strong>Stint & Session Planner</strong><span>${sched.length}</span></div>
          <div class="planner-list">
            ${sched.length?sched.map(x=>`<div class="planner-item">
              <div class="planner-main"><strong>${safe(x.title||scheduleLabel(x))}</strong><p>${fmtDate(x.session_date)} · ${fmtTime(x.start_time)}${x.duration_minutes?` · ${x.duration_minutes} min`:''}</p><p>${x.driver_id?`Driver: ${safe(memberLabel(x.driver_id))}`:'Whole team'}${x.duration_minutes?` · Ends ${addMinutesLabel(x.session_date,x.start_time,x.duration_minutes)}`:''}</p>${x.notes?`<p class="planner-notes">${safe(x.notes)}</p>`:''}</div>
              ${plannerAllowed?`<div class="planner-actions"><button class="small-action" data-stint-edit="${x.id}" data-entry="${en.id}">Edit</button><button class="small-action danger" data-stint-delete="${x.id}" data-entry="${en.id}">Delete</button></div>`:''}
            </div>`).join(''):empty('No sessions planned yet')}
          </div>
          ${plannerAllowed?`<button class="chip-btn planner-add" data-stint-new="${en.id}">+ Add session / stint</button>`:''}
        </div>
      </div>`
    }).join(''):empty('No line-ups yet')}</div>`;
}

function openAttendanceDetails(){
  if(!state.currentEvent)return;
  const bundle=state.currentAttendance||[];
  const groups=[['in','Confirmed'],['unsure','Unsure'],['out',"Can't race"]];
  openDialog('Attendance',`<div class="attendance-details">${groups.map(([key,label])=>{
    const rows=bundle.filter(x=>x.status===key);
    return `<section class="attendance-group"><div class="attendance-group-head"><strong>${label}</strong><span>${rows.length}</span></div><div class="attendance-people">${rows.length?rows.map(x=>{
      const p=state.profiles.find(u=>u.id===x.driver_id);
      return `<div class="attendance-person"><div class="attendance-avatar">${p?avatarHtml(p,'driver-mini-img'):safe(initials(memberLabel(x.driver_id)))}</div><span>${safe(memberLabel(x.driver_id))}</span></div>`
    }).join(''):'<div class="subtle attendance-empty">Nobody yet</div>'}</div></section>`
  }).join('')}</div>`,[])
}

async function openLineupEditor(eventId,entryId=null){
  const event=state.currentEvent?.id===eventId?state.currentEvent:state.events.find(x=>x.id===eventId);
  if(!event)return toast('Event not found','error');
  if(event.status!=='open'&&!entryId)return toast('Line-ups can only be created while the event is open','error');

  const entry=entryId?state.currentEntries.find(x=>x.id===entryId):null;
  if(entry&&!canManageLineup(entry))return toast('You cannot edit this line-up','error');

  if(!state.profiles.length)await loadProfiles();
  const cars=await loadTeamCars(event.simulation);
  const selectedDrivers=new Set(entry?.driverIds||[]);
  const vehicleOptions=['',...cars.map(x=>x.car_name)].map(v=>`<option value="${safe(v)}" ${entry?.vehicle===v?'selected':''}>${safe(v||'— Select vehicle —')}</option>`).join('');
  const driverChecks=state.profiles.map(p=>`<label class="driver-check"><input type="checkbox" class="lineup-driver-check" value="${p.id}" ${selectedDrivers.has(p.id)?'checked':''}><span class="driver-check-avatar">${avatarHtml(p,'driver-mini-img')}</span><span>${safe(p.full_name||p.nickname||'Driver')}</span></label>`).join('');

  openDialog(entry?'Edit Entry / Line-up':'Add Entry / Line-up',`<div class="dialog-grid">
    <p class="dialog-help">Every driver may create a discussed line-up when they are part of it. Management can create and manage line-ups for the team.</p>
    ${field('Entry name','lineupName','text',entry?.entry_name||'')}
    <div class="dialog-field"><label>Car number</label><select id="lineupNumber">${['187','095','113'].map(n=>`<option value="${n}" ${String(entry?.car_number||'095')===n?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="dialog-field"><label>Vehicle</label><select id="lineupVehicle">${vehicleOptions}</select></div>
    ${field('Race date','lineupDate','date',entry?.race_date||event.event_date||'')}
    ${field('Start time','lineupTime','time',String(entry?.race_time||'').slice(0,5))}
    <div class="dialog-field"><label>Status</label><select id="lineupStatus"><option value="draft" ${entry?.status==='draft'?'selected':''}>Draft</option><option value="ready" ${entry?.status==='ready'?'selected':''}>Ready</option><option value="confirmed" ${!entry||entry?.status==='confirmed'?'selected':''}>Confirmed</option></select></div>
    <div class="dialog-field full"><label>Drivers</label><div class="driver-check-grid">${driverChecks}</div></div>
  </div>`,[{label:entry?'Save changes':'Add entry',primary:true,run:async()=>{
    const name=$('#lineupName').value.trim(),raceDate=$('#lineupDate').value,raceTime=$('#lineupTime').value;
    const ids=$$('.lineup-driver-check:checked').map(x=>x.value);
    if(!name)return toast('Entry name is required','error'),false;
    if(!raceDate||!raceTime)return toast('Race date and start time are required','error'),false;
    if(!ids.length)return toast('Add at least one driver','error'),false;
    if(!isManagement()&&!ids.includes(state.session.user.id))return toast('You must be part of a line-up you create','error'),false;
    if(event.event_date&&raceDate<event.event_date)return toast('Race date cannot be before the event starts','error'),false;
    const eventEnd=event.event_end_date||event.event_date;
    if(eventEnd&&raceDate>eventEnd)return toast('Race date must be inside the event date range','error'),false;

    const row={
      event_id:eventId,entry_name:name,car_number:$('#lineupNumber').value||null,vehicle:$('#lineupVehicle').value||null,
      race_date:raceDate,race_time:raceTime,status:$('#lineupStatus').value||'confirmed'
    };
    let savedId=entry?.id||null;
    if(entry){
      const {error}=await supabase.from('event_entries').update(row).eq('id',entry.id).eq('event_id',eventId);
      if(error){toast(error.message,'error');return false}
      const del=await supabase.from('event_entry_drivers').delete().eq('entry_id',entry.id);
      if(del.error){toast(del.error.message,'error');return false}
    }else{
      row.created_by=state.session.user.id;
      const {data,error}=await supabase.from('event_entries').insert(row).select().single();
      if(error){toast(error.message,'error');return false}
      savedId=data.id
    }
    const add=await supabase.from('event_entry_drivers').insert(ids.map(driver_id=>({entry_id:savedId,driver_id})));
    if(add.error){
      if(!entry)await supabase.from('event_entries').delete().eq('id',savedId);
      toast(add.error.message,'error');return false
    }
    await notifyEntryTeam(savedId,entry?'Line-up updated':'Line-up assignment',entry?`${name} was updated.`:`You were assigned to ${name}.`,'lineup');
    await showEventDetail(eventId);
    toast(entry?'Line-up updated':'Line-up created');
    return true
  }}])
}

async function deleteLineup(entryId){
  const en=state.currentEntries.find(x=>x.id===entryId);
  if(!en||!canManageLineup(en))return;
  openDialog('Delete line-up',`<p>Delete <strong>${safe(en.entry_name||'this line-up')}</strong>? Its stint plan will also be deleted.</p>`,[{label:'Delete',danger:true,run:async()=>{
    const {error}=await supabase.from('event_entries').delete().eq('id',entryId);
    if(error){toast(error.message,'error');return false}
    await showEventDetail(state.currentEvent.id);toast('Line-up deleted');return true
  }}])
}

function openStintEditor(entryId,itemId=null){
  const en=state.currentEntries.find(x=>x.id===entryId);
  if(!en||!canManagePlanner(en))return toast('You cannot edit this stint plan','error');
  const item=itemId?(en.schedule||[]).find(x=>x.id===itemId):null;
  const driverOptions=['<option value="">— Whole team / no driver —</option>',...(en.driverIds||[]).map(id=>`<option value="${id}" ${item?.driver_id===id?'selected':''}>${safe(memberLabel(id))}</option>`)].join('');
  openDialog(item?'Edit session / stint':'Add session / stint',`<div class="dialog-grid">
    <div class="dialog-field"><label>Type</label><select id="stintType"><option value="stint" ${(item?.item_type||'stint')==='stint'?'selected':''}>Stint</option><option value="practice" ${item?.item_type==='practice'?'selected':''}>Practice</option><option value="qualifying" ${item?.item_type==='qualifying'?'selected':''}>Qualifying</option><option value="race_start" ${item?.item_type==='race_start'?'selected':''}>Race start</option></select></div>
    ${field('Title','stintTitle','text',item?.title||'')}
    ${field('Date','stintDate','date',item?.session_date||en.race_date||state.currentEvent?.event_date||'')}
    ${field('Start time','stintTime','time',String(item?.start_time||en.race_time||'').slice(0,5))}
    ${field('Duration (minutes)','stintDuration','number',String(item?.duration_minutes||''),'min="0" step="1"')}
    <div class="dialog-field"><label>Driver</label><select id="stintDriver">${driverOptions}</select></div>
    <div class="dialog-field full"><label>Notes</label><textarea id="stintNotes">${safe(item?.notes||'')}</textarea></div>
  </div>`,[{label:item?'Save changes':'Add session',primary:true,run:async()=>{
    const date=$('#stintDate').value,time=$('#stintTime').value;
    if(!date||!time)return toast('Date and start time are required','error'),false;
    const row={
      entry_id:entryId,item_type:$('#stintType').value,title:$('#stintTitle').value.trim()||null,
      session_date:date,start_time:time,duration_minutes:Number($('#stintDuration').value)||null,
      driver_id:$('#stintDriver').value||null,sort_order:item?.sort_order||100,
      notes:$('#stintNotes').value.trim()||null
    };
    let error;
    if(item){
      ({error}=await supabase.from('entry_schedule_items').update(row).eq('id',item.id).eq('entry_id',entryId))
    }else{
      row.created_by=state.session.user.id;
      ({error}=await supabase.from('entry_schedule_items').insert(row))
    }
    if(error){toast(error.message,'error');return false}
    await notifyEntryTeam(entryId,'Stint plan updated',`${state.currentEvent?.name||'Event'} · ${en.entry_name||'Line-up'}`,'lineup');
    await showEventDetail(state.currentEvent.id);
    toast(item?'Stint updated':'Stint added');
    return true
  }}])
}

function deleteStint(entryId,itemId){
  const en=state.currentEntries.find(x=>x.id===entryId);
  if(!en||!canManagePlanner(en))return;
  const item=(en.schedule||[]).find(x=>x.id===itemId);
  openDialog('Delete stint / session',`<p>Delete <strong>${safe(item?.title||scheduleLabel(item)||'this session')}</strong>?</p>`,[{label:'Delete',danger:true,run:async()=>{
    const {error}=await supabase.from('entry_schedule_items').delete().eq('id',itemId).eq('entry_id',entryId);
    if(error){toast(error.message,'error');return false}
    await notifyEntryTeam(entryId,'Stint plan updated',`${state.currentEvent?.name||'Event'} · ${en.entry_name||'Line-up'}`,'lineup');
    await showEventDetail(state.currentEvent.id);toast('Stint deleted');return true
  }}])
}

async function openEventEditor(event=null){
  if(!isOwner()||!state.ownerEdit)return;
  const editing=!!event;
  openDialog(editing?'Edit event':'Create event',`<div class="dialog-grid">
    ${field('Name','evName','text',event?.name||'')}
    ${field('Championship / series','evChamp','text',event?.championship||'')}
    <div class="dialog-field"><label for="evSim">Simulation</label><select id="evSim"><option ${event?.simulation==='iRacing'?'selected':''}>iRacing</option><option ${event?.simulation==='Le Mans Ultimate'?'selected':''}>Le Mans Ultimate</option></select></div>
    ${trackField('Track','evTrack',event?.track||'')}
    ${field('Start date','evDate','date',event?.event_date||'')}
    ${field('End date','evEnd','date',event?.event_end_date||event?.event_date||'')}
    ${field('Classes (comma separated)','evClasses','text',(event?.classes||[]).join(', '))}
    <div class="dialog-field full"><label>Notes</label><textarea id="evNotes">${safe(event?.notes||'')}</textarea></div>
  </div>`,[{label:editing?'Save changes':'Create',primary:true,run:async()=>{
    const date=$('#evDate').value,endDate=$('#evEnd').value||date;
    if(!$('#evName').value.trim()||!date)return toast('Name and date are required','error'),false;
    if(endDate<date)return toast('End date cannot be before the start date','error'),false;
    const payload={
      name:$('#evName').value.trim(),championship:$('#evChamp').value.trim()||null,simulation:$('#evSim').value,
      track:$('#evTrack').value.trim()||null,event_date:date,event_end_date:endDate,
      classes:$('#evClasses').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#evNotes').value.trim()||null,
      team_car:null,start_time:null
    };
    let saved;
    if(editing){
      const {data,error}=await supabase.from('events').update(payload).eq('id',event.id).select().single();
      if(error){toast(error.message,'error');return false}saved=data
    }else{
      payload.status='open';payload.created_by=state.session.user.id;
      const {data,error}=await supabase.from('events').insert(payload).select().single();
      if(error){toast(error.message,'error');return false}saved=data;
      await notifyAllTeam('New event',`${saved.name} · ${fmtDate(saved.event_date)}`,'event','event',saved.id)
    }
    await loadEvents();
    if(editing)await showEventDetail(saved.id);
    toast(editing?'Event updated':'Event created');
    return true
  }}])
}

async function setEventStatus(id,status){
  if(!isOwner()||!state.ownerEdit)return;
  const {data,error}=await supabase.from('events').update({status}).eq('id',id).select().single();
  if(error)return toast(error.message,'error');
  if(status==='finished')await notifyAllTeam('Event finished',`${data.name} is ready for official results.`,'event','event',data.id);
  await loadEvents();await showEventDetail(id);toast(`Event marked ${status}`)
}
function deleteEventMobile(id){
  if(!isOwner()||!state.ownerEdit)return;
  const e=state.currentEvent;
  openDialog('Delete event',`<p>Delete <strong>${safe(e?.name||'this event')}</strong>? Line-ups and stint plans will also be removed.</p>`,[{label:'Delete',danger:true,run:async()=>{
    const {error}=await supabase.from('events').delete().eq('id',id);
    if(error){toast(error.message,'error');return false}
    state.currentEvent=null;state.currentEntries=[];await loadEvents();nav('events');toast('Event deleted');return true
  }}])
}

document.addEventListener('click',async e=>{
  const attendanceMore=e.target.closest('[data-attendance-more]');
  if(attendanceMore){openAttendanceDetails();return}
  const att=e.target.closest('[data-attendance]');
  if(att){
    const payload={event_id:att.dataset.event,driver_id:state.session.user.id,status:att.dataset.attendance};
    const {error}=await supabase.from('event_attendance').upsert(payload,{onConflict:'event_id,driver_id'});
    if(error)return toast(error.message,'error');
    toast('Attendance updated');return showEventDetail(att.dataset.event)
  }
  const statusSelect=e.target.closest('[data-lineup-status]');
  if(statusSelect){
    const en=state.currentEntries.find(x=>x.id===statusSelect.dataset.lineupStatus);
    if(!en||!canManageLineup(en))return;
    const {error}=await supabase.from('event_entries').update({status:statusSelect.value}).eq('id',en.id);
    if(error){toast(error.message,'error');return showEventDetail(state.currentEvent.id)}
    await notifyEntryTeam(en.id,'Line-up status updated',`${en.entry_name||'Line-up'} is now ${statusSelect.value}.`,'lineup');
    toast('Line-up status updated');
    return showEventDetail(state.currentEvent.id)
  }
  const newLine=e.target.closest('[data-lineup-new]');if(newLine)return openLineupEditor(newLine.dataset.lineupNew);
  const editLine=e.target.closest('[data-lineup-edit]');if(editLine)return openLineupEditor(state.currentEvent.id,editLine.dataset.lineupEdit);
  const delLine=e.target.closest('[data-lineup-delete]');if(delLine)return deleteLineup(delLine.dataset.lineupDelete);
  const newStint=e.target.closest('[data-stint-new]');if(newStint)return openStintEditor(newStint.dataset.stintNew);
  const editStint=e.target.closest('[data-stint-edit]');if(editStint)return openStintEditor(editStint.dataset.entry,editStint.dataset.stintEdit);
  const delStint=e.target.closest('[data-stint-delete]');if(delStint)return deleteStint(delStint.dataset.entry,delStint.dataset.stintDelete);
  const editEvent=e.target.closest('[data-event-edit]');if(editEvent)return openEventEditor(state.currentEvent);
  const status=e.target.closest('[data-event-status]');if(status)return setEventStatus(status.dataset.event,status.dataset.eventStatus);
  const delEvent=e.target.closest('[data-event-delete]');if(delEvent)return deleteEventMobile(delEvent.dataset.eventDelete);
  const n=e.target.closest('[data-notification-id]');
  if(n){
    await supabase.from('notifications').update({is_read:true}).eq('id',n.dataset.notificationId).eq('user_id',state.session.user.id);
    if(n.dataset.notificationType==='event'&&n.dataset.notificationEntity)return showEventDetail(n.dataset.notificationEntity);
    if(n.dataset.notificationType==='entry'&&n.dataset.notificationEntity){
      const {data}=await supabase.from('event_entries').select('event_id').eq('id',n.dataset.notificationEntity).maybeSingle();
      if(data?.event_id)return showEventDetail(data.event_id)
    }
    return loadHome()
  }
});

$('#newEventButton').onclick=()=>openEventEditor(null);

async function loadAnnouncements(){
  const {data,error}=await supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){state.announcements=[];$('#announcementsList').innerHTML=empty('Announcements unavailable');renderHomeAnnouncement();return}
  state.announcements=data||[];
  const creatorName=id=>state.profiles.find(p=>p.id===id)?.full_name||state.profiles.find(p=>p.id===id)?.nickname||'SABIL GR';
  $('#announcementsList').innerHTML=state.announcements.length
    ? state.announcements.map(x=>`<div class="announcement-card ${x.highlighted?'highlighted':''}">
        ${x.highlighted?'<span class="announcement-dot" aria-hidden="true"></span>':''}
        <div class="event-top"><div><strong>${safe(x.title)}</strong><p class="announcement-meta">${safe(creatorName(x.created_by))} · ${fmtTs(x.created_at)}</p></div>
          ${isOwner()&&state.ownerEdit?`<button class="mini-action ${x.highlighted?'active':''}" data-announcement-mark="${x.id}" data-value="${x.highlighted?'false':'true'}">${x.highlighted?'Unmark':'Mark'}</button>`:''}
        </div>
        <p class="announcement-body">${safe(x.message||'')}</p>
      </div>`).join('')
    : empty('No announcements yet');
  renderHomeAnnouncement();
}
async function toggleAnnouncementHighlight(id,value){
  if(!isOwner()||!state.ownerEdit)return;
  const {error}=await supabase.from('announcements').update({highlighted:!!value}).eq('id',id);
  if(error)return toast(error.message,'error');
  loadAnnouncements();
}
$('#refreshUpdates').onclick=()=>Promise.allSettled([loadAnnouncements(),loadPolls()]);
$('#newAnnouncement').onclick=()=>{
  if(!isOwner()||!state.ownerEdit)return;
  openDialog('New announcement',
    `<div class="dialog-grid">
      ${field('Title','annTitle')}
      <div class="dialog-field"><label for="annMessage">Message</label><textarea id="annMessage"></textarea></div>
      <label class="dialog-check"><input id="annHighlight" type="checkbox"> Mark as new / important</label>
    </div>`,
    [{label:'Post',primary:true,run:async()=>{
      const title=$('#annTitle').value.trim(),message=$('#annMessage').value.trim();
      if(!title||!message){toast('Title and message are required','error');return false}
      const {data:ann,error}=await supabase.from('announcements').insert({title,message,created_by:state.session.user.id,highlighted:$('#annHighlight').checked}).select().single();
      if(error){toast(error.message,'error');return false}
      await notifyAllTeam('New announcement',title,'announcement','announcement',ann.id);
      await loadAnnouncements();return true
    }}]
  );
};

async function loadPolls(){
  const {data,error}=await supabase.from('polls').select('*,poll_options(*)').eq('channel','general').order('created_at',{ascending:false}).limit(30);
  if(error){$('#pollsList').innerHTML=empty('Polls unavailable');return}
  const polls=data||[],ids=polls.map(p=>p.id);let votes=[];
  if(ids.length){const r=await supabase.from('poll_votes').select('*').in('poll_id',ids);votes=r.data||[]}
  $('#pollsList').innerHTML=polls.length?polls.map(p=>{
    const pv=votes.filter(v=>v.poll_id===p.id),mine=pv.filter(v=>v.user_id===state.session.user.id).map(v=>v.option_id);
    return `<div class="poll-card"><strong>${safe(p.question)}</strong><p>${p.multiple_choice?'Multiple answers':'One answer'}${p.closes_at?` · closes ${fmtTs(p.closes_at)}`:''}</p>${(p.poll_options||[]).sort((a,b)=>a.sort_order-b.sort_order).map(o=>`<button class="poll-option ${mine.includes(o.id)?'voted':''}" data-poll="${p.id}" data-option="${o.id}" data-multi="${p.multiple_choice?'1':'0'}"><span>${safe(o.option_text)}</span><span class="poll-count">${pv.filter(v=>v.option_id===o.id).length}</span></button>`).join('')}</div>`
  }).join(''):empty('No polls yet')
}

$('#pollsList').onclick=async e=>{
  const b=e.target.closest('[data-option]');if(!b)return;
  const poll=b.dataset.poll,opt=b.dataset.option,multi=b.dataset.multi==='1';
  const {data:existing}=await supabase.from('poll_votes').select('*').eq('poll_id',poll).eq('user_id',state.session.user.id);
  const same=(existing||[]).find(v=>v.option_id===opt);
  if(same){
    await supabase.from('poll_votes').delete().eq('id',same.id)
  }else{
    if(!multi&&(existing||[]).length)await supabase.from('poll_votes').delete().eq('poll_id',poll).eq('user_id',state.session.user.id);
    const {error}=await supabase.from('poll_votes').insert({poll_id:poll,option_id:opt,user_id:state.session.user.id});
    if(error)return toast(error.message,'error')
  }
  loadPolls()
};

$('#newPollButton').onclick=()=>openDialog('Create poll',
  `<div class="dialog-grid">${field('Question','pollQ')}<div class="dialog-field"><label>Options — one per line, 2–15</label><textarea id="pollOpts" placeholder="Option 1\nOption 2"></textarea></div><label class="dialog-check"><input id="pollMulti" type="checkbox"> Allow multiple answers</label></div>`,
  [{label:'Create',primary:true,run:async()=>{
    const q=$('#pollQ').value.trim(),opts=$('#pollOpts').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,15);
    if(!q||opts.length<2){toast('Need a question and at least 2 options','error');return false}
    const {data:p,error}=await supabase.from('polls').insert({channel:'general',question:q,multiple_choice:$('#pollMulti').checked,anonymous:false,created_by:state.session.user.id}).select().single();
    if(error){toast(error.message,'error');return false}
    const {error:oe}=await supabase.from('poll_options').insert(opts.map((t,i)=>({poll_id:p.id,option_text:t,sort_order:i})));
    if(oe){toast(oe.message,'error');return false}
    await notifyAllTeam('New poll',q,'poll','poll',p.id);
    loadPolls();return true
  }}]
);

async function showSubpage(kind){nav('subpage');state.subpageKind=kind;const c=$('#subpageContent');c.innerHTML=empty('Loading…');if(kind==='team')return renderTeam(c);if(kind==='training')return renderTraining(c);if(kind==='results')return renderResults(c);if(kind==='rules')return renderRules(c);if(kind==='files')return renderFiles(c);if(kind==='settings')return renderSettings(c)}
async function renderTeam(c){
  await loadProfiles();
  c.innerHTML=`<div class="page-heading"><p class="eyebrow">Members</p><h2>Team</h2></div><div class="card-list">${state.profiles.map(p=>`<button class="member-card" data-member-id="${p.id}"><div class="profile-avatar">${avatarHtml(p)}</div><div><strong>${safe(p.full_name||p.nickname||'Driver')} ${p.race_number?`#${safe(p.race_number)}`:''}</strong><p>${safe(effectiveRole(p)||'driver')} · ${safe(p.country||'')}</p><div class="profile-tags">${hasTag(p,'lmu_driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iracing_driver')?'<span class="tag">iRacing Driver</span>':''}</div></div></button>`).join('')}</div>`
}
function showMemberProfile(id){
  const p=state.profiles.find(x=>x.id===id);if(!p)return;
  nav('subpage');state.subpageKind='member';
  $('#subpageContent').innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Driver profile</p><h2>${safe(p.full_name||p.nickname||'Driver')}</h2></div>${isOwner()&&state.ownerEdit?`<button class="chip-btn" id="editMemberButton">Edit member</button>`:''}</div>
    <div class="hero-card">
      <div class="profile-row"><div class="profile-avatar">${avatarHtml(p)}</div><div><strong>${safe(p.nickname||p.full_name||'')}</strong><p>${p.race_number?`#${safe(p.race_number)} · `:''}${safe(p.country||'')}</p></div></div>
      <div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'lmu_driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iracing_driver')?'<span class="tag">iRacing Driver</span>':''}</div>
      <div class="divider"></div>
      <p><strong>Preferred sim:</strong> ${safe(p.preferred_sim||'—')}</p>
      <p><strong>Preferred class:</strong> ${safe(p.preferred_class||'—')}</p>
      <p><strong>Goal:</strong> ${safe(p.racing_goal||'—')}</p>
      <p class="prewrap">${safe(p.bio||'')}</p>
    </div>`;
  if($('#editMemberButton'))$('#editMemberButton').onclick=()=>openMemberEditor(id)
}
function roleOptions(selected,allowBlank=false){
  const opts=[['driver','Driver'],['admin','Admin'],['owner','Owner']];
  return `${allowBlank?`<option value="">None</option>`:''}${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}`
}
function openMemberEditor(id){
  if(!isOwner()||!state.ownerEdit)return;
  const p=state.profiles.find(x=>x.id===id);if(!p)return;
  const primary=String(p.role||'driver'),secondary=String(p.secondary_role||'');
  openDialog(`Edit ${p.full_name||p.nickname||'member'}`,`<div class="dialog-grid">
    ${field('Full name','memberName','text',p.full_name||'')}
    ${field('Nickname','memberNick','text',p.nickname||'')}
    ${field('Race number','memberNumber','text',p.race_number||'')}
    ${field('Country','memberCountry','text',p.country||'')}
    <div class="dialog-field"><label>Primary role</label><select id="memberPrimaryRole">${roleOptions(primary)}</select></div>
    <div class="dialog-field"><label>Second role</label><select id="memberSecondaryRole">${roleOptions(secondary,true)}</select></div>
    <label class="dialog-check"><input id="memberLMU" type="checkbox" ${hasTag(p,'lmu_driver')?'checked':''}> LMU Driver</label>
    <label class="dialog-check"><input id="memberIRacing" type="checkbox" ${hasTag(p,'iracing_driver')?'checked':''}> iRacing Driver</label>
    ${field('Preferred sim','memberPreferredSim','text',p.preferred_sim||'')}
    ${field('Preferred class','memberPreferredClass','text',p.preferred_class||'')}
    ${field('Racing goal','memberGoal','text',p.racing_goal||'')}
    <div class="dialog-field"><label>Bio</label><textarea id="memberBio">${safe(p.bio||'')}</textarea></div>
  </div>`,[{label:'Save',primary:true,run:async()=>{
    const primaryRole=$('#memberPrimaryRole').value,secondRole=$('#memberSecondaryRole').value;
    if(primaryRole===secondRole&&secondRole){toast('Primary and second role must be different','error');return false}
    if(p.id===state.session.user.id&&effectiveRole(p)==='owner'&&primaryRole!=='owner'&&secondRole!=='owner'){toast('You cannot remove your own Owner role','error');return false}
    const profilePatch={
      full_name:$('#memberName').value.trim()||null,
      nickname:$('#memberNick').value.trim()||null,
      race_number:$('#memberNumber').value.trim()||null,
      country:$('#memberCountry').value.trim()||null,
      preferred_sim:$('#memberPreferredSim').value.trim()||null,
      preferred_class:$('#memberPreferredClass').value.trim()||null,
      racing_goal:$('#memberGoal').value.trim()||null,
      bio:$('#memberBio').value.trim()||null,
      role_tags:[$('#memberLMU').checked?'lmu_driver':null,$('#memberIRacing').checked?'iracing_driver':null].filter(Boolean)
    };
    const roleChange=await supabase.rpc('set_user_roles',{target_user:id,primary_role:primaryRole,second_role:secondRole||null});
    if(roleChange.error){toast(roleChange.error.message,'error');return false}
    const {error}=await supabase.from('profiles').update(profilePatch).eq('id',id);
    if(error){toast(error.message,'error');return false}
    await loadProfiles();
    if(id===state.session.user.id)await loadProfile();
    showMemberProfile(id);
    toast('Member updated');
    return true
  }}])
}

async function renderTraining(c){
  const {data,error}=await supabase.from('training_sessions').select('*').order('session_date',{ascending:true}).limit(100);
  c.innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Practice</p><h2>Training</h2></div><button id="newTraining" class="chip-btn">+ Session</button></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(t=>`<div class="event-card"><div class="event-top"><div><strong>${safe(t.title)}</strong><p>${fmtDate(t.session_date)} · ${fmtTime(t.start_time)}</p></div><span class="status-pill">${safe(t.status||'planned')}</span></div><div class="event-route"><div class="event-route-row"><small>TRACK</small><span>${safe(t.track||'—')}</span></div><div class="event-route-row"><small>SIM</small><span>${safe(t.simulation||'')}</span></div></div><p>${t.duration_minutes||'—'} min${t.notes?` · ${safe(t.notes)}`:''}</p></div>`).join(''):empty('No training sessions'))}</div>`;
  $('#newTraining').onclick=()=>openDialog('New training session',`<div class="dialog-grid">${field('Title','trTitle')}<div class="dialog-field"><label for="trSim">Simulation</label><select id="trSim"><option>iRacing</option><option>Le Mans Ultimate</option></select></div>${trackField('Track','trTrack')}${field('Date','trDate','date')}${field('Start time','trTime','time')}${field('Duration minutes','trDur','number','60')}<div class="dialog-field"><label>Notes</label><textarea id="trNotes"></textarea></div></div>`,[{label:'Create',primary:true,run:async()=>{
    const {error}=await supabase.from('training_sessions').insert({title:$('#trTitle').value.trim(),scope:'team',simulation:$('#trSim').value.trim(),track:$('#trTrack').value.trim(),session_date:$('#trDate').value,start_time:$('#trTime').value||null,duration_minutes:Number($('#trDur').value)||60,notes:$('#trNotes').value.trim(),status:'planned',created_by:state.session.user.id});
    if(error){toast(error.message,'error');return false}renderTraining(c);return true
  }}])
}
async function renderResults(c){
  if(!state.events.length)await loadEvents();
  const {data,error}=await supabase.from('results').select('*').order('created_at',{ascending:false}).limit(200);
  state.results=error?[]:(data||[]);
  renderResultsContent(c,error)
}
function renderResultsContent(c,error=null){
  const rows=state.results||[],shown=rows.filter(r=>simMatches(r,state.resultFilter)),eventMap=Object.fromEntries((state.events||[]).map(e=>[e.id,e]));
  c.innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Performance</p><h2>Results</h2></div><button class="chip-btn" data-open-calendar>▦ Calendar</button></div>
    <div class="sim-filters">${simFilters(rows,state.resultFilter,'data-result-filter')}</div>
    <div class="card-list">${error?empty(error.message):(shown.length?shown.map(r=>{
      const ev=eventMap[r.event_id],name=ev?.name||`${r.simulation||'Result'} · ${r.track||''}`;
      return `<div class="result-card"><div><strong>${safe(name)}</strong><p>${safe(r.simulation||'')} · ${safe(r.track||'')} · ${safe(r.vehicle||'')}</p><div class="result-grid"><span>Q <b>P${r.qualifying_position??'—'}</b></span><span>Start <b>P${r.start_position??'—'}</b></span><span>Finish <b>P${r.finish_position??'—'}</b></span></div><p>Incidents ${r.incidents??'—'} · Fastest ${safe(r.fastest_lap||'—')}${r.split_number?` · Split ${r.split_number}/${r.split_total||'?'}`:''}</p></div></div>`
    }).join(''):empty('No results for this filter'))}</div>`
}
async function renderRules(c){
  const {data,error}=await supabase.from('team_rules').select('*').eq('active',true).order('sort_order').order('created_at');
  const rows=data||[];
  const groups=[];
  for(const r of rows){
    const name=String(r.category||'General').trim()||'General';
    let g=groups.find(x=>x.name===name);
    if(!g){g={name,rows:[]};groups.push(g)}
    g.rows.push(r)
  }
  c.innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Governance</p><h2>Rules</h2><p class="subtle">Team rules grouped by topic.</p></div>${isOwner()&&state.ownerEdit?`<button class="chip-btn" id="newRuleButton">+ Rule</button>`:''}</div>
    <div class="rules-sections">${error?empty(error.message):(groups.length?groups.map((g,gi)=>`<section class="rules-section">
      <div class="rules-section-head"><div><span class="rules-index">${String(gi+1).padStart(2,'0')}</span><h3>${safe(g.name)}</h3></div><span>${g.rows.length} ${g.rows.length===1?'rule':'rules'}</span></div>
      <div class="rules-section-list">${g.rows.map((r,ri)=>`<article class="rule-row">
        <div class="rule-number">${ri+1}</div>
        <div class="rule-copy"><strong>${safe(r.title)}</strong><p class="prewrap">${safe(r.body)}</p></div>
        ${isOwner()&&state.ownerEdit?`<button class="mini-action rule-edit-btn" data-rule-edit="${r.id}">Edit</button>`:''}
      </article>`).join('')}</div>
    </section>`).join(''):empty('No active rules'))}</div>`;
  if($('#newRuleButton'))$('#newRuleButton').onclick=()=>openRuleEditor(null,rows,c);
  c.querySelectorAll('[data-rule-edit]').forEach(b=>b.onclick=()=>openRuleEditor(rows.find(r=>r.id===b.dataset.ruleEdit),rows,c))
}
function openRuleEditor(rule,rows,c){
  if(!isOwner()||!state.ownerEdit)return;
  const r=rule||{};
  openDialog(rule?'Edit rule':'New rule',`<div class="dialog-grid">
    ${field('Title','ruleTitle','text',r.title||'')}
    ${field('Category','ruleCategory','text',r.category||'General')}
    ${field('Sort order','ruleOrder','number',String(r.sort_order??100))}
    <div class="dialog-field"><label>Rule text</label><textarea id="ruleBody">${safe(r.body||'')}</textarea></div>
  </div>`,[
    ...(rule?[{label:'Remove',danger:true,run:async()=>{
      const {error}=await supabase.from('team_rules').update({active:false}).eq('id',rule.id);
      if(error){toast(error.message,'error');return false}
      await renderRules(c);toast('Rule removed');return true
    }}]:[]),
    {label:'Save',primary:true,run:async()=>{
      const payload={
        title:$('#ruleTitle').value.trim(),
        category:$('#ruleCategory').value.trim()||'General',
        sort_order:Number($('#ruleOrder').value)||100,
        body:$('#ruleBody').value.trim(),
        active:true
      };
      if(!payload.title||!payload.body){toast('Title and rule text are required','error');return false}
      let q;
      if(rule)q=supabase.from('team_rules').update(payload).eq('id',rule.id);
      else q=supabase.from('team_rules').insert({...payload,created_by:state.session.user.id});
      const {error}=await q;
      if(error){toast(error.message,'error');return false}
      await renderRules(c);toast(rule?'Rule updated':'Rule created');return true
    }}
  ])
}

async function renderFiles(c){
  const {data,error}=await supabase.from('team_files').select('*').order('created_at',{ascending:false});
  state.files=error?[]:(data||[]);
  renderFilesContent(c,error)
}
function renderFilesContent(c,error=null){
  const categories=[...new Set((state.files||[]).map(f=>String(f.category||'files').toLowerCase()))];
  const filtered=state.fileFilter==='all'?state.files:state.files.filter(f=>String(f.category||'files').toLowerCase()===state.fileFilter);
  const filterButtons=[['all','All'],...categories.map(x=>[x,fileCategoryLabel(x)])].map(([key,label])=>`<button class="filter-chip ${state.fileFilter===key?'active':''}" data-file-filter="${safe(key)}">${safe(label)} (${key==='all'?state.files.length:state.files.filter(f=>String(f.category||'files').toLowerCase()===key).length})</button>`).join('');
  c.innerHTML=`<div class="page-heading"><div><p class="eyebrow">Resources</p><h2>Files</h2><p class="subtle">Uploads are handled in the Windows Hub.</p></div></div>
    <div class="sim-filters">${filterButtons}</div>
    <div class="card-list">${error?empty(error.message):(filtered.length?filtered.map(f=>{
      const parts=String(f.name||'File').split('/'),display=parts.pop(),folder=parts.join('/');
      return `<div class="file-card file-card-v05"><div class="card-icon">↗</div><div class="file-main"><strong>${safe(display)}</strong>${folder?`<p class="file-folder">${safe(folder)}</p>`:''}<p>${safe(fileCategoryLabel(f.category))}${f.description?` · ${safe(f.description)}`:''}</p></div><div class="file-actions"><button class="small-action" data-file-download="${f.id}">Download</button>${isOwner()&&state.ownerEdit?`<button class="small-action danger" data-file-delete="${f.id}">Delete</button>`:''}</div></div>`
    }).join(''):empty('No files in this category'))}</div>`
}
async function downloadTeamFile(id){
  const f=(state.files||[]).find(x=>x.id===id);if(!f)return;
  if(f.external_url){window.open(f.external_url,'_blank','noopener');return}
  if(!f.storage_url)return toast('File not found','error');
  const {data,error}=await supabase.storage.from(FILE_BUCKET).createSignedUrl(f.storage_url,3600);
  if(error||!data?.signedUrl)return toast(error?.message||'Could not open file','error');
  window.open(data.signedUrl,'_blank','noopener')
}
function confirmDeleteTeamFile(id){
  const f=(state.files||[]).find(x=>x.id===id);if(!f)return;
  openDialog('Delete file',`<p>Delete <strong>${safe(f.name)}</strong>?</p>`,[{label:'Delete',danger:true,run:async()=>{await deleteTeamFile(id);return true}}])
}
async function deleteTeamFile(id){
  const f=(state.files||[]).find(x=>x.id===id);if(!f)return;
  if(f.storage_url&&!/^https?:/i.test(f.storage_url)){try{await supabase.storage.from(FILE_BUCKET).remove([f.storage_url])}catch{}}
  const {error}=await supabase.from('team_files').delete().eq('id',id);
  if(error){toast(error.message,'error');return}
  state.files=state.files.filter(x=>x.id!==id);renderFilesContent($('#subpageContent'));toast('File deleted')
}
function renderSettings(c){
  const p=state.profile||{};
  c.innerHTML=`<div class="page-heading"><p class="eyebrow">Account</p><h2>Settings</h2><p class="subtle">Your profile and app settings.</p></div>
    <div class="settings-profile-card">
      <div class="settings-profile-top"><div class="settings-avatar-large">${avatarHtml(p,'settings-avatar-img')}</div><div><strong>${safe(p.full_name||p.nickname||state.session.user.email)}</strong><p>${safe(state.session.user.email)}</p><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'lmu_driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iracing_driver')?'<span class="tag">iRacing Driver</span>':''}</div></div></div>
      <div class="settings-action-grid">
        <button id="changeAvatarBtn" class="settings-action"><strong>Profile picture</strong><span>Change photo</span></button>
        ${p.avatar_url?`<button id="removeAvatarBtn" class="settings-action danger-lite"><strong>Remove photo</strong><span>Use initials instead</span></button>`:''}
        <button id="editMyProfileBtn" class="settings-action"><strong>Edit profile</strong><span>Name, number, country, sim & bio</span></button>
        <button id="changePasswordBtn" class="settings-action"><strong>Password</strong><span>Change account password</span></button>
      </div>
    </div>
    <div class="settings-section"><h3>App</h3>
      <div class="settings-row"><div><strong>Mobile PWA</strong><p>Version 0.9 · same live data as Desktop</p></div><button id="settingsInstall">Install</button></div>
      ${isOwner()?`<div class="settings-row"><div><strong>Owner Edit mode</strong><p>Rules, team members, events and announcements</p></div><button id="settingsEdit">${state.ownerEdit?'Finish':'Edit'}</button></div>`:''}
      <div class="settings-row"><div><strong>Files</strong><p>Browse/download here · uploads stay in Windows Hub</p></div></div>
      <div class="settings-row"><div><strong>Communication</strong><p>Chat and voice are handled in Discord</p></div></div>
    </div>
    <div class="settings-section"><h3>Session</h3><div class="settings-row"><div><strong>${safe(state.session.user.email)}</strong><p>Signed in</p></div><button id="logoutBtn" class="danger-btn">Log out</button></div></div>`;
  $('#logoutBtn').onclick=()=>supabase.auth.signOut();$('#settingsInstall').onclick=installPwa;
  if($('#settingsEdit'))$('#settingsEdit').onclick=()=>{state.ownerEdit=!state.ownerEdit;applyEditMode();renderSettings(c)};
  $('#editMyProfileBtn').onclick=openMyProfileEditor;$('#changeAvatarBtn').onclick=pickProfilePicture;if($('#removeAvatarBtn'))$('#removeAvatarBtn').onclick=removeProfilePicture;$('#changePasswordBtn').onclick=openPasswordEditor
}
function openMyProfileEditor(){const p=state.profile||{};openDialog('Edit profile',`<div class="dialog-grid">${field('Full name','myFullName','text',p.full_name||'')}${field('Nickname','myNickname','text',p.nickname||'')}${field('Race number','myRaceNumber','text',p.race_number||'')}${field('Country','myCountry','text',p.country||'')}${field('Preferred sim','myPreferredSim','text',p.preferred_sim||'')}${field('Preferred class','myPreferredClass','text',p.preferred_class||'')}${field('Racing goal','myGoal','text',p.racing_goal||'')}<div class="dialog-field full"><label>Bio</label><textarea id="myBio">${safe(p.bio||'')}</textarea></div></div>`,[{label:'Save profile',primary:true,run:async()=>{const patch={full_name:$('#myFullName').value.trim()||null,nickname:$('#myNickname').value.trim()||null,race_number:$('#myRaceNumber').value.trim()||null,country:$('#myCountry').value.trim()||null,preferred_sim:$('#myPreferredSim').value.trim()||null,preferred_class:$('#myPreferredClass').value.trim()||null,racing_goal:$('#myGoal').value.trim()||null,bio:$('#myBio').value.trim()||null};const {error}=await supabase.from('profiles').update(patch).eq('id',state.session.user.id);if(error){toast(error.message,'error');return false}await loadProfile();await loadProfiles();renderSettings($('#subpageContent'));renderHomeProfile();toast('Profile updated');return true}}])}
function pickProfilePicture(){const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024)return toast('Profile picture must be under 5 MB','error');const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';const path=`avatars/${state.session.user.id}/${Date.now()}.${ext}`;toast('Uploading profile picture…');const {error:upError}=await supabase.storage.from(FILE_BUCKET).upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});if(upError)return toast(upError.message,'error');const old=state.profile?.avatar_url;const {error}=await supabase.from('profiles').update({avatar_url:path}).eq('id',state.session.user.id);if(error){await supabase.storage.from(FILE_BUCKET).remove([path]);return toast(error.message,'error')}if(old&&!/^https?:/i.test(old)){try{await supabase.storage.from(FILE_BUCKET).remove([old])}catch{}}state.avatarCache.clear();await loadProfile();await loadProfiles();renderSettings($('#subpageContent'));renderHomeProfile();toast('Profile picture updated')};input.click()}
function removeProfilePicture(){const old=state.profile?.avatar_url;openDialog('Remove profile picture','<p>Use your initials instead of the current profile picture?</p>',[{label:'Remove',danger:true,run:async()=>{const {error}=await supabase.from('profiles').update({avatar_url:null}).eq('id',state.session.user.id);if(error){toast(error.message,'error');return false}if(old&&!/^https?:/i.test(old)){try{await supabase.storage.from(FILE_BUCKET).remove([old])}catch{}}state.avatarCache.clear();await loadProfile();await loadProfiles();renderSettings($('#subpageContent'));renderHomeProfile();toast('Profile picture removed');return true}}])}
function openPasswordEditor(){openDialog('Change password',`<div class="dialog-grid"><div class="dialog-field full"><label>New password</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password"></div><div class="dialog-field full"><label>Repeat password</label><input id="newPasswordRepeat" type="password" minlength="8" autocomplete="new-password"></div><p class="dialog-help">Minimum 8 characters.</p></div>`,[{label:'Change password',primary:true,run:async()=>{const p=$('#newPassword').value,p2=$('#newPasswordRepeat').value;if(p.length<8)return toast('Password must be at least 8 characters','error'),false;if(p!==p2)return toast('Passwords do not match','error'),false;const {error}=await supabase.auth.updateUser({password:p});if(error){toast(error.message,'error');return false}toast('Password changed');return true}}])}


function cleanupRealtime(){for(const ch of state.subscriptions){try{supabase.removeChannel(ch)}catch{}}state.subscriptions=[]}
function startRealtime(){cleanupRealtime();const specs=[['events',()=>{if(state.currentPage==='events')loadEvents();if(state.currentPage==='home')loadHome()}],['event_attendance',()=>state.currentPage==='subpage'&&state.subpageKind==='event'&&state.currentEvent?.id&&showEventDetail(state.currentEvent.id)],['event_entries',()=>state.currentPage==='subpage'&&state.subpageKind==='event'&&state.currentEvent?.id&&showEventDetail(state.currentEvent.id)],['event_entry_drivers',()=>state.currentPage==='subpage'&&state.subpageKind==='event'&&state.currentEvent?.id&&showEventDetail(state.currentEvent.id)],['entry_schedule_items',()=>state.currentPage==='subpage'&&state.subpageKind==='event'&&state.currentEvent?.id&&showEventDetail(state.currentEvent.id)],['notifications',()=>state.currentPage==='home'&&loadHome()],['announcements',()=>{if(state.currentPage==='updates')loadAnnouncements();if(state.currentPage==='home')loadHome()}],['polls',()=>state.currentPage==='updates'&&loadPolls()],['poll_votes',()=>state.currentPage==='updates'&&loadPolls()],['results',()=>state.currentPage==='subpage'&&state.subpageKind==='results'&&renderResults($('#subpageContent'))],['team_files',()=>state.currentPage==='subpage'&&state.subpageKind==='files'&&renderFiles($('#subpageContent'))],['training_sessions',()=>{if(state.currentPage==='training')renderTraining($('#trainingPageContent'));if(state.currentPage==='subpage'&&state.subpageKind==='training')renderTraining($('#subpageContent'))}],['team_rules',()=>state.currentPage==='subpage'&&state.subpageKind==='rules'&&renderRules($('#subpageContent'))],['profiles',()=>{if(state.currentPage==='subpage'&&state.subpageKind==='team')renderTeam($('#subpageContent'));if(state.currentPage==='home')loadHome()}]];state.subscriptions=specs.map(([table,cb],i)=>supabase.channel(`mobile-v09-${i}`).on('postgres_changes',{event:'*',schema:'public',table},cb).subscribe())}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#installButton').classList.remove('hidden')});
$('#installButton').onclick=installPwa;
async function installPwa(){if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$('#installButton').classList.add('hidden')}else toast('On iPhone: Share → Add to Home Screen')}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
updateOnline();
