/*
 * BookWise service worker: shows booking notifications sent by Web Push and
 * opens the booking when one is clicked. It caches nothing.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "BookWise", body: "", url: "/appointments" };

  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // A push without a JSON body still shows something.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/appointments";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === url && "focus" in client) return client.focus();
      }

      return self.clients.openWindow(url);
    }),
  );
});
