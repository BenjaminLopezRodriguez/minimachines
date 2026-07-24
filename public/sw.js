// @ts-nocheck
// minimachines pager service worker — Web Push. (Runs in the SW global scope,
// not the app's TS libs — type-checking it here is noise.)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (_) {
    data = { body: event.data && event.data.text() };
  }
  const title = data.title || "minimachines";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((wins) => {
      for (const w of wins) if (w.url === url && "focus" in w) return w.focus();
      return self.clients.openWindow(url);
    }),
  );
});
