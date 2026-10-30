// Service worker for the installable web app. Written so it never pins an old build:
// pages and version.json always come from the network when it's reachable, and only
// the content-hashed assets are served from cache. The cache name below gets the build number,
// which makes every deploy a new worker that clears the previous caches.
const CACHE = "bun-voyage-__BUILD__";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bun-voyage-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The update check must always see the live build.
  if (url.pathname.endsWith("/version.json")) return;

  // Pages: network first so a new deploy shows up at once; cached copy when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  // Hashed build assets never change: cache first. Fonts and icons: cache, refresh in the background.
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit && url.pathname.includes("/assets/") ? hit : hit || net;
      }),
    );
  }
});
