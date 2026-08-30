'use client';

import { notifyUser } from '@/lib/user-dialogs';
import React, { useState, useCallback, useEffect } from 'react';
import { useScheduleManager } from '@/hooks/useScheduleManager';
import { PointAnalysis } from '@/lib/scheduling';
import { collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface Employee {
  id: string;
  nomeCompleto: string;
  cargo: string;
  setor: string;
}

interface VacationRequest {
  id?: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  analyzedBy?: string;
  analyzedAt?: string;
  hrNotes?: string;
}

interface MedicalLeaveRequest {
  id?: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  documentUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  analyzedBy?: string;
  analyzedAt?: string;
  hrNotes?: string;
}

type TabType = 'pending_points' | 'vacation_requests' | 'medical_leaves' | 'create_requests';

export default function HRManagement() {
  const { user } = useAuth();
  const {
    pendingAnalysis,
    isLoadingAnalysis,
    updateAnalysisStatus,
    schedules,
    updateSchedule,
    error,
  } = useScheduleManager();

  // Estados
  const [activeTab, setActiveTab] = useState<TabType>('pending_points');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>([]);
  const [medicalLeaveRequests, setMedicalLeaveRequests] = useState<MedicalLeaveRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);

  // Estados para criação de solicitações
  const [newVacation, setNewVacation] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    reason: ''
  });

  const [newMedicalLeave, setNewMedicalLeave] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    reason: '',
    documentUrl: ''
  });

  // Carregar dados
  useEffect(() => {
    loadEmployees();
    loadRequests();
  }, []);

  const loadEmployees = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const employeesData: Employee[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        employeesData.push({
          id: doc.id,
          nomeCompleto: data.nomeCompleto || '',
          cargo: data.cargo || '',
          setor: data.setor || ''
        });
      });
      
      setEmployees(employeesData);
    } catch (error) {
      console.error('❌ Erro ao carregar funcionários:', error);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  const loadRequests = async () => {
    try {
      // Carregar solicitações de férias
      const vacationQuery = query(
        collection(db, 'vacation_requests'),
        orderBy('requestedAt', 'desc')
      );
      const vacationSnapshot = await getDocs(vacationQuery);
      const vacationData: VacationRequest[] = vacationSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as VacationRequest));

      // Carregar solicitações de atestado
      const medicalQuery = query(
        collection(db, 'medical_leave_requests'),
        orderBy('requestedAt', 'desc')
      );
      const medicalSnapshot = await getDocs(medicalQuery);
      const medicalData: MedicalLeaveRequest[] = medicalSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as MedicalLeaveRequest));

      setVacationRequests(vacationData);
      setMedicalLeaveRequests(medicalData);
    } catch (error) {
      console.error('❌ Erro ao carregar solicitações:', error);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  // Aprovar/Reprovar análise de ponto
  const handlePointAnalysis = useCallback(async (
    analysisId: string,
    status: 'approved' | 'rejected',
    notes: string
  ) => {
    try {
      await updateAnalysisStatus(analysisId, status, notes);
      console.log(`✅ Análise ${status === 'approved' ? 'aprovada' : 'reprovada'}`);
    } catch (error) {
      console.error('❌ Erro ao atualizar análise:', error);
    }
  }, [updateAnalysisStatus]);

  // Criar solicitação de férias
  const handleCreateVacation = useCallback(async () => {
    if (!newVacation.employeeId || !newVacation.startDate || !newVacation.endDate || !user) {
      notifyUser('Preencha todos os campos obrigatórios.');
      return;
    }

    const employee = employees.find(e => e.id === newVacation.employeeId);
    if (!employee) return;

    try {
      const vacationRequest: Omit<VacationRequest, 'id'> = {
        employeeId: newVacation.employeeId,
        employeeName: employee.nomeCompleto,
        startDate: newVacation.startDate,
        endDate: newVacation.endDate,
        reason: newVacation.reason,
        status: 'approved', // RH cria já aprovado
        requestedAt: new Date().toISOString(),
        analyzedBy: user.uid,
        analyzedAt: new Date().toISOString(),
        hrNotes: 'Lançado diretamente pelo RH'
      };

      await addDoc(collection(db, 'vacation_requests'), vacationRequest);

      // Atualizar horário do funcionário
      const employeeSchedule = schedules.find(s => s.employeeId === newVacation.employeeId);
      if (employeeSchedule && employeeSchedule.id) {
        const updatedVacations = [...employeeSchedule.vacations, {
          startDate: newVacation.startDate,
          endDate: newVacation.endDate,
          approved: true,
          approvedBy: user.uid,
          approvedAt: new Date().toISOString()
        }];

        await updateSchedule(employeeSchedule.id, { vacations: updatedVacations });
      }

      setNewVacation({ employeeId: '', startDate: '', endDate: '', reason: '' });
      loadRequests();
      
      notifyUser(`✅ Férias lançadas com sucesso para ${employee.nomeCompleto}!`);
    } catch (error) {
      console.error('❌ Erro ao criar férias:', error);
      notifyUser('Erro ao lançar férias. Tente novamente.');
    }
  }, [newVacation, employees, user, schedules, updateSchedule]);

  // Criar solicitação de atestado
  const handleCreateMedicalLeave = useCallback(async () => {
    if (!newMedicalLeave.employeeId || !newMedicalLeave.startDate || !newMedicalLeave.endDate || !user) {
      notifyUser('Preencha todos os campos obrigatórios.');
      return;
    }

    const employee = employees.find(e => e.id === newMedicalLeave.employeeId);
    if (!employee) return;

    try {
      const medicalRequest: Omit<MedicalLeaveRequest, 'id'> = {
        employeeId: newMedicalLeave.employeeId,
        employeeName: employee.nomeCompleto,
        startDate: newMedicalLeave.startDate,
        endDate: newMedicalLeave.endDate,
        reason: newMedicalLeave.reason,
        documentUrl: newMedicalLeave.documentUrl,
        status: 'approved', // RH cria já aprovado
        requestedAt: new Date().toISOString(),
        analyzedBy: user.uid,
        analyzedAt: new Date().toISOString(),
        hrNotes: 'Lançado diretamente pelo RH'
      };

      await addDoc(collection(db, 'medical_leave_requests'), medicalRequest);

      // Atualizar horário do funcionário
      const employeeSchedule = schedules.find(s => s.employeeId === newMedicalLeave.employeeId);
      if (employeeSchedule && employeeSchedule.id) {
        const updatedMedicalLeave = [...employeeSchedule.medicalLeave, {
          startDate: newMedicalLeave.startDate,
          endDate: newMedicalLeave.endDate,
          reason: newMedicalLeave.reason,
          documentUrl: newMedicalLeave.documentUrl,
          approved: true,
          approvedBy: user.uid,
          approvedAt: new Date().toISOString()
        }];

        await updateSchedule(employeeSchedule.id, { medicalLeave: updatedMedicalLeave });
      }

      setNewMedicalLeave({ employeeId: '', startDate: '', endDate: '', reason: '', documentUrl: '' });
      loadRequests();
      
      notifyUser(`✅ Atestado lançado com sucesso para ${employee.nomeCompleto}!`);
    } catch (error) {
      console.error('❌ Erro ao criar atestado:', error);
      notifyUser('Erro ao lançar atestado. Tente novamente.');
    }
  }, [newMedicalLeave, employees, user, schedules, updateSchedule]);

  // Componente de análise de ponto individual
  const PointAnalysisItem: React.FC<{ analysis: PointAnalysis }> = ({ analysis }) => {
    const [notes, setNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleApprove = async () => {
      setIsProcessing(true);
      try {
        await handlePointAnalysis(analysis.id!, 'approved', notes || 'Aprovado pelo RH');
      } finally {
        setIsProcessing(false);
      }
    };

    const handleReject = async () => {
      if (!notes.trim()) {
        notifyUser('É obrigatório informar o motivo da reprovação.');
        return;
      }
      
      setIsProcessing(true);
      try {
        await handlePointAnalysis(analysis.id!, 'rejected', notes);
      } finally {
        setIsProcessing(false);
      }
    };

    const delayText = analysis.delayMinutes > 0 
      ? `${analysis.delayMinutes} min de atraso` 
      : `${Math.abs(analysis.delayMinutes)} min antecipado`;

    const typeLabels = {
      'entrada': '🟢 Entrada',
      'saida': '🔴 Saída',
      'pausa_inicio': '🟡 Início Pausa',
      'pausa_fim': '🟡 Fim Pausa'
    };

    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h4 className="font-semibold text-gray-900">{analysis.employeeName}</h4>
            <p className="text-sm text-gray-600">{analysis.date} - {typeLabels[analysis.type]}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            analysis.delayMinutes > 0 
              ? 'bg-red-100 text-red-800' 
              : 'bg-blue-100 text-blue-800'
          }`}>
            {delayText}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <span className="text-gray-500">Horário previsto:</span>
            <div className="font-medium">{analysis.scheduledTime}</div>
          </div>
          <div>
            <span className="text-gray-500">Horário real:</span>
            <div className="font-medium">{analysis.actualTime}</div>
          </div>
          <div>
            <span className="text-gray-500">Tolerância:</span>
            <div className="font-medium">{analysis.toleranceMinutes} min</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observações do RH
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Adicione observações sobre esta ocorrência..."
          />
        </div>

        <div className="flex justify-end space-x-2">
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? '⏳' : '❌'} Reprovar
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? '⏳' : '✅'} Aprovar
          </button>
        </div>
      </div>
    );
  };

  if (isLoadingAnalysis || isLoadingEmployees || isLoadingRequests) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados do RH...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👔 Gerenciamento RH</h1>
            <p className="text-gray-600">Análise de pendências, férias e atestados</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Tabs de navegação */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('pending_points')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pending_points'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🔍 Pontos Pendentes ({pendingAnalysis.length})
            </button>
            <button
              onClick={() => setActiveTab('vacation_requests')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'vacation_requests'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🏖️ Férias ({vacationRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('medical_leaves')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'medical_leaves'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🏥 Atestados ({medicalLeaveRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('create_requests')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'create_requests'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              ➕ Lançar
            </button>
          </nav>
        </div>

        {/* Conteúdo das tabs */}
        {activeTab === 'pending_points' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🔍 Análise de Pontos Pendentes
            </h3>
            
            {pendingAnalysis.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                🎉 Nenhum ponto pendente de análise!
              </div>
            ) : (
              <div className="space-y-4">
                {pendingAnalysis.map((analysis) => (
                  <PointAnalysisItem key={analysis.id} analysis={analysis} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'vacation_requests' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🏖️ Solicitações de Férias
            </h3>
            
            {vacationRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhuma solicitação de férias.
              </div>
            ) : (
              <div className="space-y-4">
                {vacationRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{request.employeeName}</h4>
                        <p className="text-sm text-gray-600">
                          {request.startDate} a {request.endDate}
                        </p>
                        <p className="text-sm text-gray-600">Motivo: {request.reason}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {request.status === 'approved' ? '✅ Aprovado' :
                         request.status === 'rejected' ? '❌ Rejeitado' : '⏳ Pendente'}
                      </span>
                    </div>
                    
                    {request.hrNotes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                        <strong>Observações RH:</strong> {request.hrNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'medical_leaves' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🏥 Atestados Médicos
            </h3>
            
            {medicalLeaveRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum atestado médico registrado.
              </div>
            ) : (
              <div className="space-y-4">
                {medicalLeaveRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{request.employeeName}</h4>
                        <p className="text-sm text-gray-600">
                          {request.startDate} a {request.endDate}
                        </p>
                        <p className="text-sm text-gray-600">Motivo: {request.reason}</p>
                        {request.documentUrl && (
                          <p className="text-sm text-blue-600">
                            📎 <a href={request.documentUrl} target="_blank" rel="noopener noreferrer">
                              Ver documento
                            </a>
                          </p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {request.status === 'approved' ? '✅ Aprovado' :
                         request.status === 'rejected' ? '❌ Rejeitado' : '⏳ Pendente'}
                      </span>
                    </div>
                    
                    {request.hrNotes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                        <strong>Observações RH:</strong> {request.hrNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'create_requests' && (
          <div className="space-y-8">
            {/* Lançar Férias */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🏖️ Lançar Férias
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Funcionário
                  </label>
                  <select
                    value={newVacation.employeeId}
                    onChange={(e) => setNewVacation(prev => ({ ...prev, employeeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um funcionário...</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>
                        {employee.nomeCompleto} - {employee.cargo}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo
                  </label>
                  <input
                    type="text"
                    value={newVacation.reason}
                    onChange={(e) => setNewVacation(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Férias anuais, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={newVacation.startDate}
                    onChange={(e) => setNewVacation(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={newVacation.endDate}
                    onChange={(e) => setNewVacation(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleCreateVacation}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🏖️ Lançar Férias
                </button>
              </div>
            </div>

            {/* Lançar Atestado */}
            <div className="border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🏥 Lançar Atestado Médico
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Funcionário
                  </label>
                  <select
                    value={newMedicalLeave.employeeId}
                    onChange={(e) => setNewMedicalLeave(prev => ({ ...prev, employeeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um funcionário...</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>
                        {employee.nomeCompleto} - {employee.cargo}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo/CID
                  </label>
                  <input
                    type="text"
                    value={newMedicalLeave.reason}
                    onChange={(e) => setNewMedicalLeave(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Motivo ou CID do atestado"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={newMedicalLeave.startDate}
                    onChange={(e) => setNewMedicalLeave(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={newMedicalLeave.endDate}
                    onChange={(e) => setNewMedicalLeave(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL do Documento (Opcional)
                  </label>
                  <input
                    type="url"
                    value={newMedicalLeave.documentUrl}
                    onChange={(e) => setNewMedicalLeave(prev => ({ ...prev, documentUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="https://exemplo.com/atestado.pdf"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleCreateMedicalLeave}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  🏥 Lançar Atestado
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
