'use client'
import { useEffect } from 'react'
export default function RegisterSW(){
  useEffect(()=>{
    if ('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').then(reg=>{
        if (reg.waiting){ reg.waiting.postMessage({ type:'SKIP_WAITING' }) }
      }).catch(()=>{})
    }
  },[])
  return null
}
