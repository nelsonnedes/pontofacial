'use client';

import { ReactNode, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  acceptRequiredLegalTerms,
  getUserLegalStatus,
  REQUIRED_LEGAL_VERSIONS
} from '@/lib/legal-compliance';

interface LegalTermsGateProps {
  user: User;
  children: ReactNode;
}

export default function LegalTermsGate({ user, children }: LegalTermsGateProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isCompliant, setIsCompliant] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getUserLegalStatus(user)
      .then((status) => {
        if (!mounted) return;
        setIsCompliant(status.isCompliant);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Erro ao verificar aceites legais:', err);
        setError('Nao foi possivel validar os aceites obrigatorios.');
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleAccept = async () => {
    if (!accepted || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await acceptRequiredLegalTerms(user);
      setIsCompliant(true);
    } catch (err) {
      console.error('Erro ao registrar aceite legal:', err);
      setError('Falha ao registrar aceite. Verifique a conexao e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Validando termos obrigatorios...</p>
        </div>
      </div>
    );
  }

  if (isCompliant) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-lg p-6 sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-blue-700 mb-2">Conformidade obrigatoria</p>
          <h1 className="text-2xl font-bold text-slate-900">Termos e aviso de privacidade</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Para continuar, registre ciencia sobre o tratamento de dados pessoais, uso de
            biometria facial para controle de jornada, regras de seguranca, retencao e canais
            de atendimento ao titular. Este aceite fica versionado para auditoria.
          </p>
        </div>

        <div className="grid gap-3 text-sm text-slate-700 mb-6">
          <div className="rounded-lg border border-slate-200 p-4">
            <strong>Termo de uso:</strong> {REQUIRED_LEGAL_VERSIONS.appTermsVersion}
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <strong>Aviso de privacidade:</strong> {REQUIRED_LEGAL_VERSIONS.privacyNoticeVersion}
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <strong>Ciencia biometrica:</strong> {REQUIRED_LEGAL_VERSIONS.biometricNoticeVersion}
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            Declaro que li e estou ciente das finalidades, bases legais, medidas de seguranca,
            uso de biometria facial, possibilidade de alternativa operacional quando aplicavel,
            politica de retencao e canais para exercer direitos de titular.
          </span>
        </label>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleAccept}
            disabled={!accepted || isSubmitting}
            className="px-5 py-3 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {isSubmitting ? 'Registrando...' : 'Aceitar e continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
