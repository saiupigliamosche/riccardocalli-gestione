const CACHE="parkour-iscritti-v3";
const ASSETS=["./","./index.html","./styles.css","./push.css","./app.js","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("parkour-iscritti-")&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)))})
self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{}}catch(_){payload={body:event.data?event.data.text():""}}
  const data=payload.data||payload,notification=payload.notification||{};
  const title=data.title||notification.title||"Corso Parkour Padova";
  const options={body:data.body||notification.body||"Hai un nuovo aggiornamento.",tag:data.tag||"parkour-update",data:{url:data.url||self.registration.scope},renotify:true};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  let target=self.registration.scope;
  try{const candidate=new URL(event.notification.data?.url||target);if(candidate.origin===self.location.origin&&candidate.pathname.startsWith(new URL(self.registration.scope).pathname))target=candidate.href}catch(_){}
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){if("navigate" in client){client.navigate(target);return client.focus()}}
    return clients.openWindow(target);
  }));
});
