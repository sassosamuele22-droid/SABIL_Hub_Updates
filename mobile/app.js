import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://enzqritietjhrdezdkxj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tzzD7ia5MXerBKnREOzAvA_7duHc6Lr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={session:null,profile:null,profiles:[],currentPage:'home',subpageKind:null,subscriptions:[],deferredInstall:null,ownerEdit:false,events:[],eventFilter:'all',eventCalendarOpen:false,results:[],resultFilter:'all',announcements:[],files:[],fileFilter:'all'};

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
const hasTag=(p,t)=>Array.isArray(p?.role_tags)&&p.role_tags.some(x=>String(x).toLowerCase()===t.toLowerCase());
const simKey=v=>{const x=String(v||'').trim().toLowerCase();if(x.includes('iracing'))return 'iracing';if(x==='lmu'||x.includes('le mans'))return 'lmu';return 'other'};
const simMatches=(row,filter)=>filter==='all'||simKey(row?.simulation)===filter;
const simCount=(rows,filter)=>filter==='all'?rows.length:rows.filter(r=>simMatches(r,filter)).length;
const simFilters=(rows,active,attr)=>[['all','All'],['iracing','iRacing'],['lmu','Le Mans Ultimate']].map(([key,label])=>`<button type="button" class="filter-chip ${active===key?'active':''}" ${attr}="${key}" aria-pressed="${active===key?'true':'false'}">${label} (${simCount(rows,key)})</button>`).join('');
const LMU_EXTRA_TRACKS=['Long Beach','Road Atlanta'];
function lmuTrackOptions(){const existing=(state.events||[]).filter(e=>simKey(e.simulation)==='lmu').map(e=>e.track).filter(Boolean);return [...new Set([...existing,...LMU_EXTRA_TRACKS])].sort((a,b)=>String(a).localeCompare(String(b))).map(track=>`<option value="${safe(track)}"></option>`).join('')}
const trackField=(label,id,value='')=>`<div class="dialog-field"><label for="${id}">${safe(label)}</label><input id="${id}" list="lmuTrackOptions" value="${safe(value)}"><datalist id="lmuTrackOptions">${lmuTrackOptions()}</datalist></div>`;

const FILE_BUCKET='sabil-files';
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

async function loadProfile(){const {data,error}=await supabase.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();if(error)toast(error.message,'error');state.profile=data||{id:state.session.user.id,full_name:state.session.user.email,role:'driver'};$('#avatarInitials').textContent=initials(state.profile.full_name||state.profile.nickname);$('#editModeButton').classList.toggle('hidden',!isManagement());applyEditMode()}
async function loadProfiles(){const {data,error}=await supabase.from('profiles').select('*').eq('active',true).order('full_name');if(error){toast(error.message,'error');return}state.profiles=data||[]}

function applyEditMode(){document.body.classList.toggle('owner-editing',isManagement()&&state.ownerEdit);$('#editModeButton').textContent=state.ownerEdit?'Finish edit':'Edit'}
$('#editModeButton').onclick=()=>{if(!isManagement())return;state.ownerEdit=!state.ownerEdit;applyEditMode();toast(state.ownerEdit?'Edit mode on':'Edit mode off')};

function nav(page){state.currentPage=page;if(page!=='subpage')state.subpageKind=null;$$('.page').forEach(p=>p.classList.add('hidden'));$(`.page[data-page="${page}"]`)?.classList.remove('hidden');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));window.scrollTo(0,0);if(page==='home')loadHome();if(page==='events')loadEvents();if(page==='updates'){loadAnnouncements();loadPolls()}}
$$('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));$('#profileButton').onclick=()=>showSubpage('settings');$('#backMore').onclick=()=>nav('more');$$('[data-subpage]').forEach(b=>b.onclick=()=>showSubpage(b.dataset.subpage));

function renderHomeProfile(){const p=state.profile||{};$('#homeProfile').innerHTML=`<p class="eyebrow">Signed in</p><h3>${safe(p.full_name||p.nickname||'Team member')}</h3><p>${safe(p.nickname||'')} ${p.race_number?`#${safe(p.race_number)}`:''}</p><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div>`}
function renderHomeAnnouncement(){
  const box=$('#homeLatestAnnouncement');if(!box)return;
  const x=state.announcements?.[0];
  if(!x){box.innerHTML=empty('No announcement yet');return}
  box.innerHTML=`<button class="announcement-home ${x.highlighted?'highlighted':''}" data-nav="updates">${x.highlighted?'<span class="announcement-dot"></span>':''}<strong>${safe(x.title)}</strong><p class="announcement-meta">${fmtTs(x.created_at)}</p><p>${safe(x.message||'')}</p></button>`;
  box.querySelector('[data-nav]')?.addEventListener('click',()=>nav('updates'));
}
async function loadHome(){
  renderHomeProfile();
  const [ev,act,not,ann]=await Promise.all([
    supabase.from('events').select('*').order('event_date',{ascending:true}).limit(100),
    supabase.from('activity_log').select('*').order('created_at',{ascending:false}).limit(5),
    supabase.from('notifications').select('*').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(5),
    supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(10)
  ]);
  const upcoming=sortEventsByDate((ev.data||[]).filter(e=>(e.event_end_date||e.event_date||'9999-12-31')>=today())).slice(0,3);
  $('#homeEvents').innerHTML=ev.error?empty('Events unavailable'):renderEvents(upcoming,true);
  $('#homeActivity').innerHTML=act.error?empty('Activity unavailable'):(act.data?.length?act.data.map(a=>`<div class="list-card"><div class="card-icon">↻</div><div><strong>${safe(a.action||'Activity')}</strong><p>${safe(a.details||a.entity_type||'')}</p><small>${fmtTs(a.created_at)}</small></div></div>`).join(''):empty('No recent activity'));
  $('#homeNotifications').innerHTML=not.error?empty('Notifications unavailable'):(not.data?.length?not.data.map(n=>`<div class="list-card"><div class="card-icon">${n.is_read?'○':'●'}</div><div><strong>${safe(n.title||'Notification')}</strong><p>${safe(n.message||'')}</p><small>${fmtTs(n.created_at)}</small></div></div>`).join(''):empty('No notifications'));
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
  const fileUpload=e.target.closest('[data-file-upload]');if(fileUpload){pickTeamFiles(fileUpload.dataset.fileUpload==='folder');return}
  const b=e.target.closest('[data-event-id]');if(b){showEventDetail(b.dataset.eventId);return}
  const m=e.target.closest('[data-member-id]');if(m)showMemberProfile(m.dataset.memberId)
});
async function showEventDetail(id){
  nav('subpage');state.subpageKind='event';$('#subpageContent').innerHTML=empty('Loading event…');
  const [ev,en,at]=await Promise.all([
    supabase.from('events').select('*').eq('id',id).single(),
    supabase.from('event_entries').select('*').eq('event_id',id).order('created_at'),
    supabase.from('event_attendance').select('*').eq('event_id',id)
  ]);
  if(ev.error){$('#subpageContent').innerHTML=empty(ev.error.message);return}
  const entries=en.data||[],attendance=at.data||[];let drivers={},schedule={};
  if(entries.length){
    const ids=entries.map(x=>x.id);
    const [{data:eds},{data:sch}]=await Promise.all([
      supabase.from('event_entry_drivers').select('*').in('entry_id',ids),
      supabase.from('entry_schedule_items').select('*').in('entry_id',ids).order('sort_order')
    ]);
    for(const d of eds||[])(drivers[d.entry_id]??=[]).push(d.driver_id);
    for(const x of sch||[])(schedule[x.entry_id]??=[]).push(x)
  }
  const my=attendance.find(x=>x.driver_id===state.session.user.id)?.status||'';
  const counts={in:attendance.filter(x=>x.status==='in').length,unsure:attendance.filter(x=>x.status==='unsure').length,out:attendance.filter(x=>x.status==='out').length};
  $('#subpageContent').innerHTML=`
    <div class="page-heading"><p class="eyebrow">${safe(ev.data.championship||'Event')}</p><h2>${safe(ev.data.name)}</h2><p class="subtle">${eventDateLabel(ev.data)}</p></div>
    <div class="hero-card event-detail-hero">
      <div class="event-detail-row"><small>TRACK</small><strong>${safe(ev.data.track||'—')}</strong></div>
      <div class="event-detail-row"><small>SIM</small><strong>${safe(ev.data.simulation||'Simracing')}</strong></div>
      <div class="profile-tags">${eventClassBadges(ev.data.classes)}</div>
      ${ev.data.notes?`<p class="event-notes">${safe(ev.data.notes)}</p>`:''}
    </div>
    <div class="section-title"><h3>Your attendance</h3></div>
    <div class="attendance-grid">
      ${[['in',`Confirmed (${counts.in})`],['unsure',`Unsure (${counts.unsure})`],['out',`Can't race (${counts.out})`]].map(([v,l])=>`<button class="attendance-btn ${my===v?'active':''}" data-attendance="${v}" data-event="${id}">${l}</button>`).join('')}
    </div>
    <div class="section-title"><h3>Line-ups</h3></div>
    <div class="card-list">${entries.length?entries.map(x=>{
      const names=(drivers[x.id]||[]).map(uid=>state.profiles.find(p=>p.id===uid)?.full_name||state.profiles.find(p=>p.id===uid)?.nickname||'Driver');
      const sched=schedule[x.id]||[];
      return `<div class="lineup-card">
        <div class="event-top"><div><strong>${safe(x.entry_name||'Line-up')}${x.car_number?` · #${safe(x.car_number)}`:''}</strong><p>${safe(x.vehicle||'')}</p></div><span class="status-pill">${safe(x.status||'draft')}</span></div>
        <p>${names.length?safe(names.join(', ')):'No drivers assigned'}</p>
        ${x.race_date?`<p class="subtle">${fmtDate(x.race_date)}${x.race_time?` · ${fmtTime(x.race_time)}`:''}</p>`:''}
        ${sched.length?`<div class="stint-list">${sched.map(s=>`<div class="stint-row"><strong>${safe(s.title||s.item_type||'Session')}</strong><span>${fmtDate(s.session_date||s.date)} ${fmtTime(s.start_time||s.time)}${s.duration_minutes||s.duration?` · ${s.duration_minutes||s.duration} min`:''}</span></div>`).join('')}</div>`:''}
      </div>`
    }).join(''):empty('No line-ups yet')}</div>`;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-attendance]');if(!b)return;
  const payload={event_id:b.dataset.event,driver_id:state.session.user.id,status:b.dataset.attendance};
  const {error}=await supabase.from('event_attendance').upsert(payload,{onConflict:'event_id,driver_id'});
  if(error)return toast(error.message,'error');
  toast('Attendance updated');showEventDetail(b.dataset.event)
});
$('#newEventButton').onclick=()=>{
  if(!isManagement()||!state.ownerEdit)return;
  openDialog('Create event',`<div class="dialog-grid">
    ${field('Name','evName')}
    ${field('Championship / series','evChamp')}
    <div class="dialog-field"><label for="evSim">Simulation</label><select id="evSim"><option>iRacing</option><option>Le Mans Ultimate</option></select></div>
    ${trackField('Track','evTrack')}
    ${field('Start date','evDate','date')}
    ${field('End date','evEnd','date')}
    ${field('Start time','evTime','time')}
    ${field('Classes (comma separated)','evClasses')}
    <div class="dialog-field"><label>Notes</label><textarea id="evNotes"></textarea></div>
  </div>`,[{label:'Create',primary:true,run:async()=>{
    const date=$('#evDate').value,end=$('#evEnd').value||date;
    const payload={
      name:$('#evName').value.trim(),championship:$('#evChamp').value.trim(),simulation:$('#evSim').value.trim(),
      track:$('#evTrack').value.trim(),event_date:date,event_end_date:end,start_time:$('#evTime').value||null,
      classes:$('#evClasses').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#evNotes').value.trim(),
      status:'open',created_by:state.session.user.id
    };
    if(!payload.name||!payload.event_date){toast('Name and date are required','error');return false}
    const {error}=await supabase.from('events').insert(payload);
    if(error){toast(error.message,'error');return false}
    await loadEvents();return true
  }}])
};

async function loadAnnouncements(){
  const {data,error}=await supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){state.announcements=[];$('#announcementsList').innerHTML=empty('Announcements unavailable');renderHomeAnnouncement();return}
  state.announcements=data||[];
  const creatorName=id=>state.profiles.find(p=>p.id===id)?.full_name||state.profiles.find(p=>p.id===id)?.nickname||'SABIL GR';
  $('#announcementsList').innerHTML=state.announcements.length
    ? state.announcements.map(x=>`<div class="announcement-card ${x.highlighted?'highlighted':''}">
        ${x.highlighted?'<span class="announcement-dot" aria-hidden="true"></span>':''}
        <div class="event-top"><div><strong>${safe(x.title)}</strong><p class="announcement-meta">${safe(creatorName(x.created_by))} · ${fmtTs(x.created_at)}</p></div>
          ${isManagement()&&state.ownerEdit?`<button class="mini-action ${x.highlighted?'active':''}" data-announcement-mark="${x.id}" data-value="${x.highlighted?'false':'true'}">${x.highlighted?'Unmark':'Mark'}</button>`:''}
        </div>
        <p class="announcement-body">${safe(x.message||'')}</p>
      </div>`).join('')
    : empty('No announcements yet');
  renderHomeAnnouncement();
}
async function toggleAnnouncementHighlight(id,value){
  if(!isManagement()||!state.ownerEdit)return;
  const {error}=await supabase.from('announcements').update({highlighted:!!value}).eq('id',id);
  if(error)return toast(error.message,'error');
  loadAnnouncements();
}
$('#refreshUpdates').onclick=()=>Promise.allSettled([loadAnnouncements(),loadPolls()]);
$('#newAnnouncement').onclick=()=>{
  if(!isManagement()||!state.ownerEdit)return;
  openDialog('New announcement',
    `<div class="dialog-grid">
      ${field('Title','annTitle')}
      <div class="dialog-field"><label for="annMessage">Message</label><textarea id="annMessage"></textarea></div>
      <label class="dialog-check"><input id="annHighlight" type="checkbox"> Mark as new / important</label>
    </div>`,
    [{label:'Post',primary:true,run:async()=>{
      const title=$('#annTitle').value.trim(),message=$('#annMessage').value.trim();
      if(!title||!message){toast('Title and message are required','error');return false}
      const {error}=await supabase.from('announcements').insert({title,message,created_by:state.session.user.id,highlighted:$('#annHighlight').checked});
      if(error){toast(error.message,'error');return false}
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
    loadPolls();return true
  }}]
);

async function showSubpage(kind){nav('subpage');state.subpageKind=kind;const c=$('#subpageContent');c.innerHTML=empty('Loading…');if(kind==='team')return renderTeam(c);if(kind==='training')return renderTraining(c);if(kind==='results')return renderResults(c);if(kind==='rules')return renderRules(c);if(kind==='files')return renderFiles(c);if(kind==='settings')return renderSettings(c)}
async function renderTeam(c){await loadProfiles();c.innerHTML=`<div class="page-heading"><p class="eyebrow">Members</p><h2>Team</h2></div><div class="card-list">${state.profiles.map(p=>`<button class="member-card" data-member-id="${p.id}"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" alt="" class="profile-avatar">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.full_name||p.nickname||'Driver')} ${p.race_number?`#${safe(p.race_number)}`:''}</strong><p>${safe(effectiveRole(p)||'driver')} · ${safe(p.country||'')}</p><div class="profile-tags">${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div></div></button>`).join('')}</div>`}
function showMemberProfile(id){const p=state.profiles.find(x=>x.id===id);if(!p)return;nav('subpage');$('#subpageContent').innerHTML=`<div class="page-heading"><p class="eyebrow">Driver profile</p><h2>${safe(p.full_name||p.nickname||'Driver')}</h2></div><div class="hero-card"><div class="profile-row"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" class="profile-avatar" alt="">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.nickname||p.full_name||'')}</strong><p>${p.race_number?`#${safe(p.race_number)} · `:''}${safe(p.country||'')}</p></div></div><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div><div class="divider"></div><p><strong>Preferred sim:</strong> ${safe(p.preferred_sim||'—')}</p><p><strong>Preferred class:</strong> ${safe(p.preferred_class||'—')}</p><p><strong>Goal:</strong> ${safe(p.racing_goal||'—')}</p><p>${safe(p.bio||'')}</p></div>`}
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
  const {data,error}=await supabase.from('team_rules').select('*').eq('active',true).order('sort_order');
  c.innerHTML=`<div class="page-heading"><p class="eyebrow">Governance</p><h2>Rules</h2></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(r=>`<div class="rule-card"><div><span class="tag">${safe(r.category||'General')}</span><strong style="display:block;margin-top:10px">${safe(r.title)}</strong><p>${safe(r.body)}</p></div></div>`).join(''):empty('No active rules'))}</div>`
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
  c.innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Resources</p><h2>Files</h2></div>${isManagement()&&state.ownerEdit?`<div class="row gap-sm"><button class="chip-btn" data-file-upload="files">+ Files</button><button class="chip-btn" data-file-upload="folder">+ Folder</button></div>`:''}</div>
    ${isManagement()&&state.ownerEdit?`<div class="file-upload-controls"><label>Upload category<select id="fileUploadCategory"><option value="setups">Setups</option><option value="liveries">Liveries</option><option value="docs">Docs</option><option value="media">Photo & Clip Links</option><option value="files">Files</option></select></label></div>`:''}
    <div class="sim-filters">${filterButtons}</div>
    <div class="card-list">${error?empty(error.message):(filtered.length?filtered.map(f=>{
      const parts=String(f.name||'File').split('/'),display=parts.pop(),folder=parts.join('/');
      return `<div class="file-card file-card-v05"><div class="card-icon">↗</div><div class="file-main"><strong>${safe(display)}</strong>${folder?`<p class="file-folder">${safe(folder)}</p>`:''}<p>${safe(fileCategoryLabel(f.category))}${f.description?` · ${safe(f.description)}`:''}</p></div><div class="file-actions"><button class="small-action" data-file-download="${f.id}">Download</button>${isManagement()&&state.ownerEdit?`<button class="small-action danger" data-file-delete="${f.id}">Delete</button>`:''}</div></div>`
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
function pickTeamFiles(folder=false){
  if(!isManagement()||!state.ownerEdit)return;
  const input=document.createElement('input');input.type='file';input.multiple=true;
  if(folder)input.setAttribute('webkitdirectory','');
  input.onchange=()=>uploadTeamFiles([...input.files]);
  input.click()
}
async function uploadTeamFiles(files){
  if(!files.length)return;
  const category=$('#fileUploadCategory')?.value||'files',uid=state.session.user.id;
  let done=0,failed=0;toast(`Uploading ${files.length} file${files.length===1?'':'s'}…`);
  for(const file of files){
    const relative=String(file.webkitRelativePath||file.name||'file').replace(/\\/g,'/').replace(/^\/+/,'').slice(0,500);
    const objectPath=`${category}/${uid}/${Date.now()}-${crypto.randomUUID()}-${cleanObjectName(file.name)}`;
    const up=await supabase.storage.from(FILE_BUCKET).upload(objectPath,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(up.error){failed++;continue}
    const row={name:relative||file.name,category,description:null,storage_url:objectPath,external_url:null,access_type:'team',uploaded_by:uid};
    const ins=await supabase.from('team_files').insert(row);
    if(ins.error){failed++;await supabase.storage.from(FILE_BUCKET).remove([objectPath]);continue}
    done++
  }
  toast(`${done} uploaded${failed?` · ${failed} failed`:''}`,failed?'error':'info');
  renderFiles($('#subpageContent'))
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
  c.innerHTML=`<div class="page-heading"><p class="eyebrow">Account</p><h2>Settings</h2></div><div class="hero-card"><div class="profile-row"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" alt="" class="profile-avatar">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.full_name||p.nickname||state.session.user.email)}</strong><p>${safe(state.session.user.email)}</p></div></div><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div><div class="divider"></div><div class="settings-row"><div><strong>Mobile PWA</strong><p>Version 0.5 · same Supabase data as Desktop</p></div><button id="settingsInstall">Install</button></div>${isManagement()?`<div class="settings-row"><div><strong>Edit mode</strong><p>Announcements, events and file management</p></div><button id="settingsEdit">${state.ownerEdit?'Finish':'Edit'}</button></div>`:''}<div class="settings-row"><div><strong>Communication</strong><p>Chat and voice are handled in Discord</p></div></div><div class="settings-row"><div><strong>Session</strong><p>${safe(state.session.user.email)}</p></div><button id="logoutBtn" class="danger-btn">Log out</button></div></div>`;
  $('#logoutBtn').onclick=()=>supabase.auth.signOut();$('#settingsInstall').onclick=installPwa;
  if($('#settingsEdit'))$('#settingsEdit').onclick=()=>{state.ownerEdit=!state.ownerEdit;applyEditMode();renderSettings(c)}
}

function cleanupRealtime(){for(const ch of state.subscriptions){try{supabase.removeChannel(ch)}catch{}}state.subscriptions=[]}
function startRealtime(){cleanupRealtime();const specs=[['events',()=>{if(state.currentPage==='events')loadEvents();if(state.currentPage==='home')loadHome()}],['event_attendance',()=>state.currentPage==='subpage'&&state.subpageKind==='event'&&loadEvents()],['notifications',()=>state.currentPage==='home'&&loadHome()],['announcements',()=>{if(state.currentPage==='updates')loadAnnouncements();if(state.currentPage==='home')loadHome()}],['polls',()=>state.currentPage==='updates'&&loadPolls()],['poll_votes',()=>state.currentPage==='updates'&&loadPolls()],['results',()=>state.currentPage==='subpage'&&state.subpageKind==='results'&&renderResults($('#subpageContent'))],['team_files',()=>state.currentPage==='subpage'&&state.subpageKind==='files'&&renderFiles($('#subpageContent'))],['training_sessions',()=>state.currentPage==='subpage'&&state.subpageKind==='training'&&renderTraining($('#subpageContent'))],['profiles',()=>state.currentPage==='subpage'&&state.subpageKind==='team'&&renderTeam($('#subpageContent'))]];state.subscriptions=specs.map(([table,cb],i)=>supabase.channel(`mobile-v05-${i}`).on('postgres_changes',{event:'*',schema:'public',table},cb).subscribe())}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#installButton').classList.remove('hidden')});
$('#installButton').onclick=installPwa;
async function installPwa(){if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$('#installButton').classList.add('hidden')}else toast('On iPhone: Share → Add to Home Screen')}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
updateOnline();
