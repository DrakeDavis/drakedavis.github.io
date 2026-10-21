const PACKAGE_ID="9eb01817b38583b53499";
const VERIFIED_FILES=[{"path":"silent-shadows.js","bytes":11741269,"sha256":"e2bc6fd4c465ab857316d73d703289cd5218a267254de6029e2c60e49d09a3c1"},{"path":"silent-shadows.css","bytes":9231,"sha256":"f36d659a47f40fc7978d6d2d1741f2e622e4d96c95dbd3f804ddf08a54ddcfcf"}];
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
