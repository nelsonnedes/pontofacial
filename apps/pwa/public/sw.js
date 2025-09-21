// Service Worker para Ponto Facial PWA
// Versão: 1.0.0

const CACHE_NAME = 'ponto-facial-v1';
const OFFLINE_URL = '/app';

// Recursos essenciais para cache
const ESSENTIAL_RESOURCES = [
  '/',
  '/app',
  '/login',
  '/manifest.webmanifest',
  '/favicon.ico'
];

// Recursos estáticos para cache
const STATIC_RESOURCES = [
  '/app/marcar',
  '/app/historico', 
  '/app/fila',
  '/app/comprovantes',
  '/app/cadastro-facial',
  '/admin',
  '/admin/geofences',
  '/admin/users',
  '/admin/reports'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Cache aberto');
        
        // Tentar fazer cache dos recursos essenciais
        return Promise.all([
          // Cache essenciais (obrigatório)
          cache.addAll(ESSENTIAL_RESOURCES).catch(err => {
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
        // Assume controle imediatamente
        return self.clients.claim();
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

  // Ignorar requisições para APIs externas e recursos específicos
  const url = new URL(event.request.url);
  
  // Ignorar APIs do Firebase, Chrome extensions, etc.
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retorna do cache se encontrar
        if (response) {
          console.log('📦 Service Worker: Servindo do cache:', event.request.url);
          return response;
        }

        // Se não encontrar no cache, buscar da rede
        return fetch(event.request)
          .then((response) => {
            // Só fazer cache de respostas válidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar a resposta pois ela só pode ser lida uma vez
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Cache apenas recursos da nossa aplicação
                if (url.origin === location.origin) {
                  cache.put(event.request, responseToCache);
                }
              })
              .catch(err => {
                console.warn('⚠️ Service Worker: Erro ao fazer cache:', err);
              });

            return response;
          })
          .catch(() => {
            console.log('📵 Service Worker: Offline - servindo página offline');
            
            // Se está offline e é uma navegação, servir a página principal
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            
            // Para outros recursos, retornar um erro
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
      .catch(err => {
        console.error('❌ Service Worker: Erro no fetch:', err);
        return new Response('Erro no Service Worker', {
          status: 500,
          statusText: 'Internal Server Error'
        });
      })
  );
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
      console.log('📨 Service Worker: Mensagem recebida:', type, data);
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
    icon: '/favicon.ico',
    badge: '/favicon.ico'
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