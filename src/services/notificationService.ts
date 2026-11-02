import { InAppNotification } from '../types/chat';

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private listeners: ((notifications: InAppNotification[]) => void)[] = [];
  private notifications: InAppNotification[] = [];

  constructor() {
    // Load persisted preferences
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('tujuane_in_app_notifications');
        if (stored) {
          this.notifications = JSON.parse(stored).slice(0, 30);
        }
      } catch (e) {
        console.warn('Could not read stored notifications:', e);
      }
    }
  }

  /**
   * Request browser Web Push notification permission
   */
  public async requestDesktopPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
      return 'denied';
    }
  }

  /**
   * Check if desktop push notifications are currently granted
   */
  public getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Play an elegant, modern two-tone notification chime using Web Audio API
   */
  public playChime() {
    if (typeof window === 'undefined') return;

    // Check mute preference
    const isMuted = localStorage.getItem('tujuane_sound_muted') === 'true';
    if (isMuted) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Note 1: 587.33 Hz (D5)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2: 880 Hz (A5) for bright harmony
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.1);
      gain2.gain.setValueAtTime(0, now + 0.1);
      gain2.gain.linearRampToValueAtTime(0.22, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.46);
    } catch (e) {
      // Non-critical audio warning
      console.warn('Could not play chime:', e);
    }
  }

  /**
   * Post notification (both desktop push and in-app banner)
   */
  public notify(params: {
    title: string;
    body: string;
    type: 'direct_chat' | 'channel' | 'group' | 'mention';
    sourceId: string;
    sourceName: string;
    onClick?: () => void;
  }) {
    // 1. Play audio chime
    this.playChime();

    // 2. Show browser native push notification if permitted
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const options: NotificationOptions = {
          body: params.body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `tujuane_${params.sourceId}`
        };
        const notif = new Notification(params.title, options);

        if (params.onClick) {
          notif.onclick = () => {
            window.focus();
            params.onClick?.();
            notif.close();
          };
        }
      } catch (err) {
        console.warn('Native notification failed:', err);
      }
    }

    // 3. Add to in-app notification center
    const newNotif: InAppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: params.title,
      body: params.body,
      timestamp: new Date().toISOString(),
      type: params.type,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      read: false
    };

    this.notifications = [newNotif, ...this.notifications.slice(0, 25)];
    this.persist();
    this.notifyListeners();
  }

  public getNotifications(): InAppNotification[] {
    return this.notifications;
  }

  public markAllAsRead() {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.persist();
    this.notifyListeners();
  }

  public clearAll() {
    this.notifications = [];
    this.persist();
    this.notifyListeners();
  }

  public subscribe(listener: (notifications: InAppNotification[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.notifications);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l(this.notifications));
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        'tujuane_in_app_notifications',
        JSON.stringify(this.notifications)
      );
    } catch {
      // Ignore storage errors
    }
  }
}

export const notificationService = new NotificationService();
