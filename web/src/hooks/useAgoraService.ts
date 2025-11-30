import { useEffect, useRef } from 'react';
import { AgoraService } from '../voice/agoraService';

// Singleton instance
let serviceInstance: AgoraService | null = null;

/**
 * React hook providing AgoraService singleton with lifecycle management
 */
export function useAgoraService(): AgoraService {
  const serviceRef = useRef<AgoraService | null>(null);

  useEffect(() => {
    // Create singleton instance if it doesn't exist
    if (!serviceInstance) {
      serviceInstance = new AgoraService();
      console.log('[useAgoraService] Created AgoraService singleton');
    }

    serviceRef.current = serviceInstance;

    // Cleanup on unmount (only if this is the last component using it)
    return () => {
      // Note: We don't destroy the singleton here because other components might be using it
      // The service will be cleaned up when the app unmounts or explicitly destroyed
      serviceRef.current = null;
    };
  }, []);

  if (!serviceRef.current) {
    // Fallback: create instance if hook is called before effect runs
    if (!serviceInstance) {
      serviceInstance = new AgoraService();
    }
    serviceRef.current = serviceInstance;
  }

  return serviceRef.current;
}

/**
 * Get the service instance directly (for use outside React components)
 */
export function getAgoraService(): AgoraService {
  if (!serviceInstance) {
    serviceInstance = new AgoraService();
  }
  return serviceInstance;
}


