import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import multer from "multer";
import { createWorker } from "tesseract.js";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const SUPABASE_URL="https://enzqritietjhrdezdkxj.supabase.co";
const SUPABASE_KEY="sb_publishable_tzzD7ia5MXerBKnREOzAvA_7duHc6Lr";
const BUCKET="sabil-files";
const app=express(),httpServer=http.createServer(app),io=new SocketIOServer(httpServer,{cors:{origin:"*"}});
const PORT=process.env.PORT||32145;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});
app.use(express.json({limit:"8mb"}));app.use(express.static(path.join(__dirname,"public")));
const base=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let sharedSyncVersion=Date.now();
let sharedSyncLastTable="startup";
const SHARED_SYNC_TABLES=["profiles","events","event_entries","event_entry_drivers","entry_schedule_items","event_attendance","results","training_sessions","team_files","team_cars","announcements","polls","poll_options","poll_votes","team_rules","notifications","file_folders"];
let sharedSyncChannel=base.channel("desktop-shared-sync-v0910");
for(const table of SHARED_SYNC_TABLES){
  sharedSyncChannel=sharedSyncChannel.on("postgres_changes",{event:"*",schema:"public",table},()=>{sharedSyncVersion=Date.now();sharedSyncLastTable=table});
}
sharedSyncChannel.subscribe(status=>{if(status==="SUBSCRIBED")console.log("Shared cloud sync connected");else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status))console.warn("Shared cloud sync status:",status)});
const clientCache=new Map();
const authCache=new Map();
const authPending=new Map();
const AUTH_CACHE_MS=15000;
function sbFor(token){
  let sb=clientCache.get(token);
  if(!sb){sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});clientCache.set(token,sb);if(clientCache.size>12)clientCache.delete(clientCache.keys().next().value)}
  return sb;
}
function err(res,e,code=400){console.error(e);return res.status(code).json({error:e?.message||String(e)||"Request failed"})}
async function resolveSession(token){
  const hit=authCache.get(token);if(hit&&Date.now()-hit.at<AUTH_CACHE_MS)return hit;
  if(authPending.has(token))return authPending.get(token);
  const work=(async()=>{
    const {data,error}=await base.auth.getUser(token);if(error||!data.user)throw new Error("Session expired");
    const sb=sbFor(token);const {data:p,error:pe}=await sb.from("profiles").select("*").eq("id",data.user.id).single();if(pe)throw pe;
    const out={at:Date.now(),user:data.user,profile:p||null,sb};authCache.set(token,out);return out;
  })().finally(()=>authPending.delete(token));
  authPending.set(token,work);return work;
}
async function auth(req,res,next){const h=req.headers.authorization||"",token=h.startsWith("Bearer ")?h.slice(7):"";if(!token)return res.status(401).json({error:"Not signed in"});try{const a=await resolveSession(token);req.token=token;req.authUser=a.user;req.sb=a.sb;req.profile=a.profile;if(a.profile?.active===false)return res.status(403).json({error:"Your team access has been revoked."});if(a.profile?.approval_status!=="approved")return res.status(403).json({error:"Your account is awaiting team owner approval."});if(a.profile?.suspended_until&&new Date(a.profile.suspended_until)>new Date())return res.status(403).json({error:`Your team access is suspended until ${new Date(a.profile.suspended_until).toLocaleString()}.`});next()}catch(e){authCache.delete(token);clientCache.delete(token);return res.status(401).json({error:e?.message||"Session expired"})}}
app.get("/api/health",(_req,res)=>res.json({ok:true,version:"0.9.13"}));
app.get("/api/sync-version",auth,async(req,res)=>{const {data,error}=await req.sb.from("client_sync_state").select("revision,updated_at,last_table").eq("id",1).single();if(error)return err(res,error);res.json({version:Number(data?.revision||0),updatedAt:data?.updated_at||null,table:data?.last_table||null})});
const roleValues=(p)=>[p?.role,p?.secondary_role].filter(Boolean);
const roleOk=(p,roles)=>p&&roleValues(p).some(r=>roles.includes(r));
function effectiveRole(p){const rs=roleValues(p);return rs.includes('owner')?'owner':rs.includes('admin')?'admin':'driver'}
const manager=(req,res,next)=>roleOk(req.profile,["owner","admin"])?next():res.status(403).json({error:"Owner/Admin access required."});
const coachAnnouncements=(req,res,next)=>roleOk(req.profile,["owner","admin"])||Array.isArray(req.profile?.role_tags)&&req.profile.role_tags.includes("coach")?next():res.status(403).json({error:"Owner/Admin/Coach access required."});
const hasCoach=p=>Array.isArray(p?.role_tags)&&p.role_tags.includes('coach');
const canUseSim=(p,sim)=>roleOk(p,['owner','admin'])||Array.isArray(p?.role_tags)&&(String(sim||'').toLowerCase().includes('iracing')&&p.role_tags.includes('iracing_driver')||(String(sim||'').toLowerCase().includes('le mans')||String(sim||'').toLowerCase()==='lmu')&&p.role_tags.includes('lmu_driver'));
const coachEvent=async(req,res,next)=>{
 if(roleOk(req.profile,['owner','admin']))return next();
 if(!hasCoach(req.profile))return res.status(403).json({error:'Owner, Admin or Coach required'});
 const sim=req.method==='POST'?req.body.sim:(await req.sb.from('events').select('simulation').eq('id',req.params.id).maybeSingle()).data?.simulation;
 if(String(sim||'').toLowerCase().includes('iracing'))return next();
 return res.status(403).json({error:'Coach can manage iRacing events only.'});
};
const ownerOnly=(req,res,next)=>roleOk(req.profile,["owner"])?next():res.status(403).json({error:"Only the team owner can do this."});
const adminOk=(req,res,next)=>roleOk(req.profile,["owner","admin"])?next():res.status(403).json({error:"Owner/Admin access required."});
function normalizeModerationText(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[@4]/g,"a").replace(/[3]/g,"e").replace(/[1!|]/g,"i").replace(/[0]/g,"o").replace(/[$5]/g,"s").replace(/[7]/g,"t").replace(/[^a-z0-9]+/g," ").trim()}
const blockedHatePatterns=[/\bn+[i1]+g+[e3]+r+s?\b/i,/\bk+[i1]+k+[e3]+s?\b/i,/\bch+[i1]+n+k+s?\b/i,/\bsp+[i1]+c+s?\b/i,/\bg+[o0]+[o0]+k+s?\b/i,/\bw+[e3]+tb+a+c+k+s?\b/i,/\bc+[o0]+[o0]+n+s?\b/i,/\bbean+e+r+s?\b/i,/\bt+[o0]+w+e+l+h+e+a+d+s?\b/i];
function violatesTeamSafety(text){const n=normalizeModerationText(text).replace(/ /g,"");return blockedHatePatterns.some(r=>r.test(n))}
async function signed(sb,p){if(!p)return"";if(/^https?:\/\//i.test(p))return p;const {data}=await sb.storage.from(BUCKET).createSignedUrl(p,3600);return data?.signedUrl||""}
function profilePub(p,email=""){return{id:p.id,name:p.full_name||"",email,role:effectiveRole(p),primaryRole:p.role||"driver",secondaryRole:p.secondary_role||"",driverTags:Array.isArray(p.role_tags)?p.role_tags.filter(x=>["lmu_driver","iracing_driver","coach","rookie"].includes(x)):[],discipline:"simracing",number:p.race_number||"",nickname:p.nickname||"",country:p.country||"",nationality:p.country||"",preferredSim:p.preferred_sim||"",preferredClass:p.preferred_class||"",goal:p.racing_goal||"",bio:p.bio||"",profileImage:p.avatar_url||"",active:p.active!==false,approvalStatus:p.approval_status||"pending",approvedAt:p.approved_at||null,coach:(p.role_tags||[]).includes("coach"),rookie:(p.role_tags||[]).includes("rookie"),suspendedUntil:p.suspended_until||null}}
async function logActivity(req,action,entityType=null,entityId=null,details=null){try{await req.sb.from("activity_log").insert({actor_id:req.authUser.id,action,entity_type:entityType,entity_id:entityId,details})}catch(e){console.error("activity log",e?.message||e)}}
async function notifyUsers(){/* Authoritative important notifications are created via database INSERT triggers. */}
async function notifyAll(){/* No manual notifications for edits or small actions. */}
function stats(rr){const f=rr.filter(r=>Number(r.finish)>0);return{races:rr.length,wins:rr.filter(r=>Number(r.finish)===1).length,podiums:rr.filter(r=>Number(r.finish)>=1&&Number(r.finish)<=3).length,poles:rr.filter(r=>Number(r.quali)===1).length,avgFinish:f.length?Math.round(f.reduce((s,r)=>s+Number(r.finish),0)/f.length*100)/100:0,avgGain:rr.length?Math.round(rr.reduce((s,r)=>s+(r.positionsGained||0),0)/rr.length*100)/100:0,incidents:rr.reduce((s,r)=>s+Number(r.incidents||0),0)}}
function rating(rr){if(!rr.length)return 0;const s=stats(rr);return Math.max(0,Math.round(Math.max(0,100-(s.avgFinish-1)*5)+s.wins*3+s.podiums*2+s.poles+Math.max(-10,Math.min(10,s.avgGain*2))))}

app.post("/api/register",async(req,res)=>{const{name,email,password,nationality,nickname,raceNumber,preferredSim,preferredClass}=req.body;if(!name||!email||!password||!nationality)return res.status(400).json({error:"Name, email, password and nationality are required."});const {data,error}=await base.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)return err(res,error);if(!data.session)return res.json({pending:true,message:"Account created. Check your email, then wait for owner approval."});const sb=sbFor(data.session.access_token);let {data:p}=await sb.from("profiles").select("*").eq("id",data.user.id).single();for(let i=0;!p&&i<5;i++){await new Promise(r=>setTimeout(r,250));({data:p}=await sb.from("profiles").select("*").eq("id",data.user.id).single())}const patch={full_name:name,country:nationality,nickname:nickname||null,race_number:raceNumber||null,preferred_sim:preferredSim||null,preferred_class:preferredClass||null};const {data:updated}=await sb.from("profiles").update(patch).eq("id",data.user.id).select().single();res.json({pending:true,message:"Account created. Wait for the team owner to approve your access."})});
app.post("/api/login",async(req,res)=>{const {data,error}=await base.auth.signInWithPassword({email:req.body.email||"",password:req.body.password||""});if(error)return err(res,error,401);const sb=sbFor(data.session.access_token);const {data:p,error:pe}=await sb.from("profiles").select("*").eq("id",data.user.id).single();if(pe)return err(res,pe);if(p?.active===false)return res.status(403).json({error:"Your team access has been revoked."});if(p?.approval_status!=="approved")return res.status(403).json({error:"Your account is awaiting team owner approval."});if(p?.suspended_until&&new Date(p.suspended_until)>new Date())return res.status(403).json({error:`Your team access is suspended until ${new Date(p.suspended_until).toLocaleString()}.`});res.json({token:data.session.access_token,refreshToken:data.session.refresh_token,user:profilePub(p,data.user.email)})});
app.post("/api/password-reset",async(req,res)=>{const email=String(req.body.email||"").trim();if(!email)return res.status(400).json({error:"Email required."});const {error}=await base.auth.resetPasswordForEmail(email);if(error)return err(res,error);res.json({ok:true})});
app.post("/api/password-change",auth,async(req,res)=>{const password=String(req.body.password||"");if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:"PUT",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${req.token}`,"Content-Type":"application/json"},body:JSON.stringify({password})});if(!r.ok){const d=await r.json().catch(()=>({}));return res.status(r.status).json({error:d?.msg||d?.message||"Password change failed."})}res.json({ok:true})});
app.post("/api/refresh",async(req,res)=>{const {data,error}=await base.auth.refreshSession({refresh_token:req.body.refreshToken||""});if(error||!data.session)return err(res,error||new Error("Could not refresh session"),401);const sb=sbFor(data.session.access_token);const {data:p}=await sb.from("profiles").select("*").eq("id",data.user.id).single();res.json({token:data.session.access_token,refreshToken:data.session.refresh_token,user:profilePub(p,data.user.email)})});
app.get("/api/me",auth,async(req,res)=>{let p={...req.profile};p.avatar_url=await signed(req.sb,p.avatar_url);res.json(profilePub(p,req.authUser.email))});
app.put("/api/me",auth,async(req,res)=>{const b=req.body;let avatar=b.profileImage||"";const patch={full_name:b.name,nickname:b.nickname,race_number:b.number,country:b.country,preferred_sim:b.preferredSim,preferred_class:b.preferredClass,racing_goal:b.goal,bio:b.bio};if(avatar&&!avatar.startsWith("data:")&&!/^https?:\/\//i.test(avatar))patch.avatar_url=avatar;const {data,error}=await req.sb.from("profiles").update(patch).eq("id",req.authUser.id).select().single();if(error)return err(res,error);authCache.delete(req.token);let p={...data};p.avatar_url=await signed(req.sb,p.avatar_url);res.json(profilePub(p,req.authUser.email))});

async function allResults(sb){const [{data:rs,error:re},{data:es},{data:entries},{data:eds}]=await Promise.all([sb.from("results").select("*").order("created_at",{ascending:true}),sb.from("events").select("id,name,event_date"),sb.from("event_entries").select("id,entry_name"),sb.from("event_entry_drivers").select("entry_id,driver_id")]);if(re)throw re;const em=Object.fromEntries((es||[]).map(x=>[x.id,x])),enm=Object.fromEntries((entries||[]).map(x=>[x.id,x])),driversByEntry={};for(const x of eds||[])(driversByEntry[x.entry_id]??=[]).push(x.driver_id);return (rs||[]).map(r=>({id:r.id,eventId:r.event_id,entryId:r.entry_id,event:em[r.event_id]?.name||"Official team race",entryName:enm[r.entry_id]?.entry_name||"",sim:r.simulation||"",vehicle:r.vehicle||"",track:r.track||"",start:Number(r.start_position||0),finish:Number(r.finish_position||0),quali:Number(r.qualifying_position||0),incidents:Number(r.incidents||0),fastestLap:r.fastest_lap||"",splitNumber:Number(r.split_number||0),splitTotal:Number(r.split_total||0),screenshotPath:r.screenshot_url||"",official:r.official!==false,date:em[r.event_id]?.event_date||String(r.created_at||"").slice(0,10),positionsGained:(r.start_position&&r.finish_position)?Number(r.start_position)-Number(r.finish_position):0,driverIds:driversByEntry[r.entry_id]||[]}))}
app.get("/api/results",auth,async(req,res)=>{try{let rr=await allResults(req.sb);await Promise.all(rr.map(async r=>{r.screenshot=await signed(req.sb,r.screenshotPath)}));res.json(rr)}catch(e){err(res,e)}});
app.post("/api/results",auth,async(req,res)=>{const b=req.body;if(!b.eventId||!b.entryId)return res.status(400).json({error:"Select a finished event and one of its line-ups."});if(!Number(b.start)||!Number(b.finish)||!Number(b.quali))return res.status(400).json({error:"Start, finish and qualifying position are required."});const {data:event,error:ee}=await req.sb.from("events").select("*").eq("id",b.eventId).single();if(ee||!event)return res.status(404).json({error:"Event not found."});if(event.status!=="finished")return res.status(400).json({error:"The event must be marked Finished before a result can be created."});const {data:entry,error:enErr}=await req.sb.from("event_entries").select("*").eq("id",b.entryId).eq("event_id",b.eventId).single();if(enErr||!entry)return res.status(400).json({error:"That line-up does not belong to the selected event."});if(entry.created_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Only this line-up boss or management may publish its result."});const {data:existing}=await req.sb.from("results").select("id").eq("event_id",b.eventId).eq("entry_id",b.entryId).maybeSingle();if(existing)return res.status(409).json({error:"A result already exists for this entry."});const splitNumber=Number(b.splitNumber||0),splitTotal=Number(b.splitTotal||0);if((splitNumber||splitTotal)&&(!splitNumber||!splitTotal||splitNumber>splitTotal))return res.status(400).json({error:"Enter a valid split, for example Split 2 of 5."});const row={event_id:b.eventId,entry_id:b.entryId,simulation:event.simulation||b.sim||"",vehicle:entry.vehicle||event.team_car||b.vehicle||"",track:event.track||b.track||"",start_position:Number(b.start||0)||null,finish_position:Number(b.finish||0)||null,qualifying_position:Number(b.quali||0)||null,incidents:Number(b.incidents||0)||null,fastest_lap:b.fastestLap||null,split_number:splitNumber||null,split_total:splitTotal||null,screenshot_url:b.screenshot||null,official:true,created_by:req.authUser.id};const {data,error}=await req.sb.from("results").insert(row).select().single();if(error)return err(res,error);const {data:drivers}=await req.sb.from("event_entry_drivers").select("driver_id").eq("entry_id",b.entryId);await logActivity(req,"Result created","result",data.id,`${event.name} · ${entry.entry_name||"Entry"} · P${row.finish_position||"?"}`);await notifyUsers(req,(drivers||[]).map(x=>x.driver_id),"Race result added",`${event.name} · ${entry.entry_name||"Entry"} · P${row.finish_position||"?"}`,"result","result",data.id);res.json(data)});
app.get("/api/stats",auth,async(req,res)=>{try{res.json(stats((await allResults(req.sb)).filter(r=>r.official)))}catch(e){err(res,e)}});

function cleanEventClasses(value){return [...new Set((Array.isArray(value)?value:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,20)}
async function getEvents(sb){const [{data:ev,error},{data:ens},{data:eds},{data:ats},{data:sched}]=await Promise.all([sb.from("events").select("*").order("event_date",{ascending:true}),sb.from("event_entries").select("*").order("created_at"),sb.from("event_entry_drivers").select("*"),sb.from("event_attendance").select("*"),sb.from("entry_schedule_items").select("*").order("session_date").order("start_time").order("sort_order")]);if(error)throw error;const entriesByEvent={},driversByEntry={},scheduleByEntry={},attendanceByEvent={};for(const x of eds||[])(driversByEntry[x.entry_id]??=[]).push(x.driver_id);for(const x of sched||[])(scheduleByEntry[x.entry_id]??=[]).push({id:x.id,type:x.item_type,title:x.title||"",date:x.session_date,time:x.start_time||"",duration:x.duration_minutes||0,driverId:x.driver_id||null,sortOrder:x.sort_order||100,notes:x.notes||""});for(const a of ats||[])(attendanceByEvent[a.event_id]??={})[a.driver_id]=a.status;for(const n of ens||[])(entriesByEvent[n.event_id]??=[]).push({id:n.id,name:n.entry_name||"SABIL Entry",number:n.car_number||"",vehicle:n.vehicle||"",status:n.status||"draft",iracingTeamName:n.iracing_team_name||"",iracingTeamId:n.iracing_team_id||"",raceDate:n.race_date||"",raceTime:n.race_time||"",raceDurationMinutes:n.race_duration_minutes||null,createdBy:n.created_by||null,driverIds:driversByEntry[n.id]||[],schedule:scheduleByEntry[n.id]||[]});return (ev||[]).map(e=>({id:e.id,name:e.name,discipline:"simracing",championship:e.championship||"",track:e.track||"",date:e.event_date||"",endDate:e.event_end_date||e.event_date||"",endTime:e.end_time||"",startTime:"",sim:e.simulation||"",classes:cleanEventClasses(e.classes),vehicle:"",notes:e.notes||"",screenshotPath:e.screenshot_url||"",status:e.status||"draft",attendance:attendanceByEvent[e.id]||{},entries:(entriesByEvent[e.id]||[]).map(n=>({...n,vehicle:n.vehicle||e.team_car||""}))}))}
app.get("/api/events",auth,async(req,res)=>{try{let e=await getEvents(req.sb);await Promise.all(e.map(async x=>{x.screenshot=await signed(req.sb,x.screenshotPath)}));res.json(e)}catch(x){err(res,x)}});
app.post("/api/events",auth,coachEvent,async(req,res)=>{const b=req.body;if(!b.date||!b.endDate||b.endDate<b.date)return res.status(400).json({error:"A valid From/To date range is required."});const row={name:b.name,championship:b.championship||null,simulation:b.sim||null,track:b.track||null,classes:cleanEventClasses(b.classes),team_car:null,event_date:b.date||null,event_end_date:b.endDate||b.date||null,end_time:b.endTime||null,start_time:null,notes:b.notes||null,screenshot_url:b.screenshot||null,status:"open",created_by:req.authUser.id};const {data,error}=await req.sb.from("events").insert(row).select().single();if(error)return err(res,error);await logActivity(req,"Event created","event",data.id,data.name);await notifyAll(req,"New event",`${data.name} · ${data.event_date||"TBD"}`,"event","event",data.id);res.json({id:data.id,...b,status:"open"})});
app.get("/api/events/:id",auth,async(req,res)=>{try{const e=(await getEvents(req.sb)).find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:"Event not found"});e.screenshot=await signed(req.sb,e.screenshotPath);res.json(e)}catch(x){err(res,x)}});
app.put("/api/events/:id",auth,coachEvent,async(req,res)=>{const b=req.body;if(!b.date||!b.endDate||b.endDate<b.date)return res.status(400).json({error:"A valid From/To date range is required."});const patch={name:b.name,championship:b.championship||null,simulation:b.sim||null,track:b.track||null,classes:cleanEventClasses(b.classes),team_car:null,event_date:b.date||null,event_end_date:b.endDate||b.date||null,end_time:b.endTime||null,start_time:null,notes:b.notes||null};const {data,error}=await req.sb.from("events").update(patch).eq("id",req.params.id).select().single();if(error)return err(res,error);await logActivity(req,"Event updated","event",data.id,data.name);res.json(data)});
app.post("/api/events/:id/status",auth,coachEvent,async(req,res)=>{const status=String(req.body.status||"");if(!["open","finished","cancelled"].includes(status))return res.status(400).json({error:"Invalid event status."});const {data,error}=await req.sb.from("events").update({status}).eq("id",req.params.id).select().single();if(error)return err(res,error);await logActivity(req,`Event marked ${status}`,"event",data.id,data.name);if(status==="finished")await notifyAll(req,"Event finished",`${data.name} is ready for official results.`,"event","event",data.id);res.json(data)});
app.post("/api/events/:id/attendance",auth,async(req,res)=>{const {data:event}=await req.sb.from("events").select("simulation,status").eq("id",req.params.id).maybeSingle();if(!event||event.status!=="open"||!canUseSim(req.profile,event.simulation))return res.status(403).json({error:"No attendance permission for this event."});const row={event_id:req.params.id,driver_id:req.authUser.id,status:req.body.status};const {error}=await req.sb.from("event_attendance").upsert(row,{onConflict:"event_id,driver_id"});if(error)return err(res,error);res.json({ok:true})});
async function canManageSchedule(req,entryId){const {data}=await req.sb.from("event_entry_drivers").select("driver_id").eq("entry_id",entryId).eq("driver_id",req.authUser.id).maybeSingle();return !!data}
app.post("/api/entries/:entryId/schedule",auth,async(req,res)=>{if(!await canManageSchedule(req,req.params.entryId))return res.status(403).json({error:"Only drivers assigned to this line-up can edit the stint plan."});const b=req.body;if(!b.date||!b.time||!b.type)return res.status(400).json({error:"Type, date and start time are required."});const row={entry_id:req.params.entryId,item_type:b.type,title:String(b.title||"").trim()||null,session_date:b.date,start_time:b.time,duration_minutes:Number(b.duration||0)||null,driver_id:b.driverId||null,sort_order:Number(b.sortOrder||100),notes:String(b.notes||"").trim()||null,created_by:req.authUser.id};const {data,error}=await req.sb.from("entry_schedule_items").insert(row).select().single();if(error)return err(res,error);await logActivity(req,"Stint plan item added","entry",req.params.entryId,`${row.item_type} ${row.session_date} ${row.start_time}`);res.json(data)});
app.put("/api/entries/:entryId/schedule/:id",auth,async(req,res)=>{if(!await canManageSchedule(req,req.params.entryId))return res.status(403).json({error:"Only drivers assigned to this line-up can edit the stint plan."});const b=req.body;const patch={item_type:b.type,title:String(b.title||"").trim()||null,session_date:b.date,start_time:b.time,duration_minutes:Number(b.duration||0)||null,driver_id:b.driverId||null,sort_order:Number(b.sortOrder||100),notes:String(b.notes||"").trim()||null};const {data,error}=await req.sb.from("entry_schedule_items").update(patch).eq("id",req.params.id).eq("entry_id",req.params.entryId).select().single();if(error)return err(res,error);res.json(data)});
app.delete("/api/entries/:entryId/schedule/:id",auth,async(req,res)=>{if(!await canManageSchedule(req,req.params.entryId))return res.status(403).json({error:"Only drivers assigned to this line-up can edit the stint plan."});const {error}=await req.sb.from("entry_schedule_items").delete().eq("id",req.params.id).eq("entry_id",req.params.entryId);if(error)return err(res,error);res.json({ok:true})});

app.post("/api/events/:id/entries",auth,async(req,res)=>{
  const b=req.body,ids=[...new Set(Array.isArray(b.driverIds)?b.driverIds:[])];
  const privileged=roleOk(req.profile,["owner","admin"]);
  if(!privileged&&!ids.includes(req.authUser.id))return res.status(403).json({error:"Drivers may only create a line-up when they are part of it."});
  if(!ids.length)return res.status(400).json({error:"Add at least one driver to the line-up."});
  if(b.number&&!["187","095","113"].includes(String(b.number)))return res.status(400).json({error:"Choose a SABIL team number: 187, 095 or 113."});
  const {data:event}=await req.sb.from("events").select("id,status,name,event_date,event_end_date,simulation").eq("id",req.params.id).single();
  if(!event)return res.status(404).json({error:"Event not found."});
  if(event.status!=="open")return res.status(400).json({error:"Line-ups can only be created while the event is open."});if(!canUseSim(req.profile,event.simulation))return res.status(403).json({error:"Your driver roles do not allow line-ups for this simulation."});
  if(b.raceDate&&event.event_date&&b.raceDate<event.event_date)return res.status(400).json({error:"The line-up race date cannot be before the event starts."});
  if(b.raceDate&&(event.event_end_date||event.event_date)&&b.raceDate>(event.event_end_date||event.event_date))return res.status(400).json({error:"The line-up race date must be inside the event date range."});
  if(!b.raceDate||!b.raceTime)return res.status(400).json({error:"Race date and start time are required for every line-up."});const {data:en,error}=await req.sb.from("event_entries").insert({event_id:req.params.id,entry_name:b.name||"SABIL Entry",car_number:b.number||null,vehicle:b.vehicle||null,status:b.status||"confirmed",iracing_team_name:b.iracingTeamName||null,iracing_team_id:b.iracingTeamId||null,race_date:b.raceDate,race_time:b.raceTime,race_duration_minutes:Number(b.raceDurationMinutes||0)||null,created_by:req.authUser.id}).select().single();
  if(error)return err(res,error);
  const {error:e2}=await req.sb.from("event_entry_drivers").insert(ids.map(driver_id=>({entry_id:en.id,driver_id})));
  if(e2)return err(res,e2);
  await logActivity(req,"Line-up created","entry",en.id,`${event.name} · ${b.name||"SABIL Entry"}`);
  await notifyUsers(req,ids,"Line-up assignment",`You were assigned to ${b.name||"SABIL Entry"}. Open your line-up in the team hub.`,"lineup","entry",en.id);
  res.json({id:en.id,...b,createdBy:req.authUser.id,channel:`entry:${en.id}`});
});

async function canManageEntry(req,entryId){
  if(roleOk(req.profile,["owner","admin"]))return true;
  const {data:en}=await req.sb.from("event_entries").select("created_by").eq("id",entryId).single();
  if(!en||en.created_by!==req.authUser.id)return false;
  const {data:self}=await req.sb.from("event_entry_drivers").select("driver_id").eq("entry_id",entryId).eq("driver_id",req.authUser.id).maybeSingle();
  return !!self;
}
app.put("/api/events/:eventId/entries/:entryId",auth,async(req,res)=>{
  if(!await canManageEntry(req,req.params.entryId))return res.status(403).json({error:"Only management or the driver who created this line-up can edit it."});
  const b=req.body;if(b.number&&!["187","095","113"].includes(String(b.number)))return res.status(400).json({error:"Choose a SABIL team number: 187, 095 or 113."});
  const ids=[...new Set(Array.isArray(b.driverIds)?b.driverIds:[])];
  if(!roleOk(req.profile,["owner","admin"])&&!ids.includes(req.authUser.id))return res.status(403).json({error:"You must remain part of a line-up you created."});
  if(!b.raceDate||!b.raceTime)return res.status(400).json({error:"Race date and start time are required for every line-up."});const {data:parentEvent}=await req.sb.from("events").select("event_date,event_end_date").eq("id",req.params.eventId).single();if(parentEvent?.event_date&&b.raceDate<parentEvent.event_date)return res.status(400).json({error:"The line-up race date cannot be before the event starts."});if((parentEvent?.event_end_date||parentEvent?.event_date)&&b.raceDate>(parentEvent.event_end_date||parentEvent.event_date))return res.status(400).json({error:"The line-up race date must be inside the event date range."});const patch={entry_name:b.name||"SABIL Entry",car_number:b.number||null,vehicle:b.vehicle||null,status:b.status||"confirmed",iracing_team_name:b.iracingTeamName||null,iracing_team_id:b.iracingTeamId||null,race_date:b.raceDate,race_time:b.raceTime,race_duration_minutes:Number(b.raceDurationMinutes||0)||null};
  const {data,error}=await req.sb.from("event_entries").update(patch).eq("id",req.params.entryId).eq("event_id",req.params.eventId).select().single();if(error)return err(res,error);
  await req.sb.from("event_entry_drivers").delete().eq("entry_id",req.params.entryId);
  if(ids.length){const {error:e2}=await req.sb.from("event_entry_drivers").insert(ids.map(driver_id=>({entry_id:req.params.entryId,driver_id})));if(e2)return err(res,e2)}
  await logActivity(req,"Line-up updated","entry",data.id,data.entry_name);await notifyUsers(req,ids,"Line-up updated",`${data.entry_name} was updated.`,"lineup","entry",data.id);res.json(data)
});
app.delete("/api/events/:id",auth,coachEvent,async(req,res)=>{
  try{const {data:entries}=await req.sb.from("event_entries").select("id").eq("event_id",req.params.id);const entryIds=(entries||[]).map(x=>x.id);if(entryIds.length)await req.sb.from("results").delete().in("entry_id",entryIds);await req.sb.from("results").delete().eq("event_id",req.params.id);const {error}=await req.sb.from("events").delete().eq("id",req.params.id);if(error)throw error;res.json({ok:true})}catch(e){err(res,e)}
});
app.delete("/api/events/:eventId/entries/:entryId",auth,async(req,res)=>{
  if(!await canManageEntry(req,req.params.entryId))return res.status(403).json({error:"Not allowed to delete this line-up."});
  try{await req.sb.from("results").delete().eq("entry_id",req.params.entryId);await req.sb.from("messages").delete().eq("channel",`entry:${req.params.entryId}`);const {error}=await req.sb.from("event_entries").delete().eq("id",req.params.entryId).eq("event_id",req.params.eventId);if(error)throw error;await logActivity(req,"Line-up deleted","entry",req.params.entryId,null);res.json({ok:true})}catch(e){err(res,e)}
});
app.put("/api/results/:id",auth,manager,async(req,res)=>{const b=req.body;if(!Number(b.start)||!Number(b.finish)||!Number(b.quali))return res.status(400).json({error:"Start, finish and qualifying position are required."});const {data:old,error:oe}=await req.sb.from("results").select("*").eq("id",req.params.id).single();if(oe||!old)return res.status(404).json({error:"Result not found."});const splitNumber=Number(b.splitNumber||0),splitTotal=Number(b.splitTotal||0);if((splitNumber||splitTotal)&&(!splitNumber||!splitTotal||splitNumber>splitTotal))return res.status(400).json({error:"Enter a valid split, for example Split 2 of 5."});const patch={start_position:Number(b.start||0)||null,finish_position:Number(b.finish||0)||null,qualifying_position:Number(b.quali||0)||null,incidents:Number(b.incidents||0)||null,fastest_lap:b.fastestLap||null,split_number:splitNumber||null,split_total:splitTotal||null,screenshot_url:b.screenshot||old.screenshot_url};const {data,error}=await req.sb.from("results").update(patch).eq("id",req.params.id).select().single();if(error)return err(res,error);await logActivity(req,"Result updated","result",data.id,`P${patch.finish_position||"?"}`);res.json(data)});
app.delete("/api/results/:id",auth,manager,async(req,res)=>{const {error}=await req.sb.from("results").delete().eq("id",req.params.id);if(error)return err(res,error);res.json({ok:true})});

app.get("/api/team",auth,async(req,res)=>{try{const [{data:ps,error},rr,{data:mods}]=await Promise.all([req.sb.from("profiles").select("*"),allResults(req.sb),req.sb.from("moderation_actions").select("target_user,action,created_at,expires_at,revoked_at").order("created_at",{ascending:false})]);if(error)throw error;const resultsByDriver={},modsByTarget={};for(const r of rr)if(r.official)for(const id of r.driverIds||[])(resultsByDriver[id]??=[]).push(r);for(const m of mods||[])(modsByTarget[m.target_user]??=[]).push(m);const out=await Promise.all((ps||[]).map(async p=>{const pr=resultsByDriver[p.id]||[],avatar=await signed(req.sb,p.avatar_url),pm=modsByTarget[p.id]||[];return{...profilePub({...p,avatar_url:avatar}),...stats(pr),rating:rating(pr),warnings:pm.filter(x=>x.action==="warning"&&!x.revoked_at).length,lastModeration:pm.find(x=>!x.revoked_at)||pm[0]||null,lastResults:pr.slice(-5).reverse().map(r=>({finish:r.finish,event:r.event}))}}));out.sort((a,b)=>b.wins-a.wins||b.podiums-a.podiums||a.avgFinish-b.avgFinish||b.races-a.races);res.json(out)}catch(e){err(res,e)}});
app.post('/api/team/:id/approve',auth,ownerOnly,async(req,res)=>{const {data,error}=await req.sb.from('profiles').update({approval_status:'approved',approved_at:new Date().toISOString(),approved_by:req.authUser.id,active:true}).eq('id',req.params.id).select().single();if(error)return err(res,error);res.json({ok:true,user:profilePub(data)})});
app.patch("/api/team/:id",auth,ownerOnly,async(req,res)=>{const primary=String(req.body.primaryRole||req.body.role||"driver"),secondary=String(req.body.secondaryRole||""),driverTags=[...new Set((Array.isArray(req.body.driverTags)?req.body.driverTags:[]).map(String).filter(x=>["lmu_driver","iracing_driver","coach","rookie"].includes(x)))];if(req.params.id===req.authUser.id&&effectiveRole(req.profile)==="owner"&&primary!=="owner"&&secondary!=="owner")return res.status(400).json({error:"The owner cannot remove their own Owner role."});const {error}=await req.sb.rpc("set_user_roles",{target_user:req.params.id,primary_role:primary,second_role:secondary||null});if(error)return err(res,error);const {error:tagError}=await req.sb.from("profiles").update({role_tags:driverTags}).eq("id",req.params.id);if(tagError)return err(res,tagError);const labels=driverTags.map(x=>x==="lmu_driver"?"LMU Driver":"iRacing Driver");await logActivity(req,"Roles changed","profile",req.params.id,[primary,secondary,...labels].filter(Boolean).join(" + "));await notifyUsers(req,[req.params.id],"Roles updated",`Your SABIL GR roles are now ${[primary,secondary,...labels].filter(Boolean).join(" + ")}.`,"role","profile",req.params.id);res.json({ok:true})});
app.post("/api/team/:id/moderate",auth,adminOk,async(req,res)=>{
  const target=req.params.id,action=String(req.body.action||""),reason=String(req.body.reason||"").trim();
  if(target===req.authUser.id)return res.status(400).json({error:"You cannot moderate your own account."});
  const {data:targetProfile}=await req.sb.from("profiles").select("role,secondary_role").eq("id",target).single();
  if(effectiveRole(req.profile)==="admin"&&roleOk(targetProfile,["owner"]))return res.status(403).json({error:"Admins cannot moderate the owner."});
  const allowed=["warning","timeout","kick","restore"];if(!allowed.includes(action))return res.status(400).json({error:"Invalid moderation action."});if(["warning","timeout","kick"].includes(action)&&reason.length<3)return res.status(400).json({error:"Add a clear reason before applying a punishment."});
  let expires=null;
  if(action==="timeout"){const mins=Math.max(5,Math.min(10080,Number(req.body.minutes||60)));expires=new Date(Date.now()+mins*60000).toISOString();const {error}=await req.sb.from("profiles").update({suspended_until:expires}).eq("id",target);if(error)return err(res,error)}
  if(action==="kick"){const {error}=await req.sb.from("profiles").update({active:false,suspended_until:null}).eq("id",target);if(error)return err(res,error)}
  if(action==="restore"){const {error}=await req.sb.from("profiles").update({active:true,suspended_until:null}).eq("id",target);if(error)return err(res,error)}
  const {data,error}=await req.sb.from("moderation_actions").insert({target_user:target,actor_id:req.authUser.id,action,reason:reason||null,expires_at:expires}).select().single();if(error)return err(res,error);
  await logActivity(req,`Member ${action}`,"profile",target,reason||null);await notifyUsers(req,[target],`Team moderation: ${action}`,reason||`A ${action} action was applied to your account.`,"moderation","profile",target);res.json(data)
});
app.get("/api/moderation/:id",auth,adminOk,async(req,res)=>{const {data,error}=await req.sb.from("moderation_actions").select("*").eq("target_user",req.params.id).order("created_at",{ascending:false});if(error)return err(res,error);res.json(data||[])});
app.post("/api/moderation/actions/:actionId/revoke",auth,adminOk,async(req,res)=>{const reason=String(req.body.reason||"").trim();const {data:a,error:ge}=await req.sb.from("moderation_actions").select("*").eq("id",req.params.actionId).single();if(ge||!a)return res.status(404).json({error:"Moderation action not found."});if(a.revoked_at)return res.status(400).json({error:"This punishment has already been revoked."});if(!["warning","timeout","kick"].includes(a.action))return res.status(400).json({error:"This action cannot be revoked."});const now=new Date().toISOString();const {error}=await req.sb.from("moderation_actions").update({revoked_at:now,revoked_by:req.authUser.id,revoked_reason:reason||"Revoked by management"}).eq("id",a.id);if(error)return err(res,error);if(a.action==="timeout")await req.sb.from("profiles").update({suspended_until:null}).eq("id",a.target_user);if(a.action==="kick")await req.sb.from("profiles").update({active:true,suspended_until:null}).eq("id",a.target_user);await logActivity(req,"Punishment revoked","profile",a.target_user,`${a.action}${reason?": "+reason:""}`);await notifyUsers(req,[a.target_user],"Moderation action revoked",`${a.action} was revoked${reason?": "+reason:"."}`,"moderation","profile",a.target_user);res.json({ok:true})});

app.delete("/api/moderation/actions/:actionId",auth,adminOk,async(req,res)=>{const {data:a,error:ge}=await req.sb.from("moderation_actions").select("*").eq("id",req.params.actionId).single();if(ge||!a)return res.status(404).json({error:"Moderation action not found."});if(!a.revoked_at&&a.action==="timeout")await req.sb.from("profiles").update({suspended_until:null}).eq("id",a.target_user);if(!a.revoked_at&&a.action==="kick")await req.sb.from("profiles").update({active:true,suspended_until:null}).eq("id",a.target_user);const {error}=await req.sb.from("moderation_actions").delete().eq("id",a.id);if(error)return err(res,error);await logActivity(req,"Moderation record deleted","profile",a.target_user,a.action||null);res.json({ok:true})});

app.get("/api/rules",auth,async(req,res)=>{const {data,error}=await req.sb.from("team_rules").select("*").eq("active",true).order("sort_order");if(error)return err(res,error);res.json(data||[])});
app.post("/api/rules",auth,ownerOnly,async(req,res)=>{const title=String(req.body.title||"").trim(),body=String(req.body.body||"").trim();if(!title||!body)return res.status(400).json({error:"Title and rule text required."});const {data,error}=await req.sb.from("team_rules").insert({title,body,category:String(req.body.category||"General"),sort_order:Number(req.body.sortOrder||100),created_by:req.authUser.id}).select().single();if(error)return err(res,error);await logActivity(req,"Rule created","rule",data.id,title);res.json(data)});
app.put("/api/rules/:id",auth,ownerOnly,async(req,res)=>{const patch={title:String(req.body.title||"").trim(),body:String(req.body.body||"").trim(),category:String(req.body.category||"General"),sort_order:Number(req.body.sortOrder||100)};if(!patch.title||!patch.body)return res.status(400).json({error:"Title and rule text required."});const {data,error}=await req.sb.from("team_rules").update(patch).eq("id",req.params.id).select().single();if(error)return err(res,error);await logActivity(req,"Rule updated","rule",data.id,data.title);res.json(data)});
app.delete("/api/rules/:id",auth,ownerOnly,async(req,res)=>{const {error}=await req.sb.from("team_rules").update({active:false}).eq("id",req.params.id);if(error)return err(res,error);await logActivity(req,"Rule removed","rule",req.params.id,null);res.json({ok:true})});

app.get("/api/config",auth,async(req,res)=>{const {data,error}=await req.sb.from("team_cars").select("simulation,car_name").eq("active",true);if(error)return err(res,error);const cfg={teamCars:{"iRacing":[],"Le Mans Ultimate":[]}};for(const c of data||[])if(cfg.teamCars[c.simulation])cfg.teamCars[c.simulation].push(c.car_name);res.json(cfg)});
app.put("/api/config/team-cars",auth,async(req,res)=>{if(!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Owner/Admin access required."});const {error:d}=await req.sb.from("team_cars").delete().neq("id","00000000-0000-0000-0000-000000000000");if(d)return err(res,d);const rows=[];for(const sim of ["iRacing","Le Mans Ultimate"])for(const car of req.body[sim]||[])rows.push({simulation:sim,car_name:car,active:true});if(rows.length){const {error}=await req.sb.from("team_cars").insert(rows);if(error)return err(res,error)}res.json({teamCars:{"iRacing":req.body["iRacing"]||[],"Le Mans Ultimate":req.body["Le Mans Ultimate"]||[]}})});

async function uploadObject(req,file,folder="uploads"){const safe=(file.originalname||"file").replace(/[^a-zA-Z0-9._-]/g,"_");const p=`${folder}/${req.authUser.id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const {error}=await req.sb.storage.from(BUCKET).upload(p,file.buffer,{contentType:file.mimetype,upsert:false});if(error)throw error;return p}
app.post("/api/upload",auth,upload.single("file"),async(req,res)=>{if(!req.file)return res.status(400).json({error:"No file uploaded."});try{const p=await uploadObject(req,req.file,req.query.folder||"uploads");res.json({url:p,path:p,previewUrl:await signed(req.sb,p),originalName:req.file.originalname,mime:req.file.mimetype,size:req.file.size})}catch(e){err(res,e)}});
app.post("/api/ocr",auth,upload.single("file"),async(req,res)=>{if(!req.file)return res.status(400).json({error:"No image uploaded."});try{const worker=await createWorker("eng");const o=await worker.recognize(req.file.buffer);await worker.terminate();const text=o.data.text||"";const pos=l=>(text.match(new RegExp(l+"\\s*(?:position|pos|p)?\\s*[:#-]?\\s*(\\d{1,3})","i"))||[])[1]||"";const lap=(text.match(/(?:fastest\s*lap|best\s*lap|best)\s*[:#-]?\s*([0-9]{1,2}:[0-9]{2}\.[0-9]{2,3})/i)||text.match(/\b([0-9]{1,2}:[0-9]{2}\.[0-9]{3})\b/)||[])[1]||"";const tracks=["Spa-Francorchamps","Daytona International Speedway","Watkins Glen International","Road America","Michelin Raceway Road Atlanta","Sebring International Raceway","Circuit des 24 Heures du Mans","Autodromo Nazionale Monza","Imola","Fuji International Speedway","Silverstone Circuit","Suzuka International Racing Course","Nürburgring Nordschleife","Red Bull Ring","Circuit Zandvoort","Circuit de Barcelona-Catalunya","Autódromo José Carlos Pace","Circuit of the Americas","Bahrain International Circuit","Lusail International Circuit","Algarve International Circuit"];const track=tracks.find(t=>text.toLowerCase().includes(t.toLowerCase()))||"";res.json({text,suggestions:{start:pos("start")||pos("grid"),finish:pos("finish")||pos("result"),quali:pos("qualifying")||pos("quali"),fastestLap:lap,track}})}catch(e){err(res,e,500)}});

async function filePub(sb,f,nameMap={}){return{id:f.id,name:f.name,category:f.category,folderPath:f.folder_path||"",description:f.description||"",url:f.storage_url?await signed(sb,f.storage_url):f.external_url||"",storagePath:f.storage_url||"",externalUrl:f.external_url||"",access:f.access_type||"team",uploadedBy:f.uploaded_by,uploaderName:nameMap[f.uploaded_by]||"",createdAt:f.created_at,mime:f.mime_type||"",size:f.file_size||0}}

app.get("/api/channels",auth,async(req,res)=>{const {data,error}=await req.sb.from("custom_channels").select("*").eq("active",true).order("sort_order").order("created_at");if(error)return err(res,error);res.json((data||[]).map(c=>({id:c.id,name:c.name,type:c.channel_type,sortOrder:c.sort_order||100})))});
app.post("/api/channels",auth,adminOk,async(req,res)=>{const type=req.body.type==="voice"?"voice":"text";let name=String(req.body.name||"").trim();if(type==="text")name=name.toLowerCase().replace(/[^a-z0-9-_]+/g,"-").replace(/^-+|-+$/g,"");if(!name)return res.status(400).json({error:"Channel name required."});const {data,error}=await req.sb.from("custom_channels").insert({name,channel_type:type,created_by:req.authUser.id}).select().single();if(error)return err(res,error);await logActivity(req,"Channel created","channel",data.id,`${type}: ${name}`);res.json(data)});
app.delete("/api/channels/:id",auth,adminOk,async(req,res)=>{const {data:c,error:ce}=await req.sb.from("custom_channels").select("*").eq("id",req.params.id).single();if(ce||!c)return res.status(404).json({error:"Channel not found."});const {error}=await req.sb.from("custom_channels").update({active:false}).eq("id",req.params.id);if(error)return err(res,error);await logActivity(req,"Channel removed","channel",c.id,`${c.channel_type}: ${c.name}`);res.json({ok:true})});

app.get("/api/polls",auth,async(req,res)=>{
  const [{data:ps,error},{data:os},{data:vs},{data:profiles}]=await Promise.all([req.sb.from("polls").select("*").order("created_at",{ascending:false}).limit(100),req.sb.from("poll_options").select("*").order("sort_order"),req.sb.from("poll_votes").select("*"),req.sb.from("profiles").select("id,full_name")]);
  if(error)return err(res,error);
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name||"Team member"])),optsByPoll={},voteCount={},mine=new Set();
  for(const o of os||[])(optsByPoll[o.poll_id]??=[]).push(o);for(const v of vs||[]){voteCount[v.option_id]=(voteCount[v.option_id]||0)+1;if(v.user_id===req.authUser.id)mine.add(v.option_id)}
  res.json((ps||[]).map(p=>({id:p.id,channel:p.channel,question:p.question,multiple:p.multiple_choice,anonymous:p.anonymous,closesAt:p.closes_at,createdBy:p.created_by,creatorName:pm[p.created_by]||"Team member",createdAt:p.created_at,options:(optsByPoll[p.id]||[]).map(o=>({id:o.id,text:o.option_text,votes:voteCount[o.id]||0,mine:mine.has(o.id)}))})));
});
app.post("/api/polls",auth,async(req,res)=>{const q=String(req.body.question||"").trim(),options=(req.body.options||[]).map(x=>String(x).trim()).filter(Boolean).slice(0,15);if(!q||options.length<2)return res.status(400).json({error:"Question and at least two options required."});const {data:p,error}=await req.sb.from("polls").insert({channel:String(req.body.channel||"general"),question:q,multiple_choice:!!req.body.multiple,anonymous:!!req.body.anonymous,created_by:req.authUser.id}).select().single();if(error)return err(res,error);const {error:oe}=await req.sb.from("poll_options").insert(options.map((option_text,i)=>({poll_id:p.id,option_text,sort_order:i})));if(oe)return err(res,oe);await logActivity(req,"Poll created","poll",p.id,q);res.json({ok:true,id:p.id})});
app.post("/api/polls/:id/vote",auth,async(req,res)=>{const {data:p,error:pe}=await req.sb.from("polls").select("*").eq("id",req.params.id).single();if(pe||!p)return res.status(404).json({error:"Poll not found."});const optionId=String(req.body.optionId||"");const {data:o}=await req.sb.from("poll_options").select("id").eq("id",optionId).eq("poll_id",p.id).maybeSingle();if(!o)return res.status(400).json({error:"Invalid option."});if(!p.multiple_choice)await req.sb.from("poll_votes").delete().eq("poll_id",p.id).eq("user_id",req.authUser.id);const {data:existing}=await req.sb.from("poll_votes").select("id").eq("poll_id",p.id).eq("option_id",optionId).eq("user_id",req.authUser.id).maybeSingle();if(existing)await req.sb.from("poll_votes").delete().eq("id",existing.id);else{const {error}=await req.sb.from("poll_votes").insert({poll_id:p.id,option_id:optionId,user_id:req.authUser.id});if(error)return err(res,error)}res.json({ok:true})});
app.delete("/api/polls/:id",auth,async(req,res)=>{const {data:p,error:pe}=await req.sb.from("polls").select("*").eq("id",req.params.id).single();if(pe||!p)return res.status(404).json({error:"Poll not found."});if(p.created_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Not allowed."});const {error}=await req.sb.from("polls").delete().eq("id",p.id);if(error)return err(res,error);res.json({ok:true})});

app.get("/api/file-folders",auth,async(req,res)=>{const {data,error}=await req.sb.from('file_folders').select('*').order('path');if(error)return err(res,error);res.json(data||[])});
app.post("/api/file-folders",auth,async(req,res)=>{const category=String(req.body.category||''),folderPath=String(req.body.path||'').trim().replace(/\\/g,'/');if(!['setups','clips','photos','other'].includes(category)||!folderPath||folderPath.includes('..')||folderPath.startsWith('/')||folderPath.endsWith('/')||folderPath.includes('//'))return res.status(400).json({error:'Invalid folder name or path.'});const {data,error}=await req.sb.from('file_folders').insert({category,path:folderPath,created_by:req.authUser.id}).select().single();if(error)return err(res,error);res.json(data)});
app.delete("/api/file-folders/:id",auth,async(req,res)=>{const {data:f}=await req.sb.from('file_folders').select('*').eq('id',req.params.id).maybeSingle();if(!f)return res.status(404).json({error:'Folder not found'});const {data:contents}=await req.sb.from('team_files').select('id').eq('category',f.category).like('folder_path',f.path+'%').limit(1);if(contents?.length)return res.status(409).json({error:'Folder has files. Move or delete them first.'});const {error}=await req.sb.from('file_folders').delete().eq('id',req.params.id);if(error)return err(res,error);res.json({ok:true})});
app.get("/api/files",auth,async(req,res)=>{const [{data,error},{data:ps}]=await Promise.all([req.sb.from("team_files").select("*").order("created_at",{ascending:false}),req.sb.from("profiles").select("id,full_name")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(p=>[p.id,p.full_name||""]));res.json(await Promise.all((data||[]).map(f=>filePub(req.sb,f,pm))))});
app.post("/api/files",auth,upload.single("file"),async(req,res)=>{if(!req.file)return res.status(400).json({error:"No file uploaded."});try{const p=await uploadObject(req,req.file,req.body.category||"files");const relativePath=String(req.body.relativePath||req.file.originalname||"file").replace(/\\/g,"/").replace(/^\/+/,"").slice(0,500);const category=["setups","clips","photos","other"].includes(req.body.category)?req.body.category:"other";const folderPath=String(req.body.folderPath||relativePath.split("/").slice(0,-1).join("/")).replace(/\\/g,"/").replace(/(^\/+|\/+$)/g,"").slice(0,320);const row={name:req.file.originalname,category,folder_path:folderPath,description:req.body.description||null,storage_url:p,access_type:"team",uploaded_by:req.authUser.id};const {data,error}=await req.sb.from("team_files").insert(row).select().single();if(error)throw error;res.json(await filePub(req.sb,data))}catch(e){err(res,e)}});
app.delete("/api/files/:id",auth,async(req,res)=>{
  const id=String(req.params.id||"").trim();
  if(!id)return res.status(400).json({error:"File id required"});
  const {data:f,error:lookupError}=await req.sb.from("team_files").select("*").eq("id",id).maybeSingle();
  if(lookupError)return err(res,lookupError);
  if(!f)return res.json({ok:true,alreadyMissing:true});
  if(f.uploaded_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Only the uploader or Owner/Admin can delete this file."});
  if(f.storage_url){const {error:storageError}=await req.sb.storage.from(BUCKET).remove([f.storage_url]);if(storageError)console.warn("Storage cleanup failed for",id,storageError.message||storageError)}
  const {error}=await req.sb.from("team_files").delete().eq("id",id);if(error)return err(res,error);
  res.json({ok:true})
});

async function canAccessTextChannel(sb,userId,channel){
  channel=String(channel||"general");
  if(!channel.startsWith("entry:")){
    const {data}=await sb.from("custom_channels").select("id").eq("name",channel).eq("channel_type","text").eq("active",true).maybeSingle();
    return !!data;
  }
  const {data:prof}=await sb.from("profiles").select("role,secondary_role").eq("id",userId).single();
  if(roleOk(prof,["owner","admin"]))return true;
  const entryId=channel.slice(6);
  if(!entryId)return false;
  const {data,error}=await sb.from("event_entry_drivers").select("driver_id").eq("entry_id",entryId).eq("driver_id",userId).maybeSingle();
  return !error&&!!data;
}

async function messagePub(sb,m,nameMap={}){let a=null;if(m.attachment_url)a={type:m.attachment_type,url:await signed(sb,m.attachment_url)};return{id:m.id,channel:m.channel,userId:m.sender_id,userName:m.sender_name||nameMap[m.sender_id]||"Unknown member",text:m.message||"",attachment:a,createdAt:m.created_at}}
async function mentionTargets(req,text,channel){const raw=String(text||"");if(!raw.includes("@"))return[];const {data:profiles}=await req.sb.from("profiles").select("id,full_name,nickname,role,secondary_role,role_tags,active");const ps=(profiles||[]).filter(p=>p.active!==false),ids=new Set();const low=raw.toLowerCase();if(low.includes("@drivers"))ps.forEach(p=>ids.add(p.id));if(low.includes("@admins"))ps.filter(p=>roleOk(p,["owner","admin"])).forEach(p=>ids.add(p.id));if(low.includes("@lmu"))ps.filter(p=>(p.role_tags||[]).includes("lmu_driver")).forEach(p=>ids.add(p.id));if(low.includes("@iracing"))ps.filter(p=>(p.role_tags||[]).includes("iracing_driver")).forEach(p=>ids.add(p.id));for(const p of ps){const names=[p.nickname,p.full_name].filter(Boolean).map(x=>String(x).toLowerCase().replace(/\s+/g,""));if(names.some(n=>low.replace(/\s+/g,"").includes("@"+n)))ids.add(p.id)}ids.delete(req.authUser.id);return[...ids]}
async function notifyMentions(req,text,channel){const ids=await mentionTargets(req,text,channel);if(ids.length)await notifyUsers(req,ids,"You were mentioned",`${req.profile?.full_name||"A teammate"} mentioned you in ${channel.startsWith("entry:")?"line-up comms":"#"+channel}.`,"mention","message",null)}


app.post("/api/translate",auth,async(req,res)=>{
  const text=String(req.body?.text||"").trim().slice(0,5000);
  const target=String(req.body?.target||"en").toLowerCase();
  if(!text)return res.status(400).json({error:"Text required."});
  if(!["en","de","it","fr","es"].includes(target))return res.status(400).json({error:"Unsupported target language."});
  const fetchJson=async(url,ms=6500)=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),ms);
    try{
      const r=await fetch(url,{signal:controller.signal,headers:{"User-Agent":"SABIL-GR-Hub/0.9.8","Accept":"application/json"}});
      if(!r.ok)throw new Error("HTTP "+r.status);
      return await r.json();
    }finally{clearTimeout(timer)}
  };
  try{
    const googleUrl="https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl="+encodeURIComponent(target)+"&dt=t&q="+encodeURIComponent(text);
    const data=await fetchJson(googleUrl);
    const translated=Array.isArray(data?.[0])?data[0].map(x=>x?.[0]||"").join("").trim():"";
    if(translated)return res.json({translated,target,provider:"google"});
  }catch(e){console.warn("Google translation fallback",e?.message||e)}
  try{
    const mmUrl="https://api.mymemory.translated.net/get?q="+encodeURIComponent(text)+"&langpair=Autodetect%7C"+encodeURIComponent(target);
    const data=await fetchJson(mmUrl,7500);
    const translated=String(data?.responseData?.translatedText||"").trim();
    if(translated)return res.json({translated,target,provider:"mymemory"});
  }catch(e){console.warn("MyMemory translation fallback",e?.message||e)}
  return res.status(502).json({error:"Translation service unavailable."});
});
app.get("/api/messages",auth,async(req,res)=>{const channel=String(req.query.channel||"general");if(!await canAccessTextChannel(req.sb,req.authUser.id,channel))return res.status(403).json({error:"This line-up chat is private to its assigned drivers."});const [{data,error},{data:ps}]=await Promise.all([req.sb.from("messages").select("*").eq("channel",channel).order("created_at",{ascending:true}).limit(150),req.sb.from("profiles").select("id,full_name")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(p=>[p.id,p.full_name||"Unknown member"]));res.json(await Promise.all((data||[]).map(m=>messagePub(req.sb,m,pm))))});
app.post("/api/messages",auth,async(req,res)=>{const b=req.body,a=b.attachment||null,channel=String(b.channel||"general");if(!await canAccessTextChannel(req.sb,req.authUser.id,channel))return res.status(403).json({error:"This line-up chat is private to its assigned drivers."});if(!String(b.text||"").trim()&&!a)return res.status(400).json({error:"Message or attachment required."});const cleanText=String(b.text||"").trim();const mentionLow=cleanText.toLowerCase();if((mentionLow.includes("@drivers")||mentionLow.includes("@admins"))&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Only Owner/Admin can use global team mentions."});if(cleanText&&violatesTeamSafety(cleanText)){await req.sb.from("moderation_actions").insert({target_user:req.authUser.id,actor_id:req.authUser.id,action:"filter_block",reason:`Blocked unsafe language in ${channel}`}).catch(()=>{});return res.status(422).json({error:"Message blocked by the team safety filter. Racist or hateful language is not allowed."})}const row={channel,sender_id:req.authUser.id,message:cleanText,attachment_type:a?.type||null,attachment_url:a?.path||a?.url||null};const {data,error}=await req.sb.from("messages").insert(row).select().single();if(error)return err(res,error);const pub=await messagePub(req.sb,{...data,sender_name:req.profile?.full_name});await notifyMentions(req,cleanText,channel);io.to("text:"+row.channel).emit("chat:new",pub);res.json(pub)});
app.get("/api/dms/threads",auth,async(req,res)=>{const [{data:ms,error},{data:ps}]=await Promise.all([req.sb.from("direct_messages").select("*").or(`sender_id.eq.${req.authUser.id},recipient_id.eq.${req.authUser.id}`).order("created_at",{ascending:false}).limit(500),req.sb.from("profiles").select("id,full_name,nickname,avatar_url,active")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(p=>[p.id,p]));const seen=new Set(),out=[];for(const m of ms||[]){const other=m.sender_id===req.authUser.id?m.recipient_id:m.sender_id;if(seen.has(other))continue;seen.add(other);const p=pm[other];if(!p)continue;out.push({userId:other,name:p.full_name||"Team member",nickname:p.nickname||"",active:p.active!==false,lastMessage:m.message||"Attachment",createdAt:m.created_at,unread:false})}res.json(out)});
app.get("/api/dms/:userId",auth,async(req,res)=>{if(req.params.userId===req.authUser.id)return res.json([]);const [{data,error},{data:ps}]=await Promise.all([req.sb.from("direct_messages").select("*").or(`and(sender_id.eq.${req.authUser.id},recipient_id.eq.${req.params.userId}),and(sender_id.eq.${req.params.userId},recipient_id.eq.${req.authUser.id})`).order("created_at",{ascending:true}).limit(250),req.sb.from("profiles").select("id,full_name")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(p=>[p.id,p.full_name||"Team member"]));const out=[];for(const m of data||[]){let a=null;if(m.attachment_url)a={type:m.attachment_type,url:await signed(req.sb,m.attachment_url)};out.push({id:m.id,userId:m.sender_id,userName:pm[m.sender_id]||"Team member",text:m.message||"",attachment:a,createdAt:m.created_at})}res.json(out)});
app.post("/api/dms/:userId",auth,async(req,res)=>{const recipient=req.params.userId;if(recipient===req.authUser.id)return res.status(400).json({error:"You cannot DM yourself."});const {data:target}=await req.sb.from("profiles").select("id,active").eq("id",recipient).single();if(!target||target.active===false)return res.status(404).json({error:"Member unavailable."});const b=req.body,a=b.attachment||null,cleanText=String(b.text||"").trim();if(!cleanText&&!a)return res.status(400).json({error:"Message or attachment required."});if(cleanText&&violatesTeamSafety(cleanText))return res.status(422).json({error:"Message blocked by the team safety filter. Racist or hateful language is not allowed."});const row={sender_id:req.authUser.id,recipient_id:recipient,message:cleanText,attachment_type:a?.type||null,attachment_url:a?.path||a?.url||null};const {data,error}=await req.sb.from("direct_messages").insert(row).select().single();if(error)return err(res,error);await notifyUsers(req,[recipient],`New message from ${req.profile?.full_name||"teammate"}`,cleanText.slice(0,160)||"Attachment","dm","profile",req.authUser.id);io.emit("dm:new",{to:recipient,from:req.authUser.id});res.json({id:data.id,userId:data.sender_id,userName:req.profile?.full_name||"You",text:data.message||"",createdAt:data.created_at})});
app.delete("/api/dms/:userId/:id",auth,async(req,res)=>{const {error}=await req.sb.from("direct_messages").delete().eq("id",req.params.id).eq("sender_id",req.authUser.id);if(error)return err(res,error);res.json({ok:true})});
app.get("/api/announcements",auth,async(req,res)=>{const {data,error}=await req.sb.from("announcements").select("*").order("created_at",{ascending:false});if(error)return err(res,error);const ps=(await req.sb.from("profiles").select("id,full_name")).data||[],pm=Object.fromEntries(ps.map(p=>[p.id,p.full_name]));res.json((data||[]).map(a=>({id:a.id,title:a.title,text:a.message,userId:a.created_by,userName:pm[a.created_by]||"SABIL",createdAt:a.created_at,highlighted:!!a.highlighted}))) });
app.post("/api/announcements",auth,coachAnnouncements,async(req,res)=>{const {data,error}=await req.sb.from("announcements").insert({title:req.body.title,message:req.body.text,highlighted:!!req.body.highlighted,created_by:req.authUser.id}).select().single();if(error)return err(res,error);const item={id:data.id,title:data.title,text:data.message,userId:req.authUser.id,userName:req.profile?.full_name||"SABIL",createdAt:data.created_at,highlighted:!!data.highlighted};io.emit("announcement:new",item);res.json(item)});

app.delete("/api/messages/:id",auth,async(req,res)=>{
  const {data:m,error:ge}=await req.sb.from("messages").select("id,sender_id,attachment_url").eq("id",req.params.id).single();
  if(ge||!m)return res.status(404).json({error:"Message not found"});
  if(m.sender_id!==req.authUser.id&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"You can only delete your own messages."});
  const {error}=await req.sb.from("messages").delete().eq("id",req.params.id);if(error)return err(res,error);
  if(m.attachment_url)await req.sb.storage.from(BUCKET).remove([m.attachment_url]).catch(()=>{});
  res.json({ok:true});
});
app.put("/api/announcements/:id",auth,coachAnnouncements,async(req,res)=>{
  if(req.body?.highlightedOnly===true){
    const {data,error}=await req.sb.from("announcements").update({highlighted:!!req.body.highlighted}).eq("id",req.params.id).select().single();
    if(error)return err(res,error);
    io.emit("announcement:new",data);
    return res.json({id:data.id,highlighted:!!data.highlighted});
  }
  const patch={title:String(req.body.title||"").trim(),message:String(req.body.text||"").trim(),highlighted:!!req.body.highlighted};
  if(!patch.title||!patch.message)return res.status(400).json({error:"Title and message required."});
  const {data,error}=await req.sb.from("announcements").update(patch).eq("id",req.params.id).select().single();
  if(error)return err(res,error);
  await logActivity(req,"Announcement updated","announcement",data.id,data.title);
  io.emit("announcement:new",data);
  res.json(data)
});
app.delete("/api/announcements/:id",auth,coachAnnouncements,async(req,res)=>{const {error}=await req.sb.from("announcements").delete().eq("id",req.params.id);if(error)return err(res,error);res.json({ok:true})});
app.put("/api/files/link/:id",auth,async(req,res)=>{const {data:f,error:ge}=await req.sb.from("team_files").select("*").eq("id",req.params.id).single();if(ge||!f)return res.status(404).json({error:"Link not found."});if(f.uploaded_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"]))return res.status(403).json({error:"Not allowed."});const url=String(req.body.url||"").trim(),name=String(req.body.name||"").trim();if(!name||!/^https?:\/\//i.test(url))return res.status(400).json({error:"Title and valid https:// link required."});const {data,error}=await req.sb.from("team_files").update({name,description:req.body.description||null,external_url:url}).eq("id",req.params.id).select().single();if(error)return err(res,error);res.json(await filePub(req.sb,data,{[req.authUser.id]:req.profile?.full_name||""}))});
app.post("/api/files/link",auth,async(req,res)=>{
  const url=String(req.body.url||"").trim();const name=String(req.body.name||"Clip transfer").trim();
  if(!/^https?:\/\//i.test(url))return res.status(400).json({error:"Enter a valid https:// link."});
  const row={name,category:req.body.category||"clips",description:req.body.description||null,external_url:url,access_type:"team",uploaded_by:req.authUser.id};
  const {data,error}=await req.sb.from("team_files").insert(row).select().single();if(error)return err(res,error);res.json(await filePub(req.sb,data,{[req.authUser.id]:req.profile?.full_name||""}));
});

app.get("/api/trainings",auth,async(req,res)=>{const [{data,error},{data:ps},{data:ens},{data:evs}]=await Promise.all([req.sb.from("training_sessions").select("*").order("session_date",{ascending:true}).order("start_time",{ascending:true}),req.sb.from("profiles").select("id,full_name"),req.sb.from("event_entries").select("id,entry_name"),req.sb.from("events").select("id,name")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(x=>[x.id,x.full_name||"Team member"])),enm=Object.fromEntries((ens||[]).map(x=>[x.id,x.entry_name||"Entry"])),evm=Object.fromEntries((evs||[]).map(x=>[x.id,x.name||"Event"]));res.json((data||[]).map(t=>({id:t.id,title:t.title,scope:t.scope,eventId:t.event_id,entryId:t.entry_id,entryName:enm[t.entry_id]||"",eventName:evm[t.event_id]||"",sim:t.simulation,track:t.track||"",date:t.session_date,time:t.start_time||"",duration:t.duration_minutes||0,serverName:t.server_name||"",password:t.session_password||"",notes:t.notes||"",status:t.status,createdBy:t.created_by,createdByName:pm[t.created_by]||"Team member",createdAt:t.created_at})))});
app.post("/api/trainings",auth,async(req,res)=>{const b=req.body;if(!b.title||!b.sim||!b.date)return res.status(400).json({error:"Title, simulation and date are required."});if(b.scope==="entry"&&!b.entryId)return res.status(400).json({error:"Select a line-up for an entry training."});if(!canUseSim(req.profile,b.sim)&&!(hasCoach(req.profile)&&String(b.sim||"").toLowerCase().includes("iracing")))return res.status(403).json({error:"Your role cannot organize training for this simulation."});const row={title:b.title,scope:b.scope==="entry"?"entry":"team",event_id:b.eventId||null,entry_id:b.scope==="entry"?b.entryId:null,simulation:b.sim,track:b.track||null,session_date:b.date,start_time:b.time||null,duration_minutes:Number(b.duration||0)||null,server_name:b.serverName||null,session_password:b.password||null,notes:b.notes||null,status:"scheduled",created_by:req.authUser.id};const {data,error}=await req.sb.from("training_sessions").insert(row).select().single();if(error)return err(res,error);let ids=[];if(row.scope==="entry"){const {data:ds}=await req.sb.from("event_entry_drivers").select("driver_id").eq("entry_id",row.entry_id);ids=(ds||[]).map(x=>x.driver_id)}else{const {data:ps}=await req.sb.from("profiles").select("id");ids=(ps||[]).map(x=>x.id)}await notifyUsers(req,ids,"Training scheduled",`${row.title} · ${row.session_date} ${row.start_time||""}`,"training","training",data.id);await logActivity(req,"Training scheduled","training",data.id,row.title);res.json(data)});
app.put("/api/trainings/:id",auth,async(req,res)=>{const {data:existing,error:te}=await req.sb.from("training_sessions").select("created_by,simulation").eq("id",req.params.id).single();if(te||!existing)return res.status(404).json({error:"Training not found."});if(existing.created_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"])&&!(hasCoach(req.profile)&&String(existing.simulation||'').toLowerCase().includes('iracing')))return res.status(403).json({error:"Only the training creator, Coach or Owner/Admin can edit it."});const b=req.body;const patch={title:b.title,scope:b.scope==="entry"?"entry":"team",event_id:b.eventId||null,entry_id:b.scope==="entry"?b.entryId:null,simulation:b.sim,track:b.track||null,session_date:b.date,start_time:b.time||null,duration_minutes:Number(b.duration||0)||null,server_name:b.serverName||null,session_password:b.password||null,notes:b.notes||null,status:b.status||"scheduled"};const {data,error}=await req.sb.from("training_sessions").update(patch).eq("id",req.params.id).select().single();if(error)return err(res,error);await logActivity(req,"Training updated","training",data.id,data.title);res.json(data)});
app.delete("/api/trainings/:id",auth,async(req,res)=>{const {data:existing,error:te}=await req.sb.from("training_sessions").select("created_by,simulation").eq("id",req.params.id).single();if(te||!existing)return res.status(404).json({error:"Training not found."});if(existing.created_by!==req.authUser.id&&!roleOk(req.profile,["owner","admin"])&&!(hasCoach(req.profile)&&String(existing.simulation||'').toLowerCase().includes('iracing')))return res.status(403).json({error:"Only the training creator, Coach or Owner/Admin can delete it."});const {error}=await req.sb.from("training_sessions").delete().eq("id",req.params.id);if(error)return err(res,error);await logActivity(req,"Training deleted","training",req.params.id,null);res.json({ok:true})});
app.get("/api/activity",auth,async(req,res)=>{const [{data,error},{data:ps}]=await Promise.all([req.sb.from("activity_log").select("*").order("created_at",{ascending:false}).limit(50),req.sb.from("profiles").select("id,full_name")]);if(error)return err(res,error);const pm=Object.fromEntries((ps||[]).map(x=>[x.id,x.full_name||"Team member"]));res.json((data||[]).map(x=>({...x,actorName:pm[x.actor_id]||"System"})))});
app.get("/api/notifications",auth,async(req,res)=>{const {data,error}=await req.sb.from("notifications").select("*").eq("user_id",req.authUser.id).order("created_at",{ascending:false}).limit(50);if(error)return err(res,error);res.json(data||[])});
app.post("/api/notifications/read",auth,async(req,res)=>{const {error}=await req.sb.from("notifications").update({is_read:true}).eq("user_id",req.authUser.id).eq("is_read",false);if(error)return err(res,error);res.json({ok:true})});

// Socket.IO handles the local desktop window. Voice signalling is bridged through Supabase Realtime,
// so members on different PCs can join the same voice room.
io.use(async(socket,next)=>{
  try{
    const token=socket.handshake.auth?.token||"";
    const {data,error}=await base.auth.getUser(token);
    if(error||!data.user)return next(new Error("Not authenticated"));
    const sb=sbFor(token);
    sb.realtime.setAuth(token);
    const {data:p}=await sb.from("profiles").select("full_name,avatar_url,role,secondary_role,active,suspended_until").eq("id",data.user.id).single();
    if(p?.active===false)return next(new Error("Team access revoked"));
    if(p?.suspended_until&&new Date(p.suspended_until)>new Date())return next(new Error("Team access suspended"));
    const voiceAvatar=await signed(sb,p?.avatar_url||"");
    socket.data.token=token;socket.data.userId=data.user.id;socket.data.userName=p?.full_name||"Team member";socket.data.profileImage=voiceAvatar||"";socket.data.role=effectiveRole(p);socket.data.sb=sb;
    next();
  }catch(e){next(e)}
});

const VOICE_ROOMS_SERVER=[];

async function canAccessVoiceRoom(sb,userId,role,room){
  room=String(room||"");
  if(room.startsWith("call:")){
    const ids=room.slice(5).split(":").filter(Boolean);
    return ids.length===2&&ids.includes(String(userId));
  }
  if(VOICE_ROOMS_SERVER.includes(room))return true;
  if(room.startsWith("customvoice:")){const id=room.slice("customvoice:".length);const {data}=await sb.from("custom_channels").select("id").eq("id",id).eq("channel_type","voice").eq("active",true).maybeSingle();return !!data}
  if(!room.startsWith("entryvoice:"))return false;
  const entryId=room.slice("entryvoice:".length);
  if(!entryId)return false;
  if(["owner","admin"].includes(String(role||"").toLowerCase()))return true;
  const {data,error}=await sb.from("event_entry_drivers")
    .select("entry_id")
    .eq("entry_id",entryId)
    .eq("driver_id",userId)
    .maybeSingle();
  return !error&&!!data;
}

function presenceMembers(channel){
  const state=channel.presenceState();
  const members=[];
  for(const [key,arr] of Object.entries(state||{}))for(const p of arr||[]){
    if(p?.userId)members.push({peerId:p.peerId||key,userId:p.userId,userName:p.userName||"Team member",profileImage:p.profileImage||""});
  }
  return members;
}

function voiceMembersForSocket(socket,room,channel){
  const members=presenceMembers(channel);
  const v=socket.data.voice;
  if(v?.room===room&&v.peerId&&!members.some(m=>m.peerId===v.peerId)){
    members.push({
      peerId:v.peerId,
      userId:socket.data.userId,
      userName:socket.data.userName||"Team member",
      profileImage:socket.data.profileImage||""
    });
  }
  return members;
}

async function ensureVoiceWatcher(socket,room){
  room=String(room||"");
  if(!await canAccessVoiceRoom(socket.data.sb,socket.data.userId,socket.data.role,room))return null;
  socket.data.voiceWatchers??=new Map();
  if(socket.data.voiceWatchers.has(room)){const existing=socket.data.voiceWatchers.get(room);try{await existing._sabilReady}catch{}return existing}
  const channel=socket.data.sb.channel(`sabil-voice:${room}`,{config:{private:false,broadcast:{self:false},presence:{key:socket.id+":"+room}}});
  socket.data.voiceWatchers.set(room,channel);
  channel.on("presence",{event:"sync"},()=>{
    const members=voiceMembersForSocket(socket,room,channel);
    socket.emit("voice:room-members",{room,members});
    if(socket.data.voice?.room===room)socket.emit("voice:members",{selfPeerId:socket.data.voice.peerId,members});
  });
  channel.on("broadcast",{event:"signal"},({payload})=>{
    const v=socket.data.voice;
    if(v?.room===room&&payload?.target===v.peerId)socket.emit("voice:signal",{from:payload.from,data:payload.data});
  });
  channel._sabilReady=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Voice realtime connection timed out")),7000);
    channel.subscribe(status=>{
      if(status==="SUBSCRIBED"){clearTimeout(timer);socket.emit("voice:room-members",{room,members:presenceMembers(channel)});resolve(true)}
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){clearTimeout(timer);reject(new Error("Voice realtime connection failed"))}
    });
  });
  try{await channel._sabilReady;return channel}catch(e){socket.data.voiceWatchers.delete(room);try{await socket.data.sb.removeChannel(channel)}catch{}throw e}
}

async function setupVoiceWatchers(socket){
  socket.data.voiceWatchers=new Map();
  for(const room of VOICE_ROOMS_SERVER)await ensureVoiceWatcher(socket,room);
}

async function leaveVoiceSocket(socket){
  const v=socket.data.voice;if(!v)return;
  socket.data.voice=null;
  try{await v.channel.untrack()}catch{}
  try{
    const members=presenceMembers(v.channel).filter(m=>m.peerId!==v.peerId&&m.userId!==socket.data.userId);
    socket.emit("voice:room-members",{room:v.room,members});
    setTimeout(()=>{try{socket.emit("voice:room-members",{room:v.room,members:presenceMembers(v.channel).filter(m=>m.peerId!==v.peerId&&m.userId!==socket.data.userId)})}catch{}},250);
  }catch{}
}


async function setupCallChannel(socket){
  const ch=socket.data.sb.channel(`sabil-calls:${socket.data.userId}`,{config:{private:false,broadcast:{self:false}}});
  socket.data.callChannel=ch;
  ch.on("broadcast",{event:"call"},({payload})=>{
    if(!payload||payload.toUserId!==socket.data.userId)return;
    const map={invite:"call:incoming",accept:"call:accepted",decline:"call:declined",end:"call:ended"};
    const ev=map[payload.action];if(ev)socket.emit(ev,payload);
  });
  ch.subscribe();
}
async function sendCallEvent(socket,targetUserId,payload){
  const target=String(targetUserId||"");if(!target)return false;
  const out=socket.data.sb.channel(`sabil-calls:${target}`,{config:{private:false}});
  return await new Promise(resolve=>{
    let done=false;const finish=async ok=>{if(done)return;done=true;try{await socket.data.sb.removeChannel(out)}catch{}resolve(ok)};
    const timer=setTimeout(()=>finish(false),5000);
    out.subscribe(async status=>{
      if(status!=="SUBSCRIBED")return;
      clearTimeout(timer);
      try{await out.send({type:"broadcast",event:"call",payload:{...payload,toUserId:target}});finish(true)}catch{finish(false)}
    });
  });
}

io.on("connection",socket=>{
  setupCallChannel(socket).catch(e=>console.error("call channel",e));
  socket.on("chat:join",async channel=>{channel=String(channel||"general");if(!await canAccessTextChannel(socket.data.sb,socket.data.userId,channel))return socket.emit("chat:error","This line-up chat is private to its assigned drivers.");for(const r of [...socket.rooms])if(String(r).startsWith("text:"))socket.leave(r);socket.join("text:"+channel)});
  setupVoiceWatchers(socket).catch(e=>console.error("voice watchers",e));

  socket.on("voice:watch-rooms",async({rooms}={})=>{
    const wanted=new Set((Array.isArray(rooms)?rooms:[]).map(String));
    for(const [room,ch] of socket.data.voiceWatchers||[]){if(!wanted.has(room)&&socket.data.voice?.room!==room){socket.data.voiceWatchers.delete(room);try{await socket.data.sb.removeChannel(ch)}catch{}}}
    for(const room of wanted)try{await ensureVoiceWatcher(socket,room)}catch(e){console.warn("voice watcher",room,e?.message||e)}
  });

  socket.on("voice:join",async({room})=>{
    try{
      room=String(room||"");
      if(!await canAccessVoiceRoom(socket.data.sb,socket.data.userId,socket.data.role,room))return socket.emit("voice:error","This voice room is unavailable.");
      await leaveVoiceSocket(socket);
      const peerId=crypto.randomUUID();
      const channel=await ensureVoiceWatcher(socket,room);
      if(!channel)return socket.emit("voice:error","Voice room is not ready yet. Try again in a moment.");
      socket.data.voice={room,peerId,channel};
      await channel.track({peerId,userId:socket.data.userId,userName:socket.data.userName,profileImage:socket.data.profileImage||""});
      const members=voiceMembersForSocket(socket,room,channel);
      socket.emit("voice:joined",{room,peerId});
      socket.emit("voice:room-members",{room,members});
      socket.emit("voice:members",{selfPeerId:peerId,members});
    }catch(e){console.error("voice join",e);socket.emit("voice:error",e?.message||"Voice connection failed")}
  });

  socket.on("voice:signal",async({target,data})=>{
    const v=socket.data.voice;if(!v||!target)return;
    try{await v.channel.send({type:"broadcast",event:"signal",payload:{from:v.peerId,target,data}})}catch(e){console.error("voice signal",e)}
  });
  socket.on("call:invite",async({targetUserId}={})=>{
    try{
      const target=String(targetUserId||"");if(!target||target===socket.data.userId)return;
      const {data:p}=await socket.data.sb.from("profiles").select("id,full_name,active").eq("id",target).maybeSingle();
      if(!p||p.active===false)return socket.emit("call:declined",{reason:"Member unavailable"});
      const room=`call:${socket.data.userId}:${target}`;
      await sendCallEvent(socket,target,{action:"invite",fromUserId:socket.data.userId,fromName:socket.data.userName,room});
      socket.emit("call:outgoing",{targetUserId:target,room});
    }catch(e){socket.emit("call:declined",{reason:e?.message||"Call failed"})}
  });
  socket.on("call:accept",async({targetUserId,room}={})=>{
    if(!await canAccessVoiceRoom(socket.data.sb,socket.data.userId,socket.data.role,room))return;
    await sendCallEvent(socket,targetUserId,{action:"accept",fromUserId:socket.data.userId,fromName:socket.data.userName,room});
  });
  socket.on("call:decline",async({targetUserId,room}={})=>{await sendCallEvent(socket,targetUserId,{action:"decline",fromUserId:socket.data.userId,room});});
  socket.on("call:end",async({targetUserId,room}={})=>{await sendCallEvent(socket,targetUserId,{action:"end",fromUserId:socket.data.userId,room});});

  socket.on("voice:leave",()=>leaveVoiceSocket(socket));
  socket.on("disconnect",async()=>{
    await leaveVoiceSocket(socket);
    for(const ch of socket.data.voiceWatchers?.values?.()||[])try{await socket.data.sb.removeChannel(ch)}catch{}
    if(socket.data.callChannel)try{await socket.data.sb.removeChannel(socket.data.callChannel)}catch{}
  });
});
export const serverReady=new Promise((resolve,reject)=>{
  const onError=e=>{console.error("SABIL GR Hub local server error:",e);reject(e)};
  httpServer.once("error",onError);
  httpServer.listen(PORT,"127.0.0.1",()=>{httpServer.off("error",onError);httpServer.on("error",e=>console.error("SABIL GR Hub local server error:",e));console.log(`SABIL GR Hub v0.9.8 running locally at http://127.0.0.1:${PORT}`);resolve(true)});
});
