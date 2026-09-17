// Web push handlers, imported into the generated service worker (vite.config.ts workbox.importScripts).

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'RALO', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil((async () => {
    // While the app is open, show the message inside the app instead of a system notification
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.find(client => client.visibilityState === 'visible');
    if (visible) {
      visible.postMessage({ type: 'ralo-push', payload: data });
      return;
    }
    await self.registration.showNotification(data.title || 'RALO', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
