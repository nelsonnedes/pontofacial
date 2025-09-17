// Service Worker otimizado com timeouts e melhor tratamento de message channels
const CACHE_NAME = 'ponto-facial-v3';
const STATIC_CACHE = 'ponto-facial-static-v3';
const TIMEOUT_DURATION = 8000; // 8 segundos timeout
const MESSAGE_TIMEOUT = 5000; // 5 segundos para message channels

// Mapa para rastrear message channels ativos
const activeChannels = new Map();

// Função utilitária para timeout em promises
function withTimeout(promise, timeoutMs = TIMEOUT_DURATION) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    )
  ]);
}

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('📥 Service Worker instalando...');
  
  event.waitUntil(
    withTimeout(
      caches.open(CACHE_NAME)
        .then((cache) => {
          console.log('Service Worker: Caching Files');
          return cache.addAll(['/']);
        })
        .catch((error) => {
          console.error('Service Worker: Cache failed', error);
        })
    ).catch((error) => {
      console.error('Service Worker: Install timeout', error);
    })
  );
  
  // Força a ativação imediata do novo Service Worker
  self.skipWaiting();
});

// Limpar caches antigos e ativar
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker ativando...');
  
  event.waitUntil(
    withTimeout(
      Promise.all([
        // Limpar caches antigos
        caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
                console.log('🗑️ Removendo cache antigo:', cacheName);
                return caches.delete(cacheName);
              }
            })
          );
        }),
        // Assumir controle imediato de todas as abas
        self.clients.claim()
      ])
    ).then(() => {
      console.log('✅ Service Worker ativado com sucesso');
    }).catch((error) => {
      console.error('Service Worker: Activation timeout', error);
    })
  );
});

// Interceptar requisições com timeout
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Não processar requisições problemáticas
  if (request.url.startsWith('chrome-extension://') || 
      request.url.startsWith('data:') || 
      request.url.startsWith('blob:') ||
      request.url.startsWith('chrome:') ||
      request.url.startsWith('moz-extension://') ||
      request.url.startsWith('edge://') ||
      request.url.includes('chrome-extension')) {
    return;
  }
  
  // Apenas cachear requisições GET HTTP/HTTPS
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    withTimeout(
      caches.match(request).then((response) => {
        // Retornar do cache se disponível
        if (response) {
          return response;
        }

        // Buscar da rede com timeout
        return withTimeout(fetch(request), 6000).then((response) => {
          // Não cachear se não for uma resposta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clonar a resposta para o cache
          const responseToCache = response.clone();
          
          // Cachear de forma segura com timeout
          withTimeout(
            caches.open(CACHE_NAME).then((cache) => {
              return cache.put(request, responseToCache);
            }),
            3000
          ).catch((error) => {
            console.warn('⚠️ Falha ao cachear resposta:', error);
          });

          return response;
        }).catch((error) => {
          console.warn('⚠️ Falha na requisição:', error);
          // Fallback para páginas offline
          if (request.destination === 'document') {
            return caches.match('/offline.html') || new Response('Offline');
          }
          throw error;
        });
      })
    ).catch((error) => {
      console.warn('⚠️ Fetch timeout ou erro:', error);
      // Fallback básico
      if (request.destination === 'document') {
        return new Response('Service temporarily unavailable', { status: 503 });
      }
      throw error;
    })
  );
});

// Mensagens do cliente com timeout e melhor tratamento
self.addEventListener('message', (event) => {
  const { data, ports } = event;
  
  // Verificação robusta de mensagens para evitar erros "undefined"
  if (!data) {
    // Ignorar silenciosamente mensagens vazias
    return;
  }
  
  if (typeof data !== 'object') {
    console.warn('⚠️ Mensagem inválida recebida (não é um objeto):', data);
    return;
  }

  // Extrair type e id com verificação de existência
  const type = data.type;
  const id = data.id;
  
  // Validar tipo explicitamente - ignorar silenciosamente mensagens sem tipo
  if (typeof type !== 'string' || type === '') {
    // Mensagens do sistema podem não ter tipo, não logar erro
    return;
  }
  
  console.log('📨 Mensagem recebida:', { type, id });

  // Criar timeout para message channels
  const messageTimeout = setTimeout(() => {
    if (id && activeChannels.has(id)) {
      console.warn('⚠️ Message channel timeout:', id);
      activeChannels.delete(id);
    }
  }, MESSAGE_TIMEOUT);

  try {
    switch (type) {
      case 'SKIP_WAITING':
        clearTimeout(messageTimeout);
        self.skipWaiting();
        break;
        
      case 'SYNC_REQUEST':
        handleSyncRequest(event, messageTimeout);
        break;
        
      case 'BACKGROUND_SYNC':
        handleBackgroundSync(event, messageTimeout);
        break;
        
      case 'PING':
        // Resposta simples para verificar conectividade
        clearTimeout(messageTimeout);
        if (ports && ports[0]) {
          ports[0].postMessage({ type: 'PONG', timestamp: Date.now() });
        }
        break;
        
      default:
        clearTimeout(messageTimeout);
        console.log('Tipo de mensagem desconhecido:', type);
    }
  } catch (error) {
    clearTimeout(messageTimeout);
    console.error('Erro ao processar mensagem:', error);
  }
});

// Tratar requisições de sincronização
function handleSyncRequest(event, timeoutId) {
  const { data, ports } = event;
  const port = ports && ports[0];
  
  if (data.id) {
    activeChannels.set(data.id, { port, timestamp: Date.now() });
  }
  
  // Notificar clientes sobre sincronização
  withTimeout(
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        try {
          client.postMessage({ 
            type: 'TRIGGER_SYNC', 
            timestamp: Date.now() 
          });
        } catch (error) {
          console.warn('⚠️ Falha ao enviar mensagem para cliente:', error);
        }
      });
    }),
    3000
  ).then(() => {
    clearTimeout(timeoutId);
    if (data.id) {
      activeChannels.delete(data.id);
    }
  }).catch((error) => {
    console.error('Erro na sincronização:', error);
    clearTimeout(timeoutId);
    if (data.id) {
      activeChannels.delete(data.id);
    }
  });
}

// Tratar background sync
function handleBackgroundSync(event, timeoutId) {
  const { data, ports } = event;
  const port = ports && ports[0];
  
  if (data.id) {
    activeChannels.set(data.id, { port, timestamp: Date.now() });
  }
  
  // Processar background sync com timeout
  withTimeout(
    new Promise((resolve) => {
      // Simular processamento de background sync
      setTimeout(() => {
        resolve({ success: true, processed: 0 });
      }, 1000);
    }),
    4000
  ).then((result) => {
    clearTimeout(timeoutId);
    
    if (port) {
      try {
        port.postMessage({
          type: 'SYNC_COMPLETE',
          ...result,
          timestamp: Date.now()
        });
      } catch (error) {
        console.warn('⚠️ Falha ao responder via message port:', error);
      }
    }
    
    if (data.id) {
      activeChannels.delete(data.id);
    }
  }).catch((error) => {
    console.error('Erro no background sync:', error);
    clearTimeout(timeoutId);
    
    if (port) {
      try {
        port.postMessage({
          type: 'SYNC_COMPLETE',
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      } catch (portError) {
        console.warn('⚠️ Falha ao responder erro via message port:', portError);
      }
    }
    
    if (data.id) {
      activeChannels.delete(data.id);
    }
  });
}

// Limpeza periódica de channels órfãos
setInterval(() => {
  const now = Date.now();
  for (const [id, channel] of activeChannels.entries()) {
    if (now - channel.timestamp > MESSAGE_TIMEOUT * 2) {
      console.log('🧹 Limpando channel órfão:', id);
      activeChannels.delete(id);
    }
  }
}, 30000); // Limpar a cada 30 segundos

// Notificar quando online
self.addEventListener('online', () => {
  console.log('🌐 Conexão restaurada');
  withTimeout(
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        try {
          client.postMessage({ 
            type: 'CONNECTION_RESTORED', 
            timestamp: Date.now() 
          });
        } catch (error) {
          console.warn('⚠️ Falha ao notificar restauração de conexão:', error);
        }
      });
    }),
    3000
  ).catch((error) => {
    console.error('Erro ao notificar conexão restaurada:', error);
  });
});

// Background Sync API
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync event:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      withTimeout(
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            try {
              client.postMessage({ 
                type: 'BACKGROUND_SYNC', 
                action: 'PROCESS_QUEUE',
                timestamp: Date.now()
              });
            } catch (error) {
              console.warn('⚠️ Falha ao enviar background sync:', error);
            }
          });
        }),
        5000
      ).catch((error) => {
        console.error('Background sync timeout:', error);
      })
    );
  }
});

console.log('✅ Service Worker carregado com timeouts e melhor tratamento de message channels');
