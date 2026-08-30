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
    const _choice = await deferred.userChoice
    setVisible(false)
  }
  if (!visible) return null
  return (
    <div className="fixed bottom-20 left-4 z-[9999]">
      <button onClick={install} className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all flex items-center gap-2 border border-blue-400/30">
        <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        Instalar PWA
      </button>
    </div>
  )
}
