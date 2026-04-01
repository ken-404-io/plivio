// Plivio Service Worker — handles push notifications

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = { title: 'Plivio', body: 'You have a new notification.', url: '/' };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a Plivio tab is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
