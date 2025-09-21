'use client';

import { useState, useEffect } from 'react';

interface GeoBadgeProps {
  onLocationUpdate?: (location: GeolocationData | null) => void;
  onError?: (error: string) => void;
  className?: string;
  showDetails?: boolean;
  autoStart?: boolean;
}

interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  address?: string;
  error?: string;
}

type LocationStatus = 'idle' | 'requesting' | 'success' | 'error' | 'denied';

export default function GeoBadge({ 
  onLocationUpdate, 
  onError, 
  className = '', 
  showDetails = true,
  autoStart = false
}: GeoBadgeProps) {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [error, setError] = useState<string>('');
  const [isWatching, setIsWatching] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  // Verificar se geolocalização está disponível
  const isGeolocationAvailable = typeof window !== 'undefined' && 'geolocation' in navigator;

  // Opções de geolocalização
  const geoOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000 // Cache por 1 minuto
  };

  // Obter localização atual
  const getCurrentLocation = () => {
    if (!isGeolocationAvailable || typeof window === 'undefined') {
      const errorMsg = 'Geolocalização não está disponível neste navegador';
      setError(errorMsg);
      setStatus('error');
      onError?.(errorMsg);
      return;
    }

    setStatus('requesting');
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData: GeolocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        setLocation(locationData);
        setStatus('success');
        onLocationUpdate?.(locationData);

        // Tentar obter endereço (opcional)
        reverseGeocode(locationData.latitude, locationData.longitude);
      },
      (error) => {
        let errorMsg = 'Erro ao obter localização';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Permissão de localização negada';
            setStatus('denied');
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Localização indisponível';
            setStatus('error');
            break;
          case error.TIMEOUT:
            errorMsg = 'Tempo limite para obter localização';
            setStatus('error');
            break;
          default:
            setStatus('error');
            break;
        }

        setError(errorMsg);
        onError?.(errorMsg);
      },
      geoOptions
    );
  };

  // Iniciar monitoramento contínuo
  const startWatching = () => {
    if (!isGeolocationAvailable || isWatching || typeof window === 'undefined') return;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: GeolocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        setLocation(locationData);
        setStatus('success');
        onLocationUpdate?.(locationData);
      },
      (error) => {
        let errorMsg = 'Erro no monitoramento de localização';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Permissão de localização negada';
            setStatus('denied');
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Localização indisponível';
            setStatus('error');
            break;
          case error.TIMEOUT:
            errorMsg = 'Tempo limite para monitorar localização';
            setStatus('error');
            break;
        }

        setError(errorMsg);
        onError?.(errorMsg);
      },
      geoOptions
    );

    setWatchId(id);
    setIsWatching(true);
  };

  // Parar monitoramento
  const stopWatching = () => {
    if (watchId !== null && typeof window !== 'undefined') {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsWatching(false);
    }
  };

  // Geocodificação reversa (simulada - em produção usar API real)
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // Em produção, usar uma API real como Google Maps, OpenStreetMap, etc.
      // Por enquanto, simular um endereço
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return;
      }
      const mockAddress = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
      
      setLocation(prev => prev ? {
        ...prev,
        address: mockAddress
      } : null);
    } catch (error) {
      console.warn('Erro na geocodificação reversa:', error);
    }
  };

  // Formatar coordenadas
  const formatCoordinates = (lat: number, lng: number) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return 'Coordenadas inválidas';
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  // Formatar precisão
  const formatAccuracy = (accuracy: number) => {
    if (accuracy < 10) return 'Alta precisão';
    if (accuracy < 50) return 'Boa precisão';
    if (accuracy < 100) return 'Precisão média';
    return 'Baixa precisão';
  };

  // Auto-start se habilitado
  useEffect(() => {
    if (autoStart && isGeolocationAvailable) {
      getCurrentLocation();
    }
  }, [autoStart]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, []);

  // Ícones baseados no status
  const getStatusIcon = () => {
    switch (status) {
      case 'requesting':
        return '🔄';
      case 'success':
        return '📍';
      case 'error':
        return '❌';
      case 'denied':
        return '🚫';
      default:
        return '📍';
    }
  };

  // Cores baseadas no status
  const getStatusColor = () => {
    switch (status) {
      case 'requesting':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'success':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'error':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'denied':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (!isGeolocationAvailable) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-red-50 text-red-700 border-red-200 ${className}`}>
        <span>🚫</span>
        <span className="text-sm font-medium">Geolocalização não disponível</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span>{getStatusIcon()}</span>
          Localização
        </h4>
        
        <div className="flex gap-2">
          {!isWatching ? (
            <button
              onClick={getCurrentLocation}
              disabled={status === 'requesting'}
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {status === 'requesting' ? '⏳' : '🔄'} Atualizar
            </button>
          ) : (
            <button
              onClick={stopWatching}
              className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              ⏹️ Parar
            </button>
          )}
          
          {!isWatching && status === 'success' && (
            <button
              onClick={startWatching}
              className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              👁️ Monitorar
            </button>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium mb-3 ${getStatusColor()}`}>
        <span>{getStatusIcon()}</span>
        <span>
          {status === 'idle' && 'Aguardando localização'}
          {status === 'requesting' && 'Obtendo localização...'}
          {status === 'success' && 'Localização obtida'}
          {status === 'error' && 'Erro na localização'}
          {status === 'denied' && 'Permissão negada'}
        </span>
        {isWatching && <span className="animate-pulse">🔴</span>}
      </div>

      {/* Detalhes da localização */}
      {showDetails && location && status === 'success' && (
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span className="font-medium">Coordenadas:</span>
            <span className="font-mono">{formatCoordinates(location.latitude, location.longitude)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="font-medium">Precisão:</span>
            <span>{formatAccuracy(location.accuracy)} (~{Math.round(location.accuracy)}m)</span>
          </div>
          
          <div className="flex justify-between">
            <span className="font-medium">Atualizado:</span>
            <span>{new Date(location.timestamp).toLocaleTimeString()}</span>
          </div>
          
          {location.address && (
            <div className="pt-2 border-t border-gray-100">
              <span className="font-medium">Endereço:</span>
              <p className="text-gray-500 mt-1">{location.address}</p>
            </div>
          )}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600 font-medium">{error}</p>
          
          {status === 'denied' && (
            <p className="text-xs text-red-500 mt-1">
              💡 Dica: Permita o acesso à localização nas configurações do navegador
            </p>
          )}
        </div>
      )}

      {/* Informações de debug */}
      {process.env.NODE_ENV === 'development' && location && (
        <div className="mt-3 p-2 bg-gray-50 rounded-lg text-xs text-gray-500">
          <p><strong>Debug:</strong></p>
          <p>Status: {status}</p>
          <p>Watching: {isWatching ? 'Sim' : 'Não'}</p>
          <p>Watch ID: {watchId}</p>
          <p>Timestamp: {location.timestamp}</p>
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { GeoBadgeProps, GeolocationData };