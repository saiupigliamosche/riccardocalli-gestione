const CACHE="parkour-gestione-v32";
const ASSETS=["./","./index.html","./styles.css?v=0.10.0","./app.js?v=0.10.0","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("parkour-gestione-")&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const update=fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r});
  e.respondWith(caches.match(e.request).then(cached=>cached||update).catch(()=>update));
});
