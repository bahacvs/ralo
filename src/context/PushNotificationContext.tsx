import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.js';
import { api } from '../services/api.js';
import type { Notification as AppNotification } from '../types/index.js';

export interface ActivePushAlert {
  id: string;
  title: string;
  message: string;
  matchId?: string;
  courtId?: string;
  courtName?: string;
  businessName?: string;
  matchTime?: string;
  matchDate?: string;
  timestamp: string;
  type: string;
}

interface PushNotificationContextType {
  pushPermission: 'default' | 'granted' | 'denied';
  requestPushPermission: () => Promise<boolean>;
  pushEnabled: boolean;
  setPushEnabled: (val: boolean) => Promise<void>;
  reminder2HoursEnabled: boolean;
  setReminder2HoursEnabled: (val: boolean) => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => Promise<void>;
  activeAlert: ActivePushAlert | null;
  dismissAlert: () => void;
  simulate2HourAlert: (matchId?: string) => Promise<void>;
  isSimulating: boolean;
  lastReminderSent: string | null;
}

const PushNotificationContext = createContext<PushNotificationContextType | undefined>(undefined);

// Web Audio API Push Notification Chime Synthesizer
function playChimeSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Harmonic bell tone 1 (D5 ~587Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonic bell tone 2 (A5 ~880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.16, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.55);

    // Subtle third shimmer (F#6 ~1480Hz)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1479.98, now + 0.18);
    gain3.gain.setValueAtTime(0.06, now + 0.18);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.18);
    osc3.stop(now + 0.6);
  } catch (e) {
    // Audio contexts may be blocked by autoplay policies
    console.debug('Push alert audio chime info:', e);
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

/**
 * Registers this device for web push with the server (needs notification permission, a service worker and
 * VAPID keys on the server). Returns false when any of these is missing; in-app notifications keep working.
 */
async function subscribeDeviceToPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const { publicKey } = await api.getPushPublicKey();
    if (!publicKey) return false;
    // In development there is no service worker; do not wait forever for it
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
    ]);
    if (!registration) return false;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      });
    }
    await api.savePushSubscription(subscription.toJSON());
    return true;
  } catch (err) {
    console.debug('Push subscription failed:', err);
    return false;
  }
}

export const PushNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateUser } = useAuth();

  const [pushPermission, setPushPermission] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission as 'default' | 'granted' | 'denied';
    }
    return 'default';
  });

  const [pushEnabled, setPushEnabledState] = useState<boolean>(() => {
    if (user && user.pushNotificationsEnabled !== undefined) return user.pushNotificationsEnabled;
    const local = localStorage.getItem('arenamate_push_enabled');
    return local !== null ? local === 'true' : true;
  });

  const [reminder2HoursEnabled, setReminder2HoursEnabledState] = useState<boolean>(() => {
    if (user && user.reminder2HoursBefore !== undefined) return user.reminder2HoursBefore;
    const local = localStorage.getItem('arenamate_reminder_2h_enabled');
    return local !== null ? local === 'true' : true;
  });

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    if (user && user.notificationSoundEnabled !== undefined) return user.notificationSoundEnabled;
    const local = localStorage.getItem('arenamate_notif_sound_enabled');
    return local !== null ? local === 'true' : true;
  });

  const [activeAlert, setActiveAlert] = useState<ActivePushAlert | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastReminderSent, setLastReminderSent] = useState<string | null>(null);

  // Synchronize state with user object
  useEffect(() => {
    if (user) {
      if (user.pushNotificationsEnabled !== undefined) setPushEnabledState(user.pushNotificationsEnabled);
      if (user.reminder2HoursBefore !== undefined) setReminder2HoursEnabledState(user.reminder2HoursBefore);
      if (user.notificationSoundEnabled !== undefined) setSoundEnabledState(user.notificationSoundEnabled);
    }
  }, [user]);

  const requestPushPermission = async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushPermission(perm as 'default' | 'granted' | 'denied');
        if (perm === 'granted') {
          await setPushEnabled(true);
          if (user) await subscribeDeviceToPush();
          return true;
        }
      } catch (err) {
        console.warn('Notification permission error:', err);
      }
    }
    // If not supported or denied in browser, in-app simulated push remains active!
    return false;
  };

  const setPushEnabled = async (val: boolean) => {
    setPushEnabledState(val);
    localStorage.setItem('arenamate_push_enabled', String(val));
    try {
      const res = await api.updateNotificationSettings({ pushNotificationsEnabled: val });
      if (res?.user) updateUser(res.user);
    } catch (e) {
      console.warn('Failed to update push settings on server:', e);
    }
  };

  const setReminder2HoursEnabled = async (val: boolean) => {
    setReminder2HoursEnabledState(val);
    localStorage.setItem('arenamate_reminder_2h_enabled', String(val));
    try {
      const res = await api.updateNotificationSettings({ reminder2HoursBefore: val });
      if (res?.user) updateUser(res.user);
    } catch (e) {
      console.warn('Failed to update reminder settings on server:', e);
    }
  };

  const setSoundEnabled = async (val: boolean) => {
    setSoundEnabledState(val);
    localStorage.setItem('arenamate_notif_sound_enabled', String(val));
    try {
      const res = await api.updateNotificationSettings({ notificationSoundEnabled: val });
      if (res?.user) updateUser(res.user);
    } catch (e) {
      console.warn('Failed to update sound settings on server:', e);
    }
  };

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
  }, []);

  // Display push notification alert both in-app and via browser Notification API
  const triggerPushAlert = useCallback((alertData: ActivePushAlert) => {
    if (!pushEnabled || !reminder2HoursEnabled) return;

    setActiveAlert(alertData);
    setLastReminderSent(alertData.timestamp);

    // Audio chime
    if (soundEnabled) {
      playChimeSound();
    }

    // Vibration on mobile devices
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (e) {}
    }

    // Native Browser Notification (if granted)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const nativeNotif = new Notification(alertData.title, {
          body: alertData.message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `arenamate_reminder_${alertData.id}`
        });

        nativeNotif.onclick = () => {
          window.focus();
          if (alertData.matchId) {
            window.location.hash = `#/acik-mac/${alertData.matchId}`;
          }
          nativeNotif.close();
        };
      } catch (err) {
        console.debug('Browser native notification dispatch error:', err);
      }
    }
  }, [pushEnabled, reminder2HoursEnabled, soundEnabled]);

  // Signed in with permission already granted: make sure this device's subscription belongs to this account
  useEffect(() => {
    if (user?.id && pushPermission === 'granted') subscribeDeviceToPush();
  }, [user?.id, pushPermission]);

  // Pushes arriving while the app is visible are shown in-app (the service worker forwards them)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'ralo-push') return;
      const payload = event.data.payload ?? {};
      setActiveAlert({
        id: `push_${Date.now()}`,
        title: payload.title || 'RALO',
        message: payload.body || '',
        timestamp: new Date().toISOString(),
        type: 'PUSH'
      });
      if (soundEnabled) playChimeSound();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [soundEnabled]);

  // Periodic automatic check for upcoming matches within 2 hours
  useEffect(() => {
    if (!user || !pushEnabled || !reminder2HoursEnabled) return;

    const checkInterval = async () => {
      try {
        const res = await api.checkUpcomingReminders();
        if (res?.sent && res.notification && res.match) {
          triggerPushAlert({
            id: res.notification.id,
            title: res.notification.title,
            message: res.notification.message,
            matchId: res.match.id,
            courtId: res.match.court?.id,
            courtName: res.match.court?.name || 'Padel Kortu',
            businessName: res.match.business?.name || 'Padel Kulübü',
            matchTime: res.match.matchTime || '18:00',
            matchDate: res.match.matchDate || 'Bugün',
            timestamp: new Date().toISOString(),
            type: 'MATCH_REMINDER_2H'
          });
        }
      } catch (err) {
        console.debug('Automatic reminder check failed:', err);
      }
    };

    // Run initial check and then periodic check every 30 seconds
    checkInterval();
    const interval = setInterval(checkInterval, 30000);
    return () => clearInterval(interval);
  }, [user, pushEnabled, reminder2HoursEnabled, triggerPushAlert]);

  // Simulate 2-hour reminder on demand
  const simulate2HourAlert = async (matchId?: string) => {
    setIsSimulating(true);
    try {
      const res = await api.simulate2HourMatchReminder(matchId);
      if (res?.success && res.notification && res.match) {
        triggerPushAlert({
          id: res.notification.id,
          title: res.notification.title,
          message: res.notification.message,
          matchId: res.match.id,
          courtId: res.match.court?.id,
          courtName: res.match.court?.name || 'Merkez Kort (Panoramik)',
          businessName: res.match.business?.name || 'Padel Arena Urla',
          matchTime: res.match.matchTime || '18:00',
          matchDate: res.match.matchDate || 'Bugün',
          timestamp: new Date().toISOString(),
          type: 'MATCH_REMINDER_2H'
        });
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      // Fallback local simulation if server call errors
      triggerPushAlert({
        id: `sim_${Date.now()}`,
        title: '⏰ Maçınıza 2 Saat Kaldı!',
        message: 'Bugün saat 18:00\'de "Merkez Kort (Panoramik)" (Padel Arena Urla) maçınız 2 saat sonra başlıyor. Hazırlıklarınızı yapmayı unutmayın!',
        courtName: 'Merkez Kort (Panoramik)',
        businessName: 'Padel Arena Urla',
        matchTime: '18:00',
        matchDate: 'Bugün',
        timestamp: new Date().toISOString(),
        type: 'MATCH_REMINDER_2H'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <PushNotificationContext.Provider
      value={{
        pushPermission,
        requestPushPermission,
        pushEnabled,
        setPushEnabled,
        reminder2HoursEnabled,
        setReminder2HoursEnabled,
        soundEnabled,
        setSoundEnabled,
        activeAlert,
        dismissAlert,
        simulate2HourAlert,
        isSimulating,
        lastReminderSent
      }}
    >
      {children}
    </PushNotificationContext.Provider>
  );
};

export const usePushNotification = (): PushNotificationContextType => {
  const context = useContext(PushNotificationContext);
  if (!context) {
    throw new Error('usePushNotification must be used within a PushNotificationProvider');
  }
  return context;
};
