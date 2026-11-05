import { InAppNotification } from '../types/chat';
import { NotificationPreferences, NotificationType } from '../types/notification';

const STORAGE_KEY_NOTIFS = 'tujuane_in_app_notifications';
const STORAGE_KEY_PREFS = 'tujuane_notification_preferences';
const STORAGE_KEY_MUTED = 'tujuane_sound_muted';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  soundEnabled: true,
  inAppBannerEnabled: true,
  typePreferences: {
    post_like: true,
    post_comment: true,
    direct_message: true,
    friend_request: true,
    friend_request_accepted: true,
    new_follower: true,
    account_status: true,
    post_advisory: true
  }
};

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private listeners: ((notifications: InAppNotification[]) => void)[] = [];
  private notifications: InAppNotification[] = [];
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_NOTIFS);
        if (stored) {
          this.notifications = JSON.parse(stored).slice(0, 30);
        }
      } catch (e) {
        console.warn('Could not read stored notifications:', e);
      }

      try {
        const storedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
        if (storedPrefs) {
          const parsed = JSON.parse(storedPrefs);
          this.preferences = {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            typePreferences: {
              ...DEFAULT_PREFERENCES.typePreferences,
              ...(parsed.typePreferences || {})
            }
          };
        } else {
          // Check sound mute legacy key
          const legacyMute = localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
          this.preferences.soundEnabled = !legacyMute;
        }
      } catch (e) {
        console.warn('Could not read notification preferences:', e);
      }
    }
  }

  /**
   * Get user notification preferences
   */
  public getNotificationPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Update notification preferences
   */
  public saveNotificationPreferences(newPrefs: Partial<NotificationPreferences>): NotificationPreferences {
    this.preferences = {
      ...this.preferences,
      ...newPrefs,
      typePreferences: {
        ...this.preferences.typePreferences,
        ...(newPrefs.typePreferences || {})
      }
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(this.preferences));
        localStorage.setItem(STORAGE_KEY_MUTED, String(!this.preferences.soundEnabled));
      } catch (e) {
        console.warn('Could not save notification preferences:', e);
      }
    }

    return this.preferences;
  }

  /**
   * Toggle audio chime sound on/off
   */
  public toggleSound(enabled?: boolean): boolean {
    const nextState = enabled !== undefined ? enabled : !this.preferences.soundEnabled;
    this.saveNotificationPreferences({ soundEnabled: nextState });
    if (nextState) {
      this.playChime();
    }
    return nextState;
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
      if (permission === 'granted') {
        this.saveNotificationPreferences({ pushEnabled: true });
        // Send a celebratory welcome push
        this.sendNativePush({
          title: '🟢 TUJUANE Push Notifications Enabled',
          body: 'You will now receive instant real-time alerts for discussions, mentions, direct chats, and county updates.',
          tag: 'tujuane_push_welcome'
        });
      }
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
   * Play an elegant, melodic two-tone chime using Web Audio API
   */
  public playChime() {
    if (typeof window === 'undefined') return;
    if (!this.preferences.soundEnabled) return;

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

      // Note 2: 880 Hz (A5) bright harmony
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.09);
      gain2.gain.setValueAtTime(0, now + 0.09);
      gain2.gain.linearRampToValueAtTime(0.22, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.46);
    } catch (e) {
      console.warn('Could not play chime:', e);
    }
  }

  /**
   * Trigger native browser push notification directly into the device notification bar.
   * Leverages ServiceWorker showNotification so alerts are received even when the user
   * has minimized the browser or navigated away from the app.
   */
  public sendNativePush(options: {
    title: string;
    body: string;
    tag?: string;
    icon?: string;
    badge?: string;
    onClick?: () => void;
  }): boolean {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    ) {
      return false;
    }

    const notifOptions: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body: options.body,
      icon: options.icon || '/icon.svg',
      badge: options.badge || '/icon.svg',
      tag: options.tag || `tujuane_${Date.now()}`,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: window.location.origin }
    };


    // 1. Try Service Worker showNotification first (Works on mobile & when app is backgrounded/closed)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg && reg.showNotification) {
            reg.showNotification(options.title, notifOptions);
          } else {
            this.fallbackWindowNotification(options, notifOptions);
          }
        })
        .catch(() => {
          this.fallbackWindowNotification(options, notifOptions);
        });
      return true;
    }

    // 2. Direct Notification constructor fallback
    return this.fallbackWindowNotification(options, notifOptions);
  }

  private fallbackWindowNotification(
    options: { title: string; onClick?: () => void },
    notifOptions: NotificationOptions
  ): boolean {
    try {
      const notif = new Notification(options.title, notifOptions);
      notif.onclick = () => {
        try {
          window.focus();
        } catch {}
        options.onClick?.();
        notif.close();
      };
      return true;
    } catch (err) {
      console.warn('Fallback window notification failed:', err);
      return false;
    }
  }


  /**
   * Test push notifications and audio chime
   */
  public async testPushNotification(): Promise<{
    permission: NotificationPermission;
    pushFired: boolean;
  }> {
    this.playChime();

    let perm = this.getPermissionStatus();
    if (perm === 'default') {
      perm = await this.requestDesktopPermission();
    }

    const pushFired = this.sendNativePush({
      title: '🔔 TUJUANE Real-Time Alert',
      body: 'Real-time push notifications and audio chimes are operating at full capacity across Kenya.',
      tag: 'tujuane_test_alert',
      onClick: () => {
        window.focus();
      }
    });

    // Also record in-app
    this.notify({
      title: 'Real-Time Notification Test',
      body: 'Verified: Audio chime and push alerts are configured and active.',
      type: 'channel',
      sourceId: 'test_alert',
      sourceName: 'TUJUANE System'
    });

    return { permission: perm, pushFired };
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
    notificationType?: NotificationType;
    onClick?: () => void;
  }) {
    // 1. Play audio chime if sound is enabled
    if (this.preferences.soundEnabled) {
      this.playChime();
    }

    // 2. Show browser native push notification if enabled & permitted
    if (this.preferences.pushEnabled) {
      this.sendNativePush({
        title: params.title,
        body: params.body,
        tag: `tujuane_${params.sourceId}`,
        onClick: params.onClick
      });
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
        STORAGE_KEY_NOTIFS,
        JSON.stringify(this.notifications)
      );
    } catch {
      // Ignore storage errors
    }
  }
}

export const notificationService = new NotificationService();

