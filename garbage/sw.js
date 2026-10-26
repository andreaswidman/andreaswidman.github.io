self.addEventListener('push', event => {
  const { title, body, url } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/garbage/icon-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/garbage/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(w => new URL(w.url).pathname.startsWith('/garbage'));
    return open ? open.focus() : clients.openWindow(url);
  }));
});
