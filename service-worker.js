// Service worker mínimo — necessário para o navegador considerar
// o site "instalável" como PWA (Adicionar à Tela de Início).
// Pode ser expandido depois para notificações push reais.

const CACHE_NAME = 'go-laundry-smart-v1';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
