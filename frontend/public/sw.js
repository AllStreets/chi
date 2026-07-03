// frontend/public/sw.js
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data?.json() || {}
  } catch {
    data = { body: event.data?.text() || '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Chicago Explore', {
      body: data.body || '',
      icon: '/favicon.ico',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/tonight'))
})
