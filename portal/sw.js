// Lets the shop portal open without internet. Data always comes live from the server;
// only the app's own files are cached, and they refresh every time you're online.
const V = "dab-portal-v19";
const SHELL = ["./", "./index.html", "./app.js", "./kansas.js", "./manifest.webmanifest", "./icons/icon-192.png", "./fonts/fonts.css", "./fonts/bebas-neue.woff2", "./fonts/work-sans.woff2", "./fonts/plex-mono-400.woff2", "./fonts/plex-mono-500.woff2", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  const shell = u.origin === location.origin || u.hostname === "cdn.jsdelivr.net";
  if (!shell) return; // never cache shop data or photos
  e.respondWith(
    fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
