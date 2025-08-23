import Dexie, { Table } from 'dexie';
export interface Pendencia {
  id?: number;
  payload: any;
  createdAt: number;
}
export class QueueDB extends Dexie {
  pendencias!: Table<Pendencia, number>;
  constructor() {
    super('pf-queue');
    this.version(1).stores({ pendencias: '++id, createdAt' });
  }
}
export const db = new QueueDB();
export async function enqueue(payload:any){ await db.pendencias.add({ payload, createdAt: Date.now() }); }
export async function drain(consumer:(p:Pendencia)=>Promise<void>){
  const all = await db.pendencias.toArray();
  for (const p of all){
    await consumer(p);
    await db.pendencias.delete(p.id!);
  }
}
