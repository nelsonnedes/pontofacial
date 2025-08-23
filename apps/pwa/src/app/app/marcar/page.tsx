'use client'
import { useEffect, useRef, useState } from 'react'
import { auth } from '@/app/lib/firebase'
import { enqueue } from '@/app/lib/queue'
import { syncPending, attachOnlineSync } from '@/app/lib/sync'
import { collection, doc, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore'
import { db, storage } from '@/app/lib/firebase'
import { ref, uploadBytes } from 'firebase/storage'

function dataURLToBlob(dataURL:string){
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){ u8arr[n] = bstr.charCodeAt(n); }
  return new Blob([u8arr], { type: mime });
}

import LivenessStep from '@/app/components/LivenessStep'

export default function MarcarPage(){
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string>('Aguardando câmera...')
  const [busy, setBusy] = useState(false)
  const [liveOk, setLiveOk] = useState(false)

  useEffect(()=>{
    async function initCam(){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio:false })
        if (videoRef.current){ videoRef.current.srcObject = stream; await videoRef.current.play() }
        setStatus('Câmera pronta.')
      }catch(e){ setStatus('⚠️ Não foi possível acessar a câmera.') }
    }
    initCam()
    attachOnlineSync()
    if (navigator.onLine){ syncPending().catch(()=>{}) }
  }, [])

  async function marcar(){
    if (busy || !liveOk) { setStatus('Conclua o liveness antes de marcar.'); return }
    setBusy(true)
    try{
      const user = auth.currentUser
      if (!user){ setStatus('Faça login primeiro em /login'); setBusy(false); return }

      const video = videoRef.current!
      const canvas = canvasRef.current!
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

      const coords = await new Promise<GeolocationPosition | null>((resolve)=>{
        if (!navigator.geolocation) return resolve(null)
        navigator.geolocation.getCurrentPosition(p=>resolve(p), _e=>resolve(null), { enableHighAccuracy:true, timeout:5000 })
      })
      const lat = coords?.coords.latitude ?? null
      const lng = coords?.coords.longitude ?? null
      const acc = coords?.coords.accuracy ?? null

      const estabId = 'estab-demo'

      if (!navigator.onLine){
        await enqueue({ userId: user.uid, estabId, dataUrl, lat, lng, acc })
        setStatus('📶 Offline: marcação adicionada à fila. Será sincronizada quando voltar a conexão.')
        return
      }

      const blob = dataURLToBlob(dataUrl)
      const seqRef = doc(db, 'sequences', 'nsr_' + estabId)
      let nsr = 1
      await runTransaction(db, async (tx)=>{
        const snap = await tx.get(seqRef as any)
        const curr = (snap.exists() ? (snap.data().value||0) : 0) + 1
        tx.set(seqRef as any, { value: curr }, { merge: true })
        nsr = curr
      })
      const stamp = Date.now()
      const photoPath = `marcacoes/${user.uid}/${stamp}.jpg`
      const photoRef = ref(storage, photoPath)
      await uploadBytes(photoRef, blob, { contentType: 'image/jpeg' })
      const col = collection(db, 'marcacoes')
      await addDoc(col, {
        usuarioId: user.uid,
        estabId,
        nsr,
        dataHoraTZ: new Date().toISOString(),
        gps: lat && lng ? { lat, lng, accuracy: acc } : null,
        fotoPath: photoPath,
        origem: 'online',
        createdAt: serverTimestamp()
      })
      setStatus('✅ Marcação registrada (NSR ' + nsr + '). Foto em ' + photoPath)

    }catch(e:any){
      console.error(e)
      setStatus('Falha ao marcar ponto: ' + (e?.message||e))
    }finally{
      setBusy(false)
    }
  }

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Marcar Ponto</h1>
      <LivenessStep onDone={()=>setLiveOk(true)} />
      <div className="rounded-xl overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-auto" playsInline muted />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <button disabled={busy} onClick={marcar} className="px-4 py-3 rounded-xl bg-black text-white disabled:opacity-50">
        {busy? 'Processando...' : 'Confirmar Marcação'}
      </button>
      <p className="text-sm">{status}</p>
    </main>
  )
}
