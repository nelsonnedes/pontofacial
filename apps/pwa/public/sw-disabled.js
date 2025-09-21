// Service Worker DESABILITADO para debugging
// Este é um service worker vazio que não faz nada

console.log('🚫 Service Worker DESABILITADO - arquivo vazio para debugging');

// Não adicionar listeners ou funcionalidades
// Para reativar, substitua sw.js pelo conteúdo original

// Simplesmente instalar e ativar imediatamente sem fazer nada
self.addEventListener('install', (event) => {
  console.log('🚫 SW Install - DESABILITADO');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🚫 SW Activate - DESABILITADO');
  // Limpar todos os caches se existirem
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('🗑️ Removendo cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('🚫 SW Ativado (sem funcionalidades)');
      return self.clients.claim();
    })
  );
});

// Não interceptar fetch - deixar requests passarem normalmente
self.addEventListener('fetch', (event) => {
  // Simplesmente passar o request através da rede
  // Não fazer cache nem interceptação
  return;
});

// Não processar mensagens
self.addEventListener('message', (event) => {
  console.log('🚫 SW Message ignorada (desabilitado):', event.data);
  // Não processar mensagens
});
