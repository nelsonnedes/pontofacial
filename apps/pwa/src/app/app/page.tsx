import Link from 'next/link'
import PwaInstall from '@/app/components/PwaInstall'
export default function AppHome(){
  return (
    <main className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Ponto Facial — PWA</h1>
      <div className="grid gap-3">
        <Link href="/app/marcar" className="px-4 py-3 rounded-xl bg-black text-white">Marcar Ponto</Link>
        <Link href="/admin/afd" className="px-4 py-3 rounded-xl bg-gray-900/5">Admin • AFD</Link>
      </div>
      <PwaInstall />
    </main>
  )
}
