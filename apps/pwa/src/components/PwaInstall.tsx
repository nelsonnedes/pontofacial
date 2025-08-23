'use client'
import { useEffect, useState } from 'react'
export default function PwaInstall(){
  const [deferred, setDeferred] = useState<any>(null)
  const [visible, setVisible] = useState(false)
  useEffect(()=>{
    const handler = (e:any)=>{ e.preventDefault(); setDeferred(e); setVisible(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return ()=> window.removeEventListener('beforeinstallprompt', handler)
  },[])
  async function install(){
    if (!deferred) return
    deferred.prompt()
    const choice = await deferred.userChoice
    setVisible(false)
  }
  if (!visible) return null
  return <button onClick={install} className="px-3 py-2 rounded-lg bg-amber-500 text-black">Instalar PWA</button>
}
