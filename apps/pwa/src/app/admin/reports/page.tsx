'use client';

import { useEffect, useState } from 'react';
import ReportsManager from '@/components/ReportsManager';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ReportStats {
  monthRecords: number;
  employeesWithRecords: number;
  lastRecordAt: number | null;
  dataSources: number;
}

function normalizeTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export default function AdminReportsPage() {
  const [stats, setStats] = useState<ReportStats>({
    monthRecords: 0,
    employeesWithRecords: 0,
    lastRecordAt: null,
    dataSources: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      setIsLoadingStats(true);
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const [timeRecordsSnap, marcacoesSnap] = await Promise.all([
          getDocs(collection(db, 'timeRecords')),
          getDocs(collection(db, 'marcacoes'))
        ]);
        const seenRecords = new Set<string>();
        const employees = new Set<string>();
        let lastRecordAt: number | null = null;

        const collectRecord = (id: string, data: any) => {
          const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt);
          if (!timestamp) return;
          if (timestamp >= startOfMonth && timestamp < endOfMonth) {
            seenRecords.add(data.timeRecordId || id);
            const employeeId = data.userId || data.usuarioId || data.authUid;
            if (employeeId) employees.add(employeeId);
          }
          if (!lastRecordAt || timestamp > lastRecordAt) {
            lastRecordAt = timestamp;
          }
        };

        timeRecordsSnap.forEach((doc) => collectRecord(doc.id, doc.data()));
        marcacoesSnap.forEach((doc) => collectRecord(doc.id, doc.data()));

        if (active) {
          setStats({
            monthRecords: seenRecords.size,
            employeesWithRecords: employees.size,
            lastRecordAt,
            dataSources: Number(timeRecordsSnap.size > 0) + Number(marcacoesSnap.size > 0)
          });
        }
      } finally {
        if (active) setIsLoadingStats(false);
      }
    }

    loadStats();
    return () => {
      active = false;
    };
  }, []);

  const statCards = [
    {
      label: 'Registros Este Mês',
      value: isLoadingStats ? '...' : stats.monthRecords.toLocaleString('pt-BR'),
      icon: '📊',
      color: 'text-orange-600'
    },
    {
      label: 'Funcionários no Período',
      value: isLoadingStats ? '...' : stats.employeesWithRecords.toLocaleString('pt-BR'),
      icon: '👤',
      color: 'text-blue-600'
    },
    {
      label: 'Último Registro',
      value: isLoadingStats
        ? '...'
        : stats.lastRecordAt
          ? new Date(stats.lastRecordAt).toLocaleDateString('pt-BR')
          : 'Sem dados',
      icon: '🕐',
      color: 'text-green-600'
    },
    {
      label: 'Fontes de Dados',
      value: isLoadingStats ? '...' : stats.dataSources.toString(),
      icon: '🗂️',
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">📄 Relatórios</h2>
        <p className="text-gray-600 mt-1">
          Gerar prévias e relatórios com base nos registros reais do sistema
        </p>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow p-6 border">
            <div className="flex items-center">
              <div className={`text-2xl ${card.color} mr-4`}>{card.icon}</div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Componente de Relatórios */}
      <ReportsManager />
    </div>
  );
}
