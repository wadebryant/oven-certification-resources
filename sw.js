const CACHE='oven-resources-v4';
const SHELL=['/','/index.html','/styles.css','/install.js','/downloads.js','/form.html','/form.js','/viewer.html','/viewer.css','/viewer.js','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  ]));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin && url.pathname.startsWith('/downloads/')) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
