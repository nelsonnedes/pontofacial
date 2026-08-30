'use client';

import { useState, useEffect, useCallback } from 'react';

interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface GeolocationError {
  code: number;
  message: string;
}

interface UseGeolocationReturn {
  location: GeolocationData | null;
  error: GeolocationError | null;
  isLoading: boolean;
  isSupported: boolean;
  getCurrentLocation: () => Promise<GeolocationData>;
  watchLocation: () => void;
  clearWatch: () => void;
}

export function useGeolocation(): UseGeolocationReturn {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  const isSupported = typeof window !== 'undefined' && 'geolocation' in navigator;

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    const locationData: GeolocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };
    
    setLocation(locationData);
    setError(null);
    setIsLoading(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    const errorData: GeolocationError = {
      code: err.code,
      message: getErrorMessage(err.code)
    };
    
    setError(errorData);
    setLocation(null);
    setIsLoading(false);
  }, []);

  const getErrorMessage = (code: number): string => {
    switch (code) {
      case 1:
        return 'Permissão de localização negada pelo usuário.';
      case 2:
        return 'Localização indisponível. Verifique sua conexão.';
      case 3:
        return 'Tempo limite excedido para obter localização.';
      default:
        return 'Erro desconhecido ao obter localização.';
    }
  };

  const getCurrentLocation = useCallback((): Promise<GeolocationData> => {
    return new Promise((resolve, reject) => {
      if (!isSupported) {
        reject(new Error('Geolocalização não é suportada neste dispositivo.'));
        return;
      }

      setIsLoading(true);
      setError(null);

      const options: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000, // 10 segundos
        maximumAge: 60000 // 1 minuto
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: GeolocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          
          handleSuccess(position);
          resolve(locationData);
        },
        (err) => {
          handleError(err);
          reject(err);
        },
        options
      );
    });
  }, [isSupported, handleSuccess, handleError]);

  const watchLocation = useCallback(() => {
    if (!isSupported) {
      setError({
        code: -1,
        message: 'Geolocalização não é suportada neste dispositivo.'
      });
      return;
    }

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    setIsLoading(true);
    setError(null);

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000 // 30 segundos
    };

    const id = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options
    );

    setWatchId(id);
  }, [isSupported, watchId, handleSuccess, handleError]);

  const clearWatch = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsLoading(false);
    }
  }, [watchId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  return {
    location,
    error,
    isLoading,
    isSupported,
    getCurrentLocation,
    watchLocation,
    clearWatch
  };
}

export type { GeolocationData, GeolocationError };