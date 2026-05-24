import { getFirebaseApp } from '@/lib/firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { drainQueue, Pendencia } from '@/lib/offline-queue'

type PointType = 'entry' | 'exit' | 'break_start' | 'break_end'

const legacyTypeMap: Record<string, PointType> = {
  entrada: 'entry',
  saida: 'exit',
  intervalo_inicio: 'break_start',
  intervalo_fim: 'break_end',
  entry: 'entry',
  exit: 'exit',
  break_start: 'break_start',
  break_end: 'break_end'
}

function normalizePointType(payload: any): PointType {
  const rawType = String(payload.type || payload.tipo || 'entry')
  return legacyTypeMap[rawType] || 'entry'
}

function normalizeLocation(payload: any) {
  const latitude = Number(
    payload.location?.latitude ??
    payload.localizacao?.latitude ??
    payload.lat
  )
  const longitude = Number(
    payload.location?.longitude ??
    payload.localizacao?.longitude ??
    payload.lng
  )
  const accuracy = Number(
    payload.location?.accuracy ??
    payload.localizacao?.precisao ??
    payload.acc
  )

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    address: payload.location?.address || payload.localizacao?.endereco
  }
}

export async function processOne(p: Pendencia){
  const payload = p.payload as any
  const app = getFirebaseApp()
  if (!app) {
    throw new Error('Firebase nao inicializado')
  }

  const markPoint = httpsCallable(getFunctions(app, 'us-east1'), 'markPoint')
  const response = await markPoint({
    userId: payload.userId || payload.usuarioId || payload.uid,
    type: normalizePointType(payload),
    clientTimestamp: Number(payload.timestamp || payload.createdAt || Date.now()),
    clientRecordId: String(
      payload.clientRecordId ||
      p.id ||
      `${payload.userId || payload.usuarioId || 'auth'}-${p.createdAt}`
    ),
    location: normalizeLocation(payload),
    faceEvidence: payload.faceEvidence || payload.faceEmbedding || payload.dataUrl,
    deviceInfo: payload.deviceInfo,
    metadata: {
      ...(payload.metadata || {}),
      estabId: payload.estabId,
      source: 'legacy-sync'
    }
  })

  const result = response.data as { success?: boolean }
  if (!result?.success) {
    throw new Error('Backend recusou o registro de ponto legado')
  }
}

export async function syncPending(){
  if (!navigator.onLine) return
  await drainQueue(async (p)=>{ await processOne(p) })
}

export function attachOnlineSync(){
  // Sincronização sempre habilitada em produção
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Listeners básicos sempre ativos
  window.addEventListener('online', ()=>{ syncPending().catch(()=>{}) })
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) syncPending().catch(()=>{}) })
  
  // Service Worker habilitado apenas em produção
  if ('serviceWorker' in navigator && isProduction) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TRIGGER_SYNC') {
        syncPending().catch(()=>{})
      }
      if (event.data && event.data.type === 'CONNECTION_RESTORED') {
        syncPending().catch(()=>{})
      }
      if (event.data && event.data.type === 'BACKGROUND_SYNC') {
        syncPending().catch(()=>{})
      }
    })
    
    // Registrar background sync se disponível
    navigator.serviceWorker.ready.then(registration => {
      if ('sync' in registration && registration.sync) {
        (registration.sync as any).register('background-sync').catch(()=>{})
      }
    }).catch(()=>{})
  }
  
  // Em desenvolvimento, forçar sincronização imediata
  if (!isProduction) {
    setInterval(() => {
      if (navigator.onLine) {
        syncPending().catch(()=>{})
      }
    }, 10000) // A cada 10 segundos em dev
  }
}
