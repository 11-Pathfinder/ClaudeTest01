const CACHE_NAME = "pomodoro-v3";

// ── Scheduled notification timer ──
let notificationTimer = null;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon.svg",
  "./manifest.json",
];

// Install — cache all assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Message — schedule or cancel background notifications
self.addEventListener("message", (event) => {
  const { type, delay, mode } = event.data;

  if (type === "SCHEDULE_NOTIFICATION") {
    // Clear any existing scheduled notification
    if (notificationTimer) clearTimeout(notificationTimer);

    notificationTimer = setTimeout(() => {
      const title = mode === "focus" ? "Focus session complete!" : "Break is over!";
      const body = mode === "focus" ? "Time to take a break." : "Ready to focus again?";
      self.registration.showNotification(title, {
        body,
        icon: "icon-192.png",
        tag: "pomodoro-complete",
      });
      notificationTimer = null;
    }, delay);
  }

  if (type === "CANCEL_NOTIFICATION") {
    if (notificationTimer) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
  }
});

// Notification click — focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus an existing window if available
      for (const client of clients) {
        if (client.url.includes("/") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow("/");
    })
  );
});

// Fetch — serve from cache, fall back to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache new successful requests
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
