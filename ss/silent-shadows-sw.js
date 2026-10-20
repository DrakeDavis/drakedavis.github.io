const PACKAGE_ID="abea755e59561c34243a";
const VERIFIED_FILES=[{"path":"silent-shadows.js","bytes":11736827,"sha256":"097ac0a4bc7b8db2cbed750937d330a50cb9f53bdad68f88e18c87c530140992"},{"path":"silent-shadows.css","bytes":7832,"sha256":"570832fe6fb6a9c4a73aec1ef7991df779b28f2a6c3b7ae512000ab6b018d872"}];
// Build template. The builder supplies PACKAGE_ID and VERIFIED_FILES.
const prefix = 'silent-shadows-package-'+encodeURIComponent(self.registration.scope)+'-';
const marker = new URL('__package-ready.json', self.registration.scope).href;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_GAME' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    let name;
    try {
      const page = new URL(event.data.page), scope = new URL(self.registration.scope);
      if (page.origin !== scope.origin || !page.pathname.startsWith(scope.pathname) || !event.source || new URL(event.source.url).href !== page.href) throw new Error('The offline page must be inside the game folder.');
      page.hash = '';
      name = prefix+PACKAGE_ID+'-'+Date.now();
      const cache = await caches.open(name);
      const files = [{url:page.href}, ...VERIFIED_FILES.map(file=>({...file,url:new URL(file.path,scope).href})), {url:self.location.href}];
      for (let i=0;i<files.length;i++) {
        const file = files[i], response = await fetch(file.url, {cache:'reload'});
        if (!response.ok) throw new Error(`Could not download ${new URL(file.url).pathname} (HTTP ${response.status}).`);
        if (file.sha256) {
          const bytes = await response.clone().arrayBuffer();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
          if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error('The game files changed during download. Reload the page and try again.');
        }
        await cache.put(file.url,response); port.postMessage({done:i+1,total:files.length});
      }
      await cache.put(marker,new Response(JSON.stringify({id:PACKAGE_ID,completedAt:Date.now()}),{headers:{'content-type':'application/json'}}));
      for (const previous of await caches.keys()) if (previous.startsWith(prefix) && previous !== name) await caches.delete(previous);
      port.postMessage({ready:true});
    } catch (error) {
      if (name) await caches.delete(name);
      port.postMessage({error:error.message});
    } finally { port.close(); }
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    let online;
    try { online = await fetch(event.request); if (online.ok) return online; } catch {}
    for (const name of (await caches.keys()).filter(n=>n.startsWith(prefix)).reverse()) {
      const cache = await caches.open(name); if (!await cache.match(marker)) continue;
      const response = await cache.match(event.request,{ignoreSearch:true}); if (response) return response;
    }
    return online ?? Response.error();
  })());
});
