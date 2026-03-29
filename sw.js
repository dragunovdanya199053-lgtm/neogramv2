// ════════════════════════════════════════════════════
// sw.js — NeoGram Service Worker + FCM Background
// ════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const CACHE_NAME = 'neogram-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ────────────────────────────────────────
// 🔥 СВЕЖИЙ FIREBASE CONFIG ИЗ КОНСОЛИ (2026)
// ────────────────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyD5Gs94nyTALXWpIjq6_lHq1lyOV5thD2I",
  authDomain: "neogram-a4e8a.firebaseapp.com",
  projectId: "neogram-a4e8a",
  storageBucket: "neogram-a4e8a.firebasestorage.app",
  messagingSenderId: "342000116900",
  appId: "1:342000116900:web:b9ab34b452079b08f4b231"
});
// ────────────────────────────────────────
const messaging = firebase.messaging();

// ── FCM Background Message Handler ──
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message received:', payload);

  const notifTitle = payload.notification?.title || payload.data?.title || 'NeoGram';
  const notifBody  = payload.notification?.body  || payload.data?.body  || 'Новое сообщение';
  const notifIcon  = payload.notification?.icon  || '/icons/icon-192.png';
  const chatId     = payload.data?.chatId || '';
  const senderName = payload.data?.senderName || '';

  const options = {
    body: notifBody,
    icon: notifIcon,
    badge: '/icons/icon-72.png',
    image: payload.notification?.image || null,
    tag: 'neogram-msg-' + chatId,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { chatId, url: '/?chat=' + chatId },
    actions: [
      { action: 'reply', title: 'Ответить' },
      { action: 'dismiss', title: 'Закрыть' }
    ]
  };

  return self.registration.showNotification(notifTitle, options);
});

// ── Notification Click Handler ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'OPEN_CHAT', chatId: event.notification.data?.chatId });
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Install: cache static assets ──
self.addEventListener('install', event => {
  console.log('[SW] Installing NeoGram SW...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Cache addAll partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating NeoGram SW...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first with cache fallback ──
self.addEventListener('fetch', event => {
  // Skip non-GET, Firebase, external CDN requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore') ||
    event.request.url.includes('googleapis') ||
    event.request.url.includes('gstatic') ||
    event.request.url.includes('firebaseapp') ||
    event.request.url.includes('firebase.io') ||
    event.request.url.includes('cdnjs.cloudflare') ||
    event.request.url.includes('cdn.tailwindcss') ||
    event.request.url.includes('fonts.googleapis') ||
    event.request.url.includes('fonts.gstatic')
  ) {
    return;
  }

  event.respondWith(
    // Network first strategy
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Return index.html for navigation requests (SPA)
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ── Push event fallback (non-FCM) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'NeoGram';
    const options = {
      body: data.body || 'Новое сообщение',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'neogram-push',
      data: data
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

// ── Message from client ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
