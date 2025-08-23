import { db as firestore, storage } from '@/app/lib/firebase'
import { collection, doc, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { drain, Pendencia } from '@/app/lib/queue'

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
    const curr = (snap.exists() ? (snap.data().value||0) : 0) + 1
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
  await drain(async (p)=>{ await processOne(p) })
}

export function attachOnlineSync(){
  window.addEventListener('online', ()=>{ syncPending().catch(()=>{}) })
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) syncPending().catch(()=>{}) })
}
