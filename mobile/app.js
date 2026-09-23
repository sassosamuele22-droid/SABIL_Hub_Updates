import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://enzqritietjhrdezdkxj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tzzD7ia5MXerBKnREOzAvA_7duHc6Lr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={session:null,profile:null,profiles:[],channels:[],activeChannel:'general',currentPage:'home',subscriptions:[],deferredInstall:null,ownerEdit:false,voiceRooms:[],voiceRoomMembers:{},currentVoiceRoom:null,voiceChannel:null,voicePeerId:null,voiceStream:null,voicePeers:new Map(),voiceMuted:false,voiceVolumes:{}};

const safe=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials=(n='?')=>n.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>d?new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';
const fmtTime=t=>t?String(t).slice(0,5):'—';
const fmtTs=t=>t?new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'';
const empty=t=>`<div class="empty">${safe(t)}</div>`;
const roleRank=r=>({owner:3,admin:2,driver:1}[String(r||'').toLowerCase()]||0);
const effectiveRole=p=>roleRank(p?.secondary_role)>roleRank(p?.role)?p.secondary_role:p?.role;
const isOwner=()=>effectiveRole(state.profile)==='owner';
const hasTag=(p,t)=>Array.isArray(p?.role_tags)&&p.role_tags.some(x=>String(x).toLowerCase()===t.toLowerCase());

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
async function enterApp(){ $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');await loadProfile();await loadProfiles();await Promise.allSettled([loadHome(),loadEvents(),loadChannels(),loadMessages(),loadDMRecipients(),loadPolls()]);startRealtime(); }

async function loadProfile(){const {data,error}=await supabase.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();if(error)toast(error.message,'error');state.profile=data||{id:state.session.user.id,full_name:state.session.user.email,role:'driver'};$('#avatarInitials').textContent=initials(state.profile.full_name||state.profile.nickname);$('#editModeButton').classList.toggle('hidden',!isOwner());applyEditMode()}
async function loadProfiles(){const {data,error}=await supabase.from('profiles').select('*').eq('active',true).order('full_name');if(error){toast(error.message,'error');return}state.profiles=data||[];fillDMRecipients()}

function applyEditMode(){document.body.classList.toggle('owner-editing',isOwner()&&state.ownerEdit);$('#editModeButton').textContent=state.ownerEdit?'Finish edit':'Edit'}
$('#editModeButton').onclick=()=>{if(!isOwner())return;state.ownerEdit=!state.ownerEdit;applyEditMode();toast(state.ownerEdit?'Owner edit mode on':'Owner edit mode off')};

function nav(page){state.currentPage=page;$$('.page').forEach(p=>p.classList.add('hidden'));$(`.page[data-page="${page}"]`)?.classList.remove('hidden');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));window.scrollTo(0,0);if(page==='home')loadHome();if(page==='events')loadEvents();if(page==='chat'){loadChannels();loadMessages();loadPolls()}if(page==='voice'){loadVoiceRooms()}}
$$('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));$('#profileButton').onclick=()=>showSubpage('settings');$('#backMore').onclick=()=>nav('more');$$('[data-subpage]').forEach(b=>b.onclick=()=>showSubpage(b.dataset.subpage));

function renderHomeProfile(){const p=state.profile||{};$('#homeProfile').innerHTML=`<p class="eyebrow">Signed in</p><h3>${safe(p.full_name||p.nickname||'Team member')}</h3><p>${safe(p.nickname||'')} ${p.race_number?`#${safe(p.race_number)}`:''}</p><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div>`}
async function loadHome(){renderHomeProfile();const [ev,act,not]=await Promise.all([
  supabase.from('events').select('*').gte('event_end_date',today()).order('event_date').limit(3),
  supabase.from('activity_log').select('*').order('created_at',{ascending:false}).limit(5),
  supabase.from('notifications').select('*').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(5)
]);$('#homeEvents').innerHTML=ev.error?empty('Events unavailable'):renderEvents(ev.data||[],true);$('#homeActivity').innerHTML=act.error?empty('Activity unavailable'):(act.data?.length?act.data.map(a=>`<div class="list-card"><div class="card-icon">↻</div><div><strong>${safe(a.action||'Activity')}</strong><p>${safe(a.details||a.entity_type||'')}</p><small>${fmtTs(a.created_at)}</small></div></div>`).join(''):empty('No recent activity'));$('#homeNotifications').innerHTML=not.error?empty('Notifications unavailable'):(not.data?.length?not.data.map(n=>`<div class="list-card"><div class="card-icon">${n.is_read?'○':'●'}</div><div><strong>${safe(n.title||'Notification')}</strong><p>${safe(n.message||'')}</p><small>${fmtTs(n.created_at)}</small></div></div>`).join(''):empty('No notifications'))}
$('#markNotificationsRead').onclick=async()=>{const {error}=await supabase.from('notifications').update({is_read:true}).eq('user_id',state.session.user.id).eq('is_read',false);if(error)return toast(error.message,'error');loadHome()};

async function loadEvents(){const {data,error}=await supabase.from('events').select('*').order('event_date',{ascending:false}).limit(50);$('#eventsList').innerHTML=error?empty(error.message):renderEvents(data||[],false)}
function renderEvents(events,compact=false){if(!events.length)return empty('No events yet');return events.map(e=>`<button class="event-card" data-event-id="${e.id}"><div class="event-top"><div><strong>${safe(e.name)}</strong><p>${safe(e.championship||e.simulation||'')}</p></div><span class="status-pill">${safe(e.status||'scheduled')}</span></div><div class="event-meta"><div class="meta-box"><small>Date</small><span>${fmtDate(e.event_date)} ${fmtTime(e.start_time)}</span></div><div class="meta-box"><small>Track</small><span>${safe(e.track||'—')}</span></div></div>${compact?'':`<p>${safe(e.notes||'')}</p>`}</button>`).join('')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-event-id]');if(b)showEventDetail(b.dataset.eventId);const m=e.target.closest('[data-member-id]');if(m)showMemberProfile(m.dataset.memberId)});
async function showEventDetail(id){nav('subpage');$('#subpageContent').innerHTML=empty('Loading event…');const [ev,en,at]=await Promise.all([supabase.from('events').select('*').eq('id',id).single(),supabase.from('event_entries').select('*').eq('event_id',id).order('created_at'),supabase.from('event_attendance').select('*').eq('event_id',id)]);if(ev.error){$('#subpageContent').innerHTML=empty(ev.error.message);return}const entries=en.data||[],attendance=at.data||[];let drivers={},schedule={};if(entries.length){const ids=entries.map(x=>x.id);const [{data:eds},{data:sch}]=await Promise.all([supabase.from('event_entry_drivers').select('*').in('entry_id',ids),supabase.from('entry_schedule_items').select('*').in('entry_id',ids).order('sort_order')]);for(const d of eds||[])(drivers[d.entry_id]??=[]).push(d.driver_id);for(const s of sch||[])(schedule[s.entry_id]??=[]).push(s)}
const my=attendance.find(a=>a.driver_id===state.session.user.id)?.status||'';
$('#subpageContent').innerHTML=`<div class="page-heading"><p class="eyebrow">${safe(ev.data.simulation||'Event')}</p><h2>${safe(ev.data.name)}</h2></div><div class="hero-card"><p>${safe(ev.data.championship||'')}</p><h3>${safe(ev.data.track||'—')}</h3><p>${fmtDate(ev.data.event_date)} · ${fmtTime(ev.data.start_time)}</p>${ev.data.notes?`<p>${safe(ev.data.notes)}</p>`:''}</div><div class="section-title"><h3>Your attendance</h3></div><div class="attendance-grid">${[['confirmed','Confirmed'],['unsure','Unsure'],['cant_race',"Can't race"]].map(([v,l])=>`<button class="attendance-btn ${my===v?'active':''}" data-attendance="${v}" data-event="${id}">${l}</button>`).join('')}</div><div class="section-title"><h3>Line-ups</h3></div><div class="card-list">${entries.length?entries.map(x=>`<div class="list-card"><div class="card-icon">#${safe(x.car_number||'')}</div><div><strong>${safe(x.entry_name||'Line-up')}</strong><p>${safe(x.vehicle||'')} · ${(drivers[x.id]||[]).map(uid=>safe(state.profiles.find(p=>p.id===uid)?.full_name||'Driver')).join(', ')||'No drivers'}</p>${(schedule[x.id]||[]).length?`<div class="profile-tags">${schedule[x.id].map(s=>`<span class="tag">${safe(s.item_type)} ${fmtTime(s.start_time)} · ${safe(state.profiles.find(p=>p.id===s.driver_id)?.nickname||'')}</span>`).join('')}</div>`:''}</div></div>`).join(''):empty('No line-ups')}</div>`}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-attendance]');if(!b)return;const payload={event_id:b.dataset.event,driver_id:state.session.user.id,status:b.dataset.attendance};const {error}=await supabase.from('event_attendance').upsert(payload,{onConflict:'event_id,driver_id'});if(error)return toast(error.message,'error');toast('Attendance updated');showEventDetail(b.dataset.event)});
$('#newEventButton').onclick=()=>{if(!isOwner()||!state.ownerEdit)return;openDialog('Create event',`<div class="dialog-grid">${field('Name','evName')}${field('Championship','evChamp')}${field('Simulation','evSim')}${field('Track','evTrack')}${field('Date','evDate','date')}${field('Start time','evTime','time')}<div class="dialog-field"><label>Notes</label><textarea id="evNotes"></textarea></div></div>`,[{label:'Create',primary:true,run:async()=>{const payload={name:$('#evName').value.trim(),championship:$('#evChamp').value.trim(),simulation:$('#evSim').value.trim(),track:$('#evTrack').value.trim(),event_date:$('#evDate').value,start_time:$('#evTime').value||null,notes:$('#evNotes').value.trim(),status:'open',created_by:state.session.user.id,event_end_date:$('#evDate').value};const {error}=await supabase.from('events').insert(payload);if(error){toast(error.message,'error');return false}loadEvents();return true}}])};

async function loadChannels(){const {data,error}=await supabase.from('custom_channels').select('*').eq('active',true).eq('channel_type','text').order('sort_order');const names=error?[]:(data||[]).map(x=>x.name);if(!names.includes('general'))names.unshift('general');state.channels=[...new Set(names)];if(!state.channels.includes(state.activeChannel))state.activeChannel=state.channels[0]||'general';$('#channelSelect').innerHTML=state.channels.map(c=>`<option ${c===state.activeChannel?'selected':''}>${safe(c)}</option>`).join('')}
$('#channelSelect').onchange=e=>{state.activeChannel=e.target.value;loadMessages();loadPolls()};
async function loadMessages(){const {data,error}=await supabase.from('messages').select('*').eq('channel',state.activeChannel).order('created_at',{ascending:true}).limit(120);if(error){$('#messagesList').innerHTML=empty(error.message);return}renderMessages(data||[],'#messagesList')}
function renderMessages(items,selector){const box=$(selector);if(!items.length){box.innerHTML=empty('No messages yet');return}box.innerHTML=items.map(m=>{const p=state.profiles.find(x=>x.id===m.sender_id),mine=m.sender_id===state.session.user.id;return `<div class="message ${mine?'mine':''}"><div class="message-head">${safe(p?.nickname||p?.full_name||'Driver')}</div><div class="message-body">${safe(m.message||'')}</div>${m.attachment_url?`<a href="${safe(m.attachment_url)}" target="_blank" rel="noopener">Attachment</a>`:''}<small>${fmtTs(m.created_at)}</small></div>`}).join('');box.scrollTop=box.scrollHeight}
$('#messageForm').onsubmit=async e=>{e.preventDefault();const i=$('#messageInput'),msg=i.value.trim();if(!msg)return;const {error}=await supabase.from('messages').insert({channel:state.activeChannel,sender_id:state.session.user.id,message:msg});if(error)return toast(error.message,'error');i.value='';loadMessages()};
$('#refreshChat').onclick=()=>{loadChannels();loadMessages();loadPolls()};
$('#addChannelButton').onclick=()=>{if(!isOwner()||!state.ownerEdit)return;openDialog('New text channel',`<div class="dialog-grid">${field('Channel name','chName')}</div>`,[{label:'Create',primary:true,run:async()=>{const name=$('#chName').value.trim().toLowerCase().replace(/\s+/g,'-');if(!name)return false;const {error}=await supabase.from('custom_channels').insert({name,channel_type:'text',sort_order:99,active:true,created_by:state.session.user.id});if(error){toast(error.message,'error');return false}await loadChannels();state.activeChannel=name;loadMessages();return true}}])};
$('#deleteChannelButton').onclick=async()=>{if(!isOwner()||!state.ownerEdit||state.activeChannel==='general')return toast('General cannot be removed','error');openDialog('Delete channel',`<p>Delete <strong>#${safe(state.activeChannel)}</strong>?</p>`,[{label:'Delete',danger:true,run:async()=>{const {error}=await supabase.from('custom_channels').update({active:false}).eq('name',state.activeChannel).eq('channel_type','text');if(error){toast(error.message,'error');return false}state.activeChannel='general';loadChannels();loadMessages();return true}}])};

function fillDMRecipients(){$('#dmRecipient').innerHTML='<option value="">Choose member…</option>'+state.profiles.filter(p=>p.id!==state.session?.user?.id).map(p=>`<option value="${p.id}">${safe(p.full_name||p.nickname||'Driver')}</option>`).join('')}
async function loadDMRecipients(){fillDMRecipients()}
$('#dmRecipient').onchange=loadDMs;
async function loadDMs(){const other=$('#dmRecipient').value;if(!other){$('#dmList').innerHTML=empty('Choose a member');return}const uid=state.session.user.id;const {data,error}=await supabase.from('direct_messages').select('*').or(`and(sender_id.eq.${uid},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${uid})`).order('created_at').limit(120);if(error){$('#dmList').innerHTML=empty(error.message);return}renderMessages(data||[],'#dmList')}
$('#dmForm').onsubmit=async e=>{e.preventDefault();const other=$('#dmRecipient').value,msg=$('#dmInput').value.trim();if(!other)return toast('Choose a member first','error');if(!msg)return;const {error}=await supabase.from('direct_messages').insert({sender_id:state.session.user.id,recipient_id:other,message:msg});if(error)return toast(error.message,'error');$('#dmInput').value='';loadDMs()};

$$('[data-chat-tab]').forEach(b=>b.onclick=()=>{$$('[data-chat-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#chatChannelsPane').classList.toggle('hidden',b.dataset.chatTab!=='channels');$('#chatDmsPane').classList.toggle('hidden',b.dataset.chatTab!=='dms');$('#chatPollsPane').classList.toggle('hidden',b.dataset.chatTab!=='polls');if(b.dataset.chatTab==='dms')loadDMs();if(b.dataset.chatTab==='polls')loadPolls()});
$('#messageInput').oninput=e=>renderMentions(e.target);
function renderMentions(input){const m=input.value.match(/(?:^|\s)@([\w-]*)$/),box=$('#mentionSuggestions');if(!m){box.classList.add('hidden');return}const q=m[1].toLowerCase(),staticTags=['drivers','admins','lmu','iracing'],users=state.profiles.map(p=>({key:(p.nickname||p.full_name||'').replace(/\s+/g,''),label:p.nickname||p.full_name}));const options=[...staticTags.map(x=>({key:x,label:`@${x}`})),...users].filter(x=>x.key.toLowerCase().includes(q)).slice(0,8);box.innerHTML=options.map(o=>`<button class="mention-item" data-mention="${safe(o.key)}">${safe(o.label)}</button>`).join('');box.classList.toggle('hidden',!options.length)}
$('#mentionSuggestions').onclick=e=>{const b=e.target.closest('[data-mention]');if(!b)return;const i=$('#messageInput');i.value=i.value.replace(/@([\w-]*)$/,`@${b.dataset.mention} `);$('#mentionSuggestions').classList.add('hidden');i.focus()};

async function loadPolls(){const {data,error}=await supabase.from('polls').select('*,poll_options(*)').eq('channel',state.activeChannel).order('created_at',{ascending:false}).limit(20);if(error){$('#pollsList').innerHTML=empty('Polls unavailable');return}const polls=data||[],ids=polls.map(p=>p.id);let votes=[];if(ids.length){const r=await supabase.from('poll_votes').select('*').in('poll_id',ids);votes=r.data||[]}$('#pollsList').innerHTML=polls.length?polls.map(p=>{const pv=votes.filter(v=>v.poll_id===p.id),mine=pv.filter(v=>v.user_id===state.session.user.id).map(v=>v.option_id);return `<div class="poll-card"><strong>${safe(p.question)}</strong><p>${p.multiple_choice?'Multiple answers':'One answer'}${p.closes_at?` · closes ${fmtTs(p.closes_at)}`:''}</p>${(p.poll_options||[]).sort((a,b)=>a.sort_order-b.sort_order).map(o=>`<button class="poll-option ${mine.includes(o.id)?'voted':''}" data-poll="${p.id}" data-option="${o.id}" data-multi="${p.multiple_choice?'1':'0'}"><span>${safe(o.option_text)}</span><span class="poll-count">${pv.filter(v=>v.option_id===o.id).length}</span></button>`).join('')}</div>`}).join(''):empty('No polls in this channel')}
$('#pollsList').onclick=async e=>{const b=e.target.closest('[data-option]');if(!b)return;const poll=b.dataset.poll,opt=b.dataset.option,multi=b.dataset.multi==='1';const {data:existing}=await supabase.from('poll_votes').select('*').eq('poll_id',poll).eq('user_id',state.session.user.id);const same=(existing||[]).find(v=>v.option_id===opt);if(same){await supabase.from('poll_votes').delete().eq('id',same.id)}else{if(!multi&&(existing||[]).length)await supabase.from('poll_votes').delete().eq('poll_id',poll).eq('user_id',state.session.user.id);const {error}=await supabase.from('poll_votes').insert({poll_id:poll,option_id:opt,user_id:state.session.user.id});if(error)return toast(error.message,'error')}loadPolls()};
$('#newPollButton').onclick=()=>openDialog('Create poll',`<div class="dialog-grid">${field('Question','pollQ')}<div class="dialog-field"><label>Options — one per line, 2–15</label><textarea id="pollOpts" placeholder="Option 1\nOption 2"></textarea></div><label><input id="pollMulti" type="checkbox"> Allow multiple answers</label></div>`,[{label:'Create',primary:true,run:async()=>{const q=$('#pollQ').value.trim(),opts=$('#pollOpts').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,15);if(!q||opts.length<2){toast('Need a question and at least 2 options','error');return false}const {data:p,error}=await supabase.from('polls').insert({channel:state.activeChannel,question:q,multiple_choice:$('#pollMulti').checked,anonymous:false,created_by:state.session.user.id}).select().single();if(error){toast(error.message,'error');return false}const {error:oe}=await supabase.from('poll_options').insert(opts.map((t,i)=>({poll_id:p.id,option_text:t,sort_order:i})));if(oe){toast(oe.message,'error');return false}loadPolls();return true}}]);

async function showSubpage(kind){nav('subpage');const c=$('#subpageContent');c.innerHTML=empty('Loading…');if(kind==='team')return renderTeam(c);if(kind==='training')return renderTraining(c);if(kind==='results')return renderResults(c);if(kind==='rules')return renderRules(c);if(kind==='files')return renderFiles(c);if(kind==='settings')return renderSettings(c)}
async function renderTeam(c){await loadProfiles();c.innerHTML=`<div class="page-heading"><p class="eyebrow">Members</p><h2>Team</h2></div><div class="card-list">${state.profiles.map(p=>`<button class="member-card" data-member-id="${p.id}"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" alt="" class="profile-avatar">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.full_name||p.nickname||'Driver')} ${p.race_number?`#${safe(p.race_number)}`:''}</strong><p>${safe(effectiveRole(p)||'driver')} · ${safe(p.country||'')}</p><div class="profile-tags">${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div></div></button>`).join('')}</div>`}
function showMemberProfile(id){const p=state.profiles.find(x=>x.id===id);if(!p)return;nav('subpage');$('#subpageContent').innerHTML=`<div class="page-heading"><p class="eyebrow">Driver profile</p><h2>${safe(p.full_name||p.nickname||'Driver')}</h2></div><div class="hero-card"><div class="profile-row"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" class="profile-avatar" alt="">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.nickname||p.full_name||'')}</strong><p>${p.race_number?`#${safe(p.race_number)} · `:''}${safe(p.country||'')}</p></div></div><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div><div class="divider"></div><p><strong>Preferred sim:</strong> ${safe(p.preferred_sim||'—')}</p><p><strong>Preferred class:</strong> ${safe(p.preferred_class||'—')}</p><p><strong>Goal:</strong> ${safe(p.racing_goal||'—')}</p><p>${safe(p.bio||'')}</p></div>`}
async function renderTraining(c){const {data,error}=await supabase.from('training_sessions').select('*').order('session_date',{ascending:false}).limit(50);c.innerHTML=`<div class="page-heading row-between"><div><p class="eyebrow">Practice</p><h2>Training</h2></div><button id="newTraining" class="chip-btn">+ Session</button></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(t=>`<div class="event-card"><div class="event-top"><div><strong>${safe(t.title)}</strong><p>${safe(t.simulation||'')} · ${safe(t.track||'')}</p></div><span class="status-pill">${safe(t.status||'planned')}</span></div><div class="event-meta"><div class="meta-box"><small>Date</small><span>${fmtDate(t.session_date)} ${fmtTime(t.start_time)}</span></div><div class="meta-box"><small>Duration</small><span>${t.duration_minutes||'—'} min</span></div></div>${t.notes?`<p>${safe(t.notes)}</p>`:''}</div>`).join(''):empty('No training sessions'))}</div>`;$('#newTraining').onclick=()=>openDialog('New training session',`<div class="dialog-grid">${field('Title','trTitle')}${field('Simulation','trSim')}${field('Track','trTrack')}${field('Date','trDate','date')}${field('Start time','trTime','time')}${field('Duration minutes','trDur','number','60')}<div class="dialog-field"><label>Notes</label><textarea id="trNotes"></textarea></div></div>`,[{label:'Create',primary:true,run:async()=>{const {error}=await supabase.from('training_sessions').insert({title:$('#trTitle').value.trim(),scope:'team',simulation:$('#trSim').value.trim(),track:$('#trTrack').value.trim(),session_date:$('#trDate').value,start_time:$('#trTime').value||null,duration_minutes:Number($('#trDur').value)||60,notes:$('#trNotes').value.trim(),status:'planned',created_by:state.session.user.id});if(error){toast(error.message,'error');return false}renderTraining(c);return true}}])}
async function renderResults(c){const {data,error}=await supabase.from('results').select('*').order('created_at',{ascending:false}).limit(50);c.innerHTML=`<div class="page-heading"><p class="eyebrow">Performance</p><h2>Results</h2></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(r=>`<div class="result-card"><div><strong>${safe(r.simulation||'Result')} · ${safe(r.track||'')}</strong><p>Q P${r.qualifying_position??'—'} · Start P${r.start_position??'—'} → Finish P${r.finish_position??'—'}</p><p>${safe(r.vehicle||'')} · Incidents ${r.incidents??'—'} · Fastest ${safe(r.fastest_lap||'—')}${r.split_number?` · Split ${r.split_number}/${r.split_total||'?'}`:''}</p></div></div>`).join(''):empty('No results'))}</div>`}
async function renderRules(c){const {data,error}=await supabase.from('team_rules').select('*').eq('active',true).order('sort_order');c.innerHTML=`<div class="page-heading"><p class="eyebrow">Governance</p><h2>Rules</h2></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(r=>`<div class="rule-card"><div><span class="tag">${safe(r.category||'General')}</span><strong style="display:block;margin-top:10px">${safe(r.title)}</strong><p>${safe(r.body)}</p></div></div>`).join(''):empty('No active rules'))}</div>`}
async function renderFiles(c){const {data,error}=await supabase.from('team_files').select('*').order('created_at',{ascending:false}).limit(50);c.innerHTML=`<div class="page-heading"><p class="eyebrow">Resources</p><h2>Files</h2></div><div class="card-list">${error?empty(error.message):(data?.length?data.map(f=>`<a class="file-card" href="${safe(f.external_url||f.storage_url||'#')}" target="_blank" rel="noopener"><div class="card-icon">↗</div><div><strong>${safe(f.name)}</strong><p>${safe(f.category||'')} · ${safe(f.description||'')}</p></div></a>`).join(''):empty('No team files'))}</div>`}
function renderSettings(c){const p=state.profile||{};c.innerHTML=`<div class="page-heading"><p class="eyebrow">Account</p><h2>Settings</h2></div><div class="hero-card"><div class="profile-row"><div class="profile-avatar">${p.avatar_url?`<img src="${safe(p.avatar_url)}" alt="" class="profile-avatar">`:initials(p.full_name||p.nickname)}</div><div><strong>${safe(p.full_name||p.nickname||state.session.user.email)}</strong><p>${safe(state.session.user.email)}</p></div></div><div class="profile-tags"><span class="tag white">${safe(effectiveRole(p)||'driver')}</span>${hasTag(p,'LMU Driver')?'<span class="tag">LMU Driver</span>':''}${hasTag(p,'iRacing Driver')?'<span class="tag">iRacing Driver</span>':''}</div><div class="divider"></div><div class="settings-row"><div><strong>PWA</strong><p>Add SABIL GR Hub to your Home Screen</p></div><button id="settingsInstall">Install</button></div>${isOwner()?`<div class="settings-row"><div><strong>Owner edit mode</strong><p>Show structural editing controls</p></div><button id="settingsEdit">${state.ownerEdit?'Finish':'Edit'}</button></div>`:''}<div class="settings-row"><div><strong>Session</strong><p>Same Supabase account as Windows</p></div><button id="logoutBtn" class="danger-btn">Log out</button></div></div>`;$('#logoutBtn').onclick=()=>supabase.auth.signOut();$('#settingsInstall').onclick=installPwa;if($('#settingsEdit'))$('#settingsEdit').onclick=()=>{state.ownerEdit=!state.ownerEdit;applyEditMode();renderSettings(c)}}



// ---- Mobile Voice (Supabase Realtime + WebRTC, compatible with Windows Hub) ----
function voiceRoomLabel(room){return state.voiceRooms.find(x=>x.room===room)?.label||room}
function voiceProfileName(uid){const p=state.profiles.find(x=>x.id===uid);return p?.nickname||p?.full_name||'Team member'}
function voiceProfileImage(uid){return state.profiles.find(x=>x.id===uid)?.avatar_url||''}
function randomPeerId(){return (crypto.randomUUID?.()||('m-'+Math.random().toString(36).slice(2)+Date.now().toString(36)))}
async function loadVoiceRooms(){
  const [cc,entries,eds,events]=await Promise.all([
    supabase.from('custom_channels').select('*').eq('active',true).eq('channel_type','voice').order('sort_order'),
    supabase.from('event_entries').select('id,event_id,entry_name,status').order('created_at'),
    supabase.from('event_entry_drivers').select('entry_id,driver_id'),
    supabase.from('events').select('id,name,status,event_date').order('event_date')
  ]);
  const rooms=[];
  for(const c of cc.data||[])rooms.push({room:`customvoice:${c.id}`,label:c.name,private:false});
  const me=state.session?.user?.id, elevated=['owner','admin'].includes(String(effectiveRole(state.profile)||'').toLowerCase());
  const em=Object.fromEntries((events.data||[]).map(e=>[e.id,e]));
  for(const en of entries.data||[]){
    const assigned=(eds.data||[]).some(d=>d.entry_id===en.id&&d.driver_id===me);
    if(assigned||elevated){const ev=em[en.event_id];rooms.push({room:`entryvoice:${en.id}`,label:`Line-up · ${ev?.name||'Event'} · ${en.entry_name||'Entry'}`,private:true});}
  }
  state.voiceRooms=rooms;
  await syncVoiceRoomWatchers();
  renderVoiceRooms();
  renderCurrentVoiceMembers();
}
async function syncVoiceRoomWatchers(){
  state.voiceWatchers??=new Map();
  const wanted=new Set(state.voiceRooms.map(r=>r.room));
  for(const [room,ch] of state.voiceWatchers){if(!wanted.has(room)&&room!==state.currentVoiceRoom){try{await supabase.removeChannel(ch)}catch{}state.voiceWatchers.delete(room)}}
  for(const room of wanted){if(state.voiceWatchers.has(room)||room===state.currentVoiceRoom)continue;const ch=makeVoiceChannel(room,false);state.voiceWatchers.set(room,ch);ch.subscribe();}
}
function makeVoiceChannel(room,active){
  const key=`mobile:${state.session.user.id}:${randomPeerId()}`;
  const ch=supabase.channel(`sabil-voice:${room}`,{config:{private:false,broadcast:{self:false},presence:{key}}});
  ch.on('presence',{event:'sync'},()=>{
    const members=presenceMembers(ch);state.voiceRoomMembers[room]=members;renderVoiceRooms();
    if(active&&state.currentVoiceRoom===room){renderCurrentVoiceMembers();syncVoicePeers(members);}
  });
  if(active)ch.on('broadcast',{event:'signal'},({payload})=>{if(payload?.target===state.voicePeerId)handleVoiceSignal(payload.from,payload.data)});
  return ch;
}
function presenceMembers(ch){
  const out=[];for(const [key,arr] of Object.entries(ch.presenceState()||{}))for(const p of arr||[]){if(p?.userId)out.push({peerId:p.peerId||key,userId:p.userId,userName:p.userName||voiceProfileName(p.userId),profileImage:p.profileImage||voiceProfileImage(p.userId)})}return out;
}
function renderVoiceRooms(){
  const box=$('#voiceRoomsList');if(!box)return;if(!state.voiceRooms.length){box.innerHTML=empty('No voice channels available');return}
  box.innerHTML=state.voiceRooms.map(r=>{const members=state.voiceRoomMembers[r.room]||[],on=state.currentVoiceRoom===r.room;return `<div class="list-card voice-room"><div class="voice-room-main"><div class="card-icon">${r.private?'🔒':'🎙'}</div><div class="voice-room-meta"><strong>${safe(r.label)}</strong><p>${r.private?'Private line-up room':'Team voice channel'} · <span class="voice-room-count ${members.length?'live':''}">${members.length} connected</span></p></div></div><button class="voice-join ${on?'connected':''}" data-voice-room="${safe(r.room)}">${on?'Joined':'Join'}</button></div>`}).join('');
}
$('#voiceRoomsList').onclick=e=>{const b=e.target.closest('[data-voice-room]');if(!b)return;if(state.currentVoiceRoom===b.dataset.voiceRoom)return;joinVoice(b.dataset.voiceRoom)};
$('#refreshVoice').onclick=loadVoiceRooms;
$('#leaveVoiceButton').onclick=leaveVoice;
$('#muteVoiceButton').onclick=()=>{state.voiceMuted=!state.voiceMuted;for(const t of state.voiceStream?.getAudioTracks?.()||[])t.enabled=!state.voiceMuted;$('#muteVoiceButton').textContent=state.voiceMuted?'Unmute':'Mute';$('#muteVoiceButton').classList.toggle('active',state.voiceMuted)};
async function joinVoice(room){
  await leaveVoice(false);
  try{state.voiceStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}catch(e){toast('Microphone permission is required for voice.','error');return}
  state.currentVoiceRoom=room;state.voicePeerId=randomPeerId();state.voiceMuted=false;
  $('#voiceStatus').textContent=`Connecting to ${voiceRoomLabel(room)}…`;$('#voiceStatusSub').textContent='Microphone active';$('#muteVoiceButton').classList.remove('hidden');$('#leaveVoiceButton').classList.remove('hidden');
  const oldWatcher=state.voiceWatchers?.get(room);if(oldWatcher){try{await supabase.removeChannel(oldWatcher)}catch{}state.voiceWatchers.delete(room)}
  const ch=makeVoiceChannel(room,true);state.voiceChannel=ch;
  await new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>{if(!done){done=true;reject(new Error('Voice room timeout'))}},8000);ch.subscribe(async status=>{if(status==='SUBSCRIBED'&&!done){done=true;clearTimeout(timer);try{await ch.track({peerId:state.voicePeerId,userId:state.session.user.id,userName:state.profile?.full_name||state.profile?.nickname||'Team member',profileImage:state.profile?.avatar_url||''});resolve()}catch(e){reject(e)}}})}).catch(async e=>{toast(e.message||'Voice connection failed','error');await leaveVoice();throw e});
  $('#voiceStatus').textContent=`Connected · ${voiceRoomLabel(room)}`;$('#voiceStatusSub').textContent='Mobile ↔ Windows voice active';state.voiceRoomMembers[room]=presenceMembers(ch);renderVoiceRooms();renderCurrentVoiceMembers();syncVoicePeers(state.voiceRoomMembers[room]);
}
async function leaveVoice(rewatch=true){
  const room=state.currentVoiceRoom,ch=state.voiceChannel;
  for(const pc of state.voicePeers.values())try{pc.close()}catch{}state.voicePeers.clear();
  $('#remoteAudio').innerHTML='';for(const t of state.voiceStream?.getTracks?.()||[])try{t.stop()}catch{}state.voiceStream=null;
  state.currentVoiceRoom=null;state.voicePeerId=null;state.voiceChannel=null;state.voiceMuted=false;
  if(ch){try{await ch.untrack()}catch{}try{await supabase.removeChannel(ch)}catch{}}
  $('#voiceStatus').textContent='Not connected';$('#voiceStatusSub').textContent='Choose a room to join.';$('#muteVoiceButton').classList.add('hidden');$('#leaveVoiceButton').classList.add('hidden');$('#muteVoiceButton').textContent='Mute';$('#muteVoiceButton').classList.remove('active');
  if(room&&rewatch){const watcher=makeVoiceChannel(room,false);state.voiceWatchers??=new Map();state.voiceWatchers.set(room,watcher);watcher.subscribe()}
  renderVoiceRooms();renderCurrentVoiceMembers();
}
function renderCurrentVoiceMembers(){
  const box=$('#voiceMembersList');if(!box)return;if(!state.currentVoiceRoom){box.innerHTML=empty('Join a room to see members');return}
  const members=state.voiceRoomMembers[state.currentVoiceRoom]||[];if(!members.length){box.innerHTML=empty('Connecting…');return}
  box.innerHTML=members.map(m=>{const self=m.peerId===state.voicePeerId,v=state.voiceVolumes[m.peerId]??1;return `<div class="list-card voice-member"><div class="voice-avatar">${m.profileImage?`<img src="${safe(m.profileImage)}" alt="">`:initials(m.userName)}</div><div><strong>${safe(m.userName)}${self?' · You':''}</strong><p>${self?(state.voiceMuted?'Muted':'Microphone active'):'Connected'}</p></div>${self?'':`<label class="volume-wrap"><span>Vol</span><input type="range" min="0" max="1" step="0.05" value="${v}" data-peer-volume="${safe(m.peerId)}"></label>`}</div>`}).join('');
}
$('#voiceMembersList').oninput=e=>{const i=e.target.closest('[data-peer-volume]');if(!i)return;state.voiceVolumes[i.dataset.peerVolume]=Number(i.value);document.querySelectorAll(`audio[data-peer="${CSS.escape(i.dataset.peerVolume)}"]`).forEach(a=>a.volume=Number(i.value))};
function syncVoicePeers(members){
  if(!state.currentVoiceRoom)return;const others=(members||[]).filter(m=>m.peerId!==state.voicePeerId),alive=new Set(others.map(m=>m.peerId));
  for(const [id,pc] of state.voicePeers)if(!alive.has(id)){pc.close();state.voicePeers.delete(id);document.querySelectorAll(`audio[data-peer="${CSS.escape(id)}"]`).forEach(x=>x.remove())}
  for(const m of others)if(!state.voicePeers.has(m.peerId))makeVoicePeer(m.peerId,String(state.voicePeerId)<String(m.peerId));renderCurrentVoiceMembers();
}
function makeVoicePeer(peerId,initiator){
  if(state.voicePeers.has(peerId))return state.voicePeers.get(peerId);const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});state.voicePeers.set(peerId,pc);
  for(const t of state.voiceStream?.getAudioTracks?.()||[])pc.addTrack(t,state.voiceStream);
  pc.onicecandidate=e=>{if(e.candidate)sendVoiceSignal(peerId,{candidate:e.candidate})};
  pc.ontrack=e=>{if(e.track.kind!=='audio')return;let el=document.querySelector(`audio[data-peer="${CSS.escape(peerId)}"]`);if(!el){el=document.createElement('audio');el.autoplay=true;el.playsInline=true;el.dataset.peer=peerId;el.volume=state.voiceVolumes[peerId]??1;$('#remoteAudio').appendChild(el)}el.srcObject=e.streams[0]||new MediaStream([e.track]);el.play?.().catch(()=>{})};
  pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){pc.close();state.voicePeers.delete(peerId)}};
  if(initiator)pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>sendVoiceSignal(peerId,{sdp:pc.localDescription})).catch(e=>console.warn('voice offer',e));return pc;
}
async function sendVoiceSignal(target,data){if(!state.voiceChannel||!state.voicePeerId)return;try{await state.voiceChannel.send({type:'broadcast',event:'signal',payload:{from:state.voicePeerId,target,data}})}catch(e){console.warn('voice signal send',e)}}
async function handleVoiceSignal(from,data){
  const pc=state.voicePeers.get(from)||makeVoicePeer(from,false);
  try{if(data?.sdp){await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));if(data.sdp.type==='offer'){const ans=await pc.createAnswer();await pc.setLocalDescription(ans);await sendVoiceSignal(from,{sdp:pc.localDescription})}}else if(data?.candidate){await pc.addIceCandidate(new RTCIceCandidate(data.candidate))}}catch(e){console.warn('voice signal',e)}
}

function cleanupRealtime(){for(const ch of state.subscriptions){try{supabase.removeChannel(ch)}catch{}}state.subscriptions=[];if(state.currentVoiceRoom)leaveVoice(false);for(const ch of state.voiceWatchers?.values?.()||[])try{supabase.removeChannel(ch)}catch{}state.voiceWatchers?.clear?.()}
function startRealtime(){cleanupRealtime();const specs=[['messages',()=>state.currentPage==='chat'&&loadMessages()],['direct_messages',()=>state.currentPage==='chat'&&loadDMs()],['events',()=>{if(state.currentPage==='events')loadEvents();if(state.currentPage==='home')loadHome()}],['notifications',()=>state.currentPage==='home'&&loadHome()],['custom_channels',()=>state.currentPage==='chat'&&loadChannels()],['polls',()=>state.currentPage==='chat'&&loadPolls()],['poll_votes',()=>state.currentPage==='chat'&&loadPolls()]];state.subscriptions=specs.map(([table,cb],i)=>supabase.channel(`mobile-v02-${i}`).on('postgres_changes',{event:'*',schema:'public',table},cb).subscribe())}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#installButton').classList.remove('hidden')});
$('#installButton').onclick=installPwa;
async function installPwa(){if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$('#installButton').classList.add('hidden')}else toast('On iPhone: Share → Add to Home Screen')}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
updateOnline();
