import Link from 'next/link'
export default function AdminHome(){
  return (
    <main className="p-4 space-y-2">
      <h1 className="text-xl font-semibold">Admin</h1>
      <ul className="list-disc list-inside">
        <li><Link className="underline" href="/admin/empresas">Empresas</Link></li>
        <li><Link className="underline" href="/admin/estabelecimentos">Estabelecimentos</Link></li>
        <li><Link className="underline" href="/admin/usuarios">Usuários</Link></li>
        <li><Link className="underline" href="/admin/politicas">Políticas CLT</Link></li>
        <li><Link className="underline" href="/admin/afd">Gerar AFD</Link></li>
        <li><Link className="underline" href="/admin/aej">Gerar AEJ</Link></li>
        <li><Link className="underline" href="/admin/espelho">Gerar Espelho (PDF)</Link></li>
              <li><a className="underline" href="/admin/ajustes">Ajustes de Relógio</a></li>
        <li><a className="underline" href="/admin/eventos">Eventos Sensíveis</a></li>
              <li><a className="underline" href="/admin/feriados">Feriados</a></li>
      </ul>
    </main>
  )
}
