import { useEffect, useCallback } from 'react';
import api from '../services/api.ts';

// Converts a base64 VAPID public key to the Uint8Array format the browser expects
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  const output   = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output.buffer as ArrayBuffer;
}

const STORAGE_KEY = 'plivio_push_asked';

export function usePushNotifications(userId: string | undefined) {
  const requestPermission = useCallback(async () => {
    if (!userId) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (localStorage.getItem(STORAGE_KEY) === '1') return; // already asked

    try {
      // Fetch VAPID public key
      const { data } = await api.get<{ public_key: string }>('/push/key');
      if (!data.public_key) return; // push not configured on server

      const permission = await Notification.requestPermission();
      localStorage.setItem(STORAGE_KEY, '1');

      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });

      const { endpoint, keys } = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      await api.post('/push/subscribe', { endpoint, keys });
    } catch {
      // Push setup is best-effort — silently ignore errors
    }
  }, [userId]);

  // Register service worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => undefined); // silently ignore registration errors
  }, []);

  // Request permission a few seconds after login (non-intrusive)
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => { void requestPermission(); }, 4000);
    return () => clearTimeout(timer);
  }, [userId, requestPermission]);
}
