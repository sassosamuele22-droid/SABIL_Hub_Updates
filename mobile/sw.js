const CACHE='sabil-gr-mobile-v019';
const SHELL=['./index.html','./styles.css?v=019','./app.js?v=019','./manifest.webmanifest','./icon.svg','./logo.png','./logo-white.png'];
const SHELL_URLS=new Map(SHELL.map(path=>[new URL(path,self.registration.scope).href,path]));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('sabil-gr-mobile-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
function cacheable(response,request){
  if(!response.ok||response.status!==200||response.type==='opaque')return false;
  const path=new URL(request.url).pathname, type=response.headers.get('content-type')||'';
  if(path.endsWith('.js'))return /javascript|ecmascript/i.test(type);
  if(path.endsWith('.css'))return /text\/css/i.test(type);
  if(request.mode==='navigate'||path.endsWith('.html'))return /text\/html/i.test(type);
  return true;
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url), root=new URL(self.registration.scope);
  if(url.origin!==root.origin)return;
  const navigation=request.mode==='navigate'&&(url.pathname===root.pathname||url.pathname===new URL('./index.html',root).pathname);
  if(!navigation&&!SHELL_URLS.has(url.href))return;
  const key=navigation?new URL('./index.html',root).href:url.href;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(cacheable(response,request)){try{await cache.put(key,response.clone())}catch{}}
      if(!response.ok&&response.status>=500)return (await cache.match(key))||response;
      return response;
    }catch{
      const cached=await cache.match(key);
      if(cached)return cached;
      return new Response('Offline: resource unavailable',{status:503,headers:{'content-type':'text/plain'}});
    }
  })());
});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json?.()||{}}catch{data={body:event.data?.text?.()||''}}const title=data.title||'SABIL GR Hub';const options={body:data.body||'You have a new team update.',icon:'./icon.svg',badge:'./icon.svg',tag:data.tag||undefined,renotify:!!data.tag,data:{notificationId:data.notificationId||null,open:data.open||{page:'home',id:null}}};event.waitUntil(self.registration.showNotification(title,options))});
self.addEventListener('notificationclick',event=>{event.notification.close();const data=event.notification.data||{},open=data.open||{page:'home',id:null};const target=new URL('./',self.registration.scope);target.searchParams.set('pushPage',open.page||'home');if(open.id)target.searchParams.set('pushId',open.id);if(data.notificationId)target.searchParams.set('notificationId',data.notificationId);event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if('navigate' in client){await client.navigate(target.href);return client.focus()}}return self.clients.openWindow(target.href)})())});
