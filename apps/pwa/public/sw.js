// Service Worker para Ponto Facial PWA — P4-3 manual (output:export não suporta next-pwa)
// Versao: 1.0.5 — CACHE v12 — TODO P4 futuro: migrar para Workbox quando SSR (remover output:export)

const CACHE_NAME = 'ponto-facial-v12';
const PWA_ASSET_VERSION = '20260524-icon-v2';
const OFFLINE_URL = '/app';

// Recursos essenciais seguros para cache persistente.
// HTML de paginas deve ser network-first para evitar chunks antigos apos deploy.
const ESSENTIAL_RESOURCES = [
  `/manifest.webmanifest?v=${PWA_ASSET_VERSION}`,
  `/favicon.ico?v=${PWA_ASSET_VERSION}`,
  `/icons/apple-touch-icon.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-32x32.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-48x48.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-72x72.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-96x96.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-128x128.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-144x144.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-152x152.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-192x192.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-384x384.png?v=${PWA_ASSET_VERSION}`,
  `/icons/icon-512x512.png?v=${PWA_ASSET_VERSION}`
];

// Fallback offline. Ele pode ficar em cache, mas nunca deve vencer a rede.
const STATIC_RESOURCES = [
  OFFLINE_URL
];

const NEXT_STATIC_PREFIX = '/_next/static/';
const CACHEABLE_STATIC_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.ico',
  '.webmanifest'
];

function isHtmlRequest(request) {
  return request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
}

function isNextStaticAsset(url) {
  return url.origin === location.origin && url.pathname.startsWith(NEXT_STATIC_PREFIX);
}

function hasFileExtension(pathname) {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}

function shouldLetBrowserHandleCanonicalRedirect(request, url) {
  return url.origin === location.origin &&
    isHtmlRequest(request) &&
    url.pathname !== '/' &&
    !url.pathname.endsWith('/') &&
    !hasFileExtension(url.pathname);
}

function shouldBypassServiceWorker(url) {
  return (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.pathname.startsWith('/api/') ||
    isNextStaticAsset(url) ||
    url.pathname.includes('/v1alpha/') ||
    url.pathname.includes('/executor.') ||
    url.pathname.includes('/js/api.') ||
    url.pathname.includes('/npm/') ||
    url.pathname.includes('/_/scs/') ||
    url.pathname.includes('/google.firestore.') ||
    url.pathname.includes('/_/firebase/') ||
    url.pathname.includes('/recaptcha/') ||
    url.pathname.includes('/analytics/') ||
    url.pathname.includes('/gtag/') ||
    url.searchParams.has('_rsc') ||
    url.pathname.endsWith('index.txt') ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:' ||
    url.protocol === 'data:' ||
    url.protocol === 'blob:'
  );
}

function isCacheableStatic(url) {
  return url.origin === location.origin &&
    CACHEABLE_STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, {
      cache: 'no-store',
      redirect: 'follow'
    });

    if (
      response &&
      response.status === 200 &&
      response.type === 'basic' &&
      !response.redirected
    ) {
      cache.put(request, response.clone()).catch(err => {
        console.warn('⚠️ Service Worker: Erro ao atualizar cache:', err);
      });
    }

    return response;
  } catch (error) {
    console.log('📵 Service Worker: Navegacao offline, tentando cache:', request.url);
    return (await cache.match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable'
      });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    console.log('📦 Service Worker: Servindo estatico do cache:', request.url);
    return cached;
  }

  const response = await fetch(request, { redirect: 'follow' });

  if (
    response &&
    response.status === 200 &&
    response.type === 'basic' &&
    !response.redirected
  ) {
    cache.put(request, response.clone()).catch(err => {
      console.warn('⚠️ Service Worker: Erro ao cachear estatico:', err);
    });
  }

  return response;
}

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Cache aberto');
        
        // Cache inteligente: ícones primeiro, depois outros recursos.
        const iconResources = ESSENTIAL_RESOURCES.filter(url => url.includes('/icons/'));
        const otherResources = ESSENTIAL_RESOURCES.filter(url => !url.includes('/icons/'));
        
        return Promise.all([
          // Cache ícones primeiro (crítico)
          cache.addAll(iconResources).catch(err => {
            console.warn('⚠️ Alguns ícones falharam no cache:', err);
            // Tentar cache individual dos ícones
            return Promise.all(iconResources.map(iconUrl => 
              cache.add(iconUrl).catch(iconErr => {
                console.warn(`⚠️ Falha ao cachear ícone ${iconUrl}:`, iconErr);
              })
            ));
          }),
          // Cache outros recursos essenciais
          cache.addAll(otherResources).catch(err => {
            console.warn('⚠️ Alguns recursos essenciais falharam no cache:', err);
          }),
          // Cache estáticos (opcional)
          cache.addAll(STATIC_RESOURCES).catch(err => {
            console.warn('⚠️ Alguns recursos estáticos falharam no cache:', err);
          })
        ]);
      })
      .then(() => {
        console.log('✅ Service Worker: Cache inicial criado');
        // Força a ativação imediata
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ Service Worker: Erro na instalação:', err);
      })
  );
});

// Ativar Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('🗑️ Service Worker: Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Ativado e assumindo controle');
        return self.clients.claim();
      })
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            cacheName: CACHE_NAME,
            timestamp: Date.now()
          });
        });
      })
      .catch(err => {
        console.error('❌ Service Worker: Erro na ativação:', err);
      })
  );
});

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  // Só interceptar requisições GET
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Firebase Hosting redireciona paginas exportadas para a versao com barra final.
  // Deixar o navegador seguir esse redirect evita respostas redirecionadas dentro do FetchEvent.
  if (shouldLetBrowserHandleCanonicalRedirect(event.request, url)) {
    return;
  }

  if (shouldBypassServiceWorker(url)) {
    return;
  }

  if (isHtmlRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(cacheFirst(event.request));
  }
});

// Escutar mensagens do cliente
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      console.log('⏩ Service Worker: Comando skip waiting recebido');
      self.skipWaiting();
      break;
      
    case 'TRIGGER_SYNC':
      console.log('🔄 Service Worker: Comando trigger sync recebido');
      // Notificar todos os clientes sobre a sincronização
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_REQUESTED',
            timestamp: Date.now()
          });
        });
      });
      break;
      
    case 'CONNECTION_RESTORED':
      console.log('📶 Service Worker: Conexão restaurada');
      // Notificar clientes sobre conexão restaurada
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'CONNECTION_RESTORED',
            timestamp: Date.now()
          });
        });
      });
      break;
      
    case 'CACHE_STATUS':
      // Responder com status do cache
      caches.keys().then(cacheNames => {
        event.ports[0].postMessage({
          type: 'CACHE_STATUS_RESPONSE',
          cacheNames,
          mainCache: CACHE_NAME
        });
      });
      break;
      
    default:
      // ✅ CORREÇÃO: Verificar se data existe antes de logar
      if (data && Object.keys(data).length > 0) {
        console.log('📨 Service Worker: Mensagem recebida:', type, data);
      } else if (type) {
        console.log('📨 Service Worker: Mensagem recebida:', type, 'sem dados');
      } else {
        // Ignorar mensagens completamente inválidas para reduzir ruído
        return;
      }
      break;
  }
});

// Background Sync (se suportado)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Service Worker: Background sync ativado');
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'BACKGROUND_SYNC',
            timestamp: Date.now()
          });
        });
      })
    );
  }
});

// Push notifications (preparado para o futuro)
self.addEventListener('push', (event) => {
  console.log('🔔 Service Worker: Push recebido');
  
  const options = {
    body: event.data ? event.data.text() : 'Notificação do Ponto Facial',
    icon: `/icons/icon-192x192.png?v=${PWA_ASSET_VERSION}`,
    badge: `/icons/icon-72x72.png?v=${PWA_ASSET_VERSION}`
  };

  event.waitUntil(
    self.registration.showNotification('Ponto Facial PWA', options)
  );
});

// Error handling
self.addEventListener('error', (event) => {
  console.error('❌ Service Worker: Erro:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Service Worker: Promise rejeitada:', event.reason);
});

console.log('✅ Service Worker: Carregado com sucesso');
