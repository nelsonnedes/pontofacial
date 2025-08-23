'use client'
import { useEffect, useMemo, useState } from 'react'

const challenges = [
  'Piscar os olhos 2x',
  'Sorrir bem amplo',
  'Vire a cabeça para a esquerda',
  'Vire a cabeça para a direita'
]

export default function LivenessStep({ onDone }:{ onDone: ()=>void }){
  const [step, setStep] = useState(0)
  const [msg, setMsg] = useState('Prepare-se...')
  const target = useMemo(()=> challenges[Math.floor(Math.random()*challenges.length)], [])

  useEffect(()=>{
    const id = setTimeout(()=> setStep(1), 800)
    return ()=> clearTimeout(id)
  },[])

  useEffect(()=>{
    if (step === 1) setMsg(`Agora: ${target}`)
  },[step, target])

  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm">{msg}</p>
      <button onClick={onDone} className="mt-2 px-3 py-2 rounded-lg bg-gray-900 text-white">Concluir</button>
      <p className="text-xs opacity-60 mt-1">* Liveness básico (placeholder). Validação automática por visão computacional pode ser adicionada.</p>
    </div>
  )
}
