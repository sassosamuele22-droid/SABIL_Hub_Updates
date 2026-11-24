const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('JavaScript sources and inline desktop script parse',()=>{
  for(const file of ['app/server.js','app/electron-main.cjs','app/preload.cjs','mobile/app.js','mobile/sw.js']){
    const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
    assert.equal(r.status,0,file+': '+r.stderr);
  }
  const html=read('app/public/index.html');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(match[1]))new vm.Script(match[2]);
});
test('Updater state does not regress when an older IPC response arrives',async()=>{
  const html=read('app/public/index.html');
  const source=html.slice(html.indexOf('function applyUpdaterStatus('),html.indexOf('function installDownloadedUpdate('));
  const els={};
  for(const k of ['updateStatus','downloadUpdateBtn','installUpdateBtn','checkUpdateBtn'])els[k]={disabled:false,hidden:false,textContent:'',removeAttribute(){},classList:{toggle(name,flag){els[k].hidden=flag}}};
  const ctx=vm.createContext({document:{getElementById:k=>els[k]},window:{sabilUpdater:{check:async()=>({state:'checking',revision:1})}},updaterAttentionState:'',renderAnnouncementAttention(){},t:s=>s});
  vm.runInContext(source,ctx);
  ctx.applyUpdaterStatus({state:'available',message:'Update found',revision:2});
  ctx.applyUpdaterStatus({state:'checking',message:'Stale',revision:1});
  assert.equal(els.updateStatus.textContent,'Update found');
  assert.equal(els.downloadUpdateBtn.hidden,false);
  ctx.applyUpdaterStatus({state:'downloaded',message:'Ready',revision:3});
  assert.equal(els.installUpdateBtn.hidden,false);
  assert.equal(els.checkUpdateBtn.disabled,true);
});
test('Service worker does not cache errors or return HTML for missing JS',async()=>{
  const handlers={},stored=new Map();
  const cache={match:async k=>stored.get(k),put:async(k,v)=>stored.set(k,v)};
  let response, offline=false;
  const ctx=vm.createContext({self:{registration:{scope:'https://hub.test/'},addEventListener:(n,f)=>handlers[n]=f},URL,Request,Response,caches:{open:async()=>cache},fetch:async()=>{if(offline)throw Error('offline');return response}});
  vm.runInContext(read('mobile/sw.js'),ctx);
  const version=read('mobile/sw.js').match(/sabil-gr-mobile-v(\d+)/)[1];
  const req={method:'GET',url:'https://hub.test/app.js?v='+version,mode:'cors'};
  async function request(){let promise;handlers.fetch({request:req,respondWith:p=>promise=p});return promise}
  response=new Response('not found',{status:404,headers:{'content-type':'text/html'}});
  assert.equal((await request()).status,404);assert.equal(stored.size,0);
  response=new Response('<html>wrong</html>',{headers:{'content-type':'text/html'}});
  await request();assert.equal(stored.size,0);
  offline=true;assert.equal((await request()).status,503);
  offline=false;response=new Response('const ok=true',{headers:{'content-type':'text/javascript'}});
  await request();assert.equal(stored.size,1);
  offline=true;assert.equal(await (await request()).text(),'const ok=true');
});
test('Versions, PWA shell and release configuration agree',()=>{
  assert.equal(JSON.parse(read('app/package.json')).version,read('app/CURRENT_VERSION.txt').trim());
  assert.ok(read('app/public/index.html').includes('v'+JSON.parse(read('app/package.json')).version));
  const worker=read('mobile/sw.js'),html=read('mobile/index.html');
  const version=worker.match(/sabil-gr-mobile-v(\d+)/)[1];assert.ok(html.includes('app.js?v='+version));assert.ok(html.includes('styles.css?v='+version));
  assert.match(read('.github/workflows/build-windows.yml'),/npm ci/);
  assert.match(read('.github/workflows/build-windows.yml'),/node --test tests\/stability\.test\.cjs/);
});

test('Push enabled status is only set after successful database registration',async()=>{
  const src=read('mobile/app.js');
  const body=src.slice(src.indexOf('async function refreshPushState()'),src.indexOf('async function enablePushNotifications()'));
  const state={session:{user:{id:'test-user'}}},sub={endpoint:'test-device'};
  let succeed=false;
  const ctx=vm.createContext({state,pushSupported:()=>true,Notification:{permission:'granted'},getCurrentPushSubscription:async()=>sub,savePushSubscription:async()=>{if(!succeed)throw Error('DB rejected')},renderPushPrompt(){},console:{warn(){}}});
  vm.runInContext(body,ctx);
  assert.equal(await ctx.refreshPushState(),null);
  succeed=true;
  assert.equal(await ctx.refreshPushState(),sub);
});
test('Dependency lockfile matches app package version',()=>{
  const pkg=JSON.parse(read('app/package.json'));
  const lock=JSON.parse(read('app/package-lock.json'));
  assert.equal(lock.packages[''].version,pkg.version);
  assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
});
