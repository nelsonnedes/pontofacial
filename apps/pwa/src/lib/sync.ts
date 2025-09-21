import { db as firestore, storage } from '@/lib/firebase'
import { collection, doc, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { drainQueue, Pendencia } from '@/lib/offline-queue'

function dataURLToBlob(dataURL:string){
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){ u8arr[n] = bstr.charCodeAt(n); }
  return new Blob([u8arr], { type: mime });
}

export async function processOne(p: Pendencia){
  const payload = p.payload as any
  const { userId, estabId, dataUrl, lat, lng, acc } = payload
  const seqRef = doc(firestore, 'sequences', 'nsr_' + estabId)
  let nsr = 1
  await runTransaction(firestore, async (tx)=>{
    const snap = await tx.get(seqRef as any)
    const data = snap.exists() ? snap.data() : null
    const curr = (data ? ((data as any).value || 0) : 0) + 1
    tx.set(seqRef as any, { value: curr }, { merge: true })
    nsr = curr
  })
  const blob = dataURLToBlob(dataUrl)
  const stamp = Date.now()
  const photoPath = `marcacoes/${userId}/${stamp}.jpg`
  const photoRef = ref(storage, photoPath)
  await uploadBytes(photoRef, blob, { contentType: 'image/jpeg' })
  const col = collection(firestore, 'marcacoes')
  await addDoc(col, {
    usuarioId: userId,
    estabId,
    nsr,
    dataHoraTZ: new Date().toISOString(),
    gps: (lat && lng) ? { lat, lng, accuracy: acc } : null,
    fotoPath: photoPath,
    origem: 'offline-sync',
    createdAt: serverTimestamp()
  })
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
