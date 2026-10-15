self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      icon: '/icon-light-32x32.png',
      badge: '/icon-dark-32x32.png',
      data: payload.data,
      actions: payload.actions,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const orderId = event.notification.data && event.notification.data.orderId
  if (!orderId) return

  event.waitUntil(
    (async () => {
      if (event.action === 'dismiss') {
        await fetch(`/api/orders/${encodeURIComponent(orderId)}/reminder/dismiss`, {
          method: 'POST',
          credentials: 'include',
        })
        return
      }

      if (event.action === 'complete') {
        await fetch(`/api/orders/${encodeURIComponent(orderId)}/complete`, {
          method: 'POST',
          credentials: 'include',
        })
        return
      }

      const target = new URL(`/?order=${encodeURIComponent(orderId)}`, self.location.origin)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if ('focus' in client) {
          await client.navigate(target.href)
          await client.focus()
          return
        }
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
