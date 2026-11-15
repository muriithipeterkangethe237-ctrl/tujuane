import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { User, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  limit
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  handleFirestoreError,
  handleFirestoreListenerError,
  isFirestoreQuotaError,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  OperationType
} from '../firebase';
import { UserProfile } from '../types/chat';
import {
  blockUser as blockUserApi,
  unblockUser as unblockUserApi,
  muteUser as muteUserApi,
  unmuteUser as unmuteUserApi,
  getCachedBlockedUsers,
  getCachedMutedUsers,
  subscribeBlockedAndMuted
} from '../services/blockMuteService';
import { propagateUserProfileUpdates } from '../services/profileSyncService';
import { getProfileCompleteness, ProfileCompletenessReport } from '../utils/profileUtils';
import {
  syncAuthToServiceWorker,
  clearServiceWorkerSession,
  registerBackgroundNotificationTasks
} from '../services/backgroundNotificationSync';
import { notificationService } from '../services/notificationService';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  usersById: Record<string, UserProfile>;
  isProfileComplete: boolean;
  profileCompleteness: ProfileCompletenessReport;
  loading: boolean;
  blockedUserIds: string[];
  mutedUserIds: string[];
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
  muteUser: (targetUserId: string) => Promise<void>;
  unmuteUser: (targetUserId: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  registerWithEmailPassword: (
    email: string,
    password: string,
    displayName: string,
    county?: string,
    constituency?: string
  ) => Promise<void>;
  loginWithEmailPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (targetMode?: 'google' | 'email') => Promise<void>;
  updateUserCounty: (county: string) => Promise<void>;
  updateUserLocation: (county: string, constituency?: string) => Promise<void>;
  updateFullProfile: (updates: {
    displayName?: string;
    photoURL?: string;
    county?: string;
    constituency?: string;
    bio?: string;
    occupation?: string;
    backgroundAlertsEnabled?: boolean;
  }) => Promise<void>;
  isAuthModalOpen: boolean;
  openAuthModal: (mode?: 'signin' | 'register') => void;
  closeAuthModal: () => void;
  authModalInitialMode: 'signin' | 'register';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PERSISTENT_SESSION_KEY = 'tujuane_persistent_session';
const USER_EDITS_KEY_PREFIX = 'tujuane_user_edits_';
const USERS_DIRECTORY_CACHE_KEY = 'tujuane_users_directory_cache';

function getCachedUsersDirectory(): Record<string, UserProfile> {
  try {
    const raw = localStorage.getItem(USERS_DIRECTORY_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setCachedUsersDirectory(usersMap: Record<string, UserProfile>) {
  try {
    localStorage.setItem(USERS_DIRECTORY_CACHE_KEY, JSON.stringify(usersMap));
  } catch {
    // ignore storage limits
  }
}

function toIsoTimestamp(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return undefined;
}

function parseMillis(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function getCachedSession(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PERSISTENT_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid) {
        return parsed as UserProfile;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function setCachedSession(profile: UserProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(PERSISTENT_SESSION_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PERSISTENT_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function getCachedUserEdits(uid: string): Partial<UserProfile> | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`${USER_EDITS_KEY_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<UserProfile>;
    }
  } catch {
    // ignore
  }
  return null;
}

function setCachedUserEdits(uid: string, profile: UserProfile) {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const snapshot = {
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL ?? '',
      county: profile.county || 'Nairobi',
      constituency: profile.constituency ?? '',
      bio: profile.bio ?? '',
      occupation: profile.occupation ?? '',
      backgroundAlertsEnabled: profile.backgroundAlertsEnabled,
      profileCompleted: profile.profileCompleted,
      profileCustomized: true,
      profileUpdatedAt: profile.profileUpdatedAt || new Date().toISOString()
    };
    localStorage.setItem(`${USER_EDITS_KEY_PREFIX}${uid}`, JSON.stringify(snapshot));
  } catch {
    // ignore storage quota errors cleanly
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser || null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getCachedSession());
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>(() => getCachedUsersDirectory());
  const [loading, setLoading] = useState<boolean>(() => !auth.currentUser && !getCachedSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signin' | 'register'>('signin');

  // Guards against auth/registration races and stale cached snapshots overwriting fresh user edits
  const registeringUidRef = useRef<string | null>(null);
  const syncInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const recentLocalEditRef = useRef<{
    uid: string;
    profile: UserProfile;
    savedAtMs: number;
  } | null>(null);

  const profileCompleteness = useMemo(() => getProfileCompleteness(userProfile), [userProfile]);
  const isProfileComplete = profileCompleteness.isComplete;

  // Blocked and Muted lists
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>(() => {
    return currentUser ? getCachedBlockedUsers(currentUser.uid) : [];
  });
  const [mutedUserIds, setMutedUserIds] = useState<string[]>(() => {
    return currentUser ? getCachedMutedUsers(currentUser.uid) : [];
  });

  // Listen to blocked and muted list updates in real time
  useEffect(() => {
    if (!currentUser) {
      setBlockedUserIds([]);
      setMutedUserIds([]);
      return;
    }
    const unsub = subscribeBlockedAndMuted(currentUser.uid, ({ blockedUserIds: b, mutedUserIds: m }) => {
      setBlockedUserIds(b);
      setMutedUserIds(m);
    });
    return () => unsub();
  }, [currentUser]);

  const openAuthModal = (mode: 'signin' | 'register' = 'signin') => {
    setAuthModalInitialMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  // Build authoritative UserProfile from Firestore doc data without reverting user-edited fields
  const buildProfileFromFirestoreData = (
    uid: string,
    data: Record<string, any>,
    authUser: User,
    prev?: UserProfile | null,
    isFromCache = false
  ): UserProfile => {
    const remoteUpdatedAt = toIsoTimestamp(data.profileUpdatedAt);
    const remoteUpdatedMs = parseMillis(remoteUpdatedAt);

    const hasExplicitPhotoField = 'photoURL' in data && data.photoURL !== undefined && data.photoURL !== null;
    const rawRemotePhoto = hasExplicitPhotoField ? String(data.photoURL).trim() : '';
    const isCustomizedRemote = Boolean(
      data.profileCustomized ||
        data.profileCompleted ||
        remoteUpdatedAt ||
        hasExplicitPhotoField ||
        typeof data.bio === 'string' ||
        typeof data.occupation === 'string'
    );

    const resolvedPhotoURL = hasExplicitPhotoField
      ? rawRemotePhoto
        ? rawRemotePhoto
        : undefined
      : isCustomizedRemote || prev?.profileCustomized
      ? prev?.photoURL
      : authUser.photoURL || undefined;

    const resolvedDisplayName =
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim()
        : prev?.displayName || authUser.displayName || 'TUJUANE Community Member';

    let assembled: UserProfile = {
      uid,
      displayName: resolvedDisplayName,
      email: data.email || prev?.email || authUser.email || '',
      photoURL: resolvedPhotoURL,
      county:
        typeof data.county === 'string' && data.county.trim()
          ? data.county.trim()
          : prev?.county || 'Nairobi',
      constituency:
        'constituency' in data
          ? String(data.constituency || '').trim() || undefined
          : prev?.constituency,
      bio: 'bio' in data ? String(data.bio || '').trim() || undefined : prev?.bio,
      occupation:
        'occupation' in data ? String(data.occupation || '').trim() || undefined : prev?.occupation,
      blockedUserIds: Array.isArray(data.blockedUserIds)
        ? data.blockedUserIds
        : prev?.blockedUserIds || [],
      mutedUserIds: Array.isArray(data.mutedUserIds)
        ? data.mutedUserIds
        : prev?.mutedUserIds || [],
      isDeveloper:
        data.isDeveloper !== undefined
          ? Boolean(data.isDeveloper)
          : prev?.isDeveloper ??
            authUser.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com',
      accountStatus:
        (data.accountStatus as 'active' | 'suspended' | 'banned') || prev?.accountStatus || 'active',
      suspendedUntil: toIsoTimestamp(data.suspendedUntil) ?? prev?.suspendedUntil,
      banReason: 'banReason' in data ? data.banReason : prev?.banReason,
      statusUpdatedAt: toIsoTimestamp(data.statusUpdatedAt) ?? prev?.statusUpdatedAt,
      statusUpdatedBy: 'statusUpdatedBy' in data ? data.statusUpdatedBy : prev?.statusUpdatedBy,
      backgroundAlertsEnabled:
        data.backgroundAlertsEnabled !== undefined
          ? Boolean(data.backgroundAlertsEnabled)
          : prev?.backgroundAlertsEnabled,
      profileCompleted:
        data.profileCompleted !== undefined
          ? Boolean(data.profileCompleted)
          : prev?.profileCompleted,
      profileCustomized: isCustomizedRemote || prev?.profileCustomized || undefined,
      profileUpdatedAt: remoteUpdatedAt || prev?.profileUpdatedAt,
      pollVotesCount:
        typeof data.pollVotesCount === 'number' ? data.pollVotesCount : prev?.pollVotesCount ?? 0,
      feedCommentsCount:
        typeof data.feedCommentsCount === 'number'
          ? data.feedCommentsCount
          : prev?.feedCommentsCount ?? 0,
      isOnline: data.isOnline !== undefined ? Boolean(data.isOnline) : true,
      lastSeen: toIsoTimestamp(data.lastSeen) || new Date().toISOString(),
      createdAt: toIsoTimestamp(data.createdAt) || prev?.createdAt || new Date().toISOString()
    };

    // Never allow a stale cached snapshot or heartbeat to overwrite a newer local user edit
    const recentEdit = recentLocalEditRef.current;
    if (
      recentEdit &&
      recentEdit.uid === uid &&
      (Date.now() - recentEdit.savedAtMs < 20000 ||
        (isFromCache && parseMillis(recentEdit.profile.profileUpdatedAt) >= remoteUpdatedMs))
    ) {
      const recentMs = parseMillis(recentEdit.profile.profileUpdatedAt);
      if (remoteUpdatedMs <= recentMs) {
        assembled = {
          ...assembled,
          displayName: recentEdit.profile.displayName,
          photoURL: recentEdit.profile.photoURL,
          county: recentEdit.profile.county,
          constituency: recentEdit.profile.constituency,
          bio: recentEdit.profile.bio,
          occupation: recentEdit.profile.occupation,
          backgroundAlertsEnabled: recentEdit.profile.backgroundAlertsEnabled,
          profileCompleted: recentEdit.profile.profileCompleted,
          profileCustomized: true,
          profileUpdatedAt: recentEdit.profile.profileUpdatedAt || assembled.profileUpdatedAt
        };
      }
    }

    // Also reconcile against localStorage user-edits backup if local edit timestamp is strictly newer
    const localEdits = getCachedUserEdits(uid);
    const localEditsMs = parseMillis(localEdits?.profileUpdatedAt);
    if (localEdits && localEditsMs > 0 && localEditsMs > remoteUpdatedMs) {
      assembled = {
        ...assembled,
        displayName:
          typeof localEdits.displayName === 'string' && localEdits.displayName.trim()
            ? localEdits.displayName.trim()
            : assembled.displayName,
        photoURL:
          localEdits.photoURL !== undefined
            ? String(localEdits.photoURL).trim() || undefined
            : assembled.photoURL,
        county:
          typeof localEdits.county === 'string' && localEdits.county.trim()
            ? localEdits.county.trim()
            : assembled.county,
        constituency:
          localEdits.constituency !== undefined
            ? String(localEdits.constituency).trim() || undefined
            : assembled.constituency,
        bio:
          localEdits.bio !== undefined
            ? String(localEdits.bio).trim() || undefined
            : assembled.bio,
        occupation:
          localEdits.occupation !== undefined
            ? String(localEdits.occupation).trim() || undefined
            : assembled.occupation,
        backgroundAlertsEnabled:
          localEdits.backgroundAlertsEnabled !== undefined
            ? localEdits.backgroundAlertsEnabled
            : assembled.backgroundAlertsEnabled,
        profileCompleted:
          localEdits.profileCompleted !== undefined
            ? localEdits.profileCompleted
            : assembled.profileCompleted,
        profileCustomized: true,
        profileUpdatedAt: localEdits.profileUpdatedAt
      };
    }

    return assembled;
  };

  // Sync user profile in Firestore and update persistent local cache (serialized per UID to stop races)
  const syncUserProfile = async (user: User, retries = 2): Promise<void> => {
    const existingPromise = syncInFlightRef.current.get(user.uid);
    if (existingPromise) {
      return existingPromise;
    }

    const runSync = async (remainingRetries: number): Promise<void> => {
      if (registeringUidRef.current === user.uid) {
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userDocRef);
        if (registeringUidRef.current === user.uid) {
          return;
        }

        if (snap.exists()) {
          const data = snap.data();
          const currentSession = getCachedSession();
          const basePrev =
            currentSession && currentSession.uid === user.uid ? currentSession : null;
          const profile = buildProfileFromFirestoreData(
            user.uid,
            data,
            user,
            basePrev,
            snap.metadata.fromCache
          );

          // If local edits were strictly newer than Firestore server doc (e.g. closed offline after save), push them now
          const localEdits = getCachedUserEdits(user.uid);
          if (
            localEdits &&
            parseMillis(localEdits.profileUpdatedAt) > parseMillis(toIsoTimestamp(data.profileUpdatedAt))
          ) {
            void setDoc(
              userDocRef,
              {
                uid: user.uid,
                email: profile.email || user.email || '',
                displayName: profile.displayName,
                photoURL: profile.photoURL || '',
                county: profile.county || 'Nairobi',
                constituency: profile.constituency || '',
                bio: profile.bio || '',
                occupation: profile.occupation || '',
                profileCompleted: Boolean(profile.profileCompleted),
                profileCustomized: true,
                profileUpdatedAt: profile.profileUpdatedAt || new Date().toISOString()
              },
              { merge: true }
            ).catch(() => {});
          }

          setUserProfile(profile);
          setCachedSession(profile);
          setUsersById((prev) => ({ ...prev, [user.uid]: profile }));
          if (profile.blockedUserIds) setBlockedUserIds(profile.blockedUserIds);
          if (profile.mutedUserIds) setMutedUserIds(profile.mutedUserIds);

          // Update presence non-blockingly without touching profile fields
          updateDoc(userDocRef, {
            isOnline: true,
            lastSeen: serverTimestamp()
          }).catch((err) => {
            console.warn('Presence status update deferred:', err?.message || err);
          });
        } else {
          // Check if we already have cached edits/session for this UID before creating defaults
          const cached = getCachedSession();
          const localEdits = getCachedUserEdits(user.uid);
          const hasLocalProfile = (cached && cached.uid === user.uid) || !!localEdits;

          const newProfile: UserProfile = {
            uid: user.uid,
            displayName:
              (typeof localEdits?.displayName === 'string' && localEdits.displayName.trim()) ||
              (cached?.uid === user.uid ? cached.displayName : '') ||
              user.displayName ||
              'TUJUANE Community Member',
            email: (cached?.uid === user.uid ? cached.email : '') || user.email || '',
            photoURL: hasLocalProfile
              ? (localEdits?.photoURL !== undefined
                  ? String(localEdits.photoURL).trim() || undefined
                  : cached?.uid === user.uid
                  ? cached.photoURL
                  : undefined)
              : user.photoURL || undefined,
            county:
              (typeof localEdits?.county === 'string' && localEdits.county.trim()) ||
              (cached?.uid === user.uid ? cached.county : '') ||
              'Nairobi',
            constituency:
              localEdits?.constituency !== undefined
                ? String(localEdits.constituency).trim() || undefined
                : cached?.uid === user.uid
                ? cached.constituency
                : undefined,
            bio:
              localEdits?.bio !== undefined
                ? String(localEdits.bio).trim() || undefined
                : cached?.uid === user.uid
                ? cached.bio
                : undefined,
            occupation:
              localEdits?.occupation !== undefined
                ? String(localEdits.occupation).trim() || undefined
                : cached?.uid === user.uid
                ? cached.occupation
                : undefined,
            blockedUserIds: [],
            mutedUserIds: [],
            isOnline: true,
            profileCustomized: Boolean(localEdits?.profileCustomized || cached?.profileCustomized),
            profileUpdatedAt: localEdits?.profileUpdatedAt || cached?.profileUpdatedAt,
            lastSeen: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };

          await setDoc(
            userDocRef,
            {
              uid: user.uid,
              displayName: newProfile.displayName,
              email: newProfile.email,
              photoURL: newProfile.photoURL || '',
              county: newProfile.county,
              constituency: newProfile.constituency || '',
              bio: newProfile.bio || '',
              occupation: newProfile.occupation || '',
              profileCustomized: Boolean(newProfile.profileCustomized),
              ...(newProfile.profileUpdatedAt
                ? { profileUpdatedAt: newProfile.profileUpdatedAt }
                : {}),
              blockedUserIds: [],
              mutedUserIds: [],
              isOnline: true,
              lastSeen: serverTimestamp(),
              createdAt: serverTimestamp()
            },
            { merge: true }
          );
          setUserProfile(newProfile);
          setCachedSession(newProfile);
          setUsersById((prev) => ({ ...prev, [user.uid]: newProfile }));
        }
      } catch (err: any) {
        if (isFirestoreQuotaError(err)) {
          markFirestoreQuotaExceeded();
        } else if (remainingRetries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return runSync(remainingRetries - 1);
        }
        console.warn('Operating in offline/cached mode for user profile:', err?.message || err);
        const cached = getCachedSession();
        const localEdits = getCachedUserEdits(user.uid);
        if (cached && cached.uid === user.uid) {
          setUserProfile(cached);
          return;
        }
        const fallbackProfile: UserProfile = {
          uid: user.uid,
          displayName:
            (typeof localEdits?.displayName === 'string' && localEdits.displayName.trim()) ||
            user.displayName ||
            'TUJUANE Member',
          email: user.email || '',
          photoURL: localEdits
            ? String(localEdits.photoURL || '').trim() || undefined
            : user.photoURL || undefined,
          county:
            (typeof localEdits?.county === 'string' && localEdits.county.trim()) || 'Nairobi',
          constituency: String(localEdits?.constituency || '').trim() || undefined,
          bio: String(localEdits?.bio || '').trim() || undefined,
          occupation: String(localEdits?.occupation || '').trim() || undefined,
          profileCustomized: Boolean(localEdits?.profileCustomized),
          profileUpdatedAt: localEdits?.profileUpdatedAt,
          blockedUserIds: [],
          mutedUserIds: [],
          isOnline: true,
          createdAt: new Date().toISOString()
        };
        setUserProfile(fallbackProfile);
        setCachedSession(fallbackProfile);
      }
    };

    const promise = runSync(retries).finally(() => {
      syncInFlightRef.current.delete(user.uid);
    });
    syncInFlightRef.current.set(user.uid, promise);
    return promise;
  };

  useEffect(() => {
    // Listen to Firebase persistent auth state across browser sessions
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          await syncUserProfile(user);
        } catch (syncErr) {
          console.warn('Profile background sync notice:', syncErr);
        }
      } else {
        // Only clear state if Firebase confirms no active session
        recentLocalEditRef.current = null;
        setCurrentUser(null);
        setUserProfile(null);
        setCachedSession(null);
        setUsersById({});
        void clearServiceWorkerSession();
      }
      setLoading(false);
    });

    // Keep Service Worker background notification session tokens fresh
    const unsubToken = onIdTokenChanged(auth, (user) => {
      if (user) {
        void syncAuthToServiceWorker(user, notificationService.getNotificationPreferences());
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          void registerBackgroundNotificationTasks();
        }
      } else {
        void clearServiceWorkerSession();
      }
    });

    return () => {
      unsubscribe();
      unsubToken();
    };
  }, []);

  // Real-time live user directory map so profile edits propagate instantaneously everywhere in the UI
  useEffect(() => {
    if (!currentUser) {
      setUsersById({});
      return;
    }

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), limit(100)),
      (snapshot) => {
        const nextMap: Record<string, UserProfile> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          let entry: UserProfile = {
            uid: docSnap.id,
            displayName: data.displayName || 'Citizen Member',
            email: data.email || '',
            photoURL: data.photoURL && String(data.photoURL).trim() ? data.photoURL : undefined,
            county: data.county || 'Nairobi',
            constituency: data.constituency && String(data.constituency).trim() ? data.constituency : undefined,
            bio: data.bio && String(data.bio).trim() ? data.bio : undefined,
            occupation: data.occupation && String(data.occupation).trim() ? data.occupation : undefined,
            isOnline: Boolean(data.isOnline),
            lastSeen: toIsoTimestamp(data.lastSeen),
            isDeveloper: Boolean(data.isDeveloper),
            accountStatus: (data.accountStatus as 'active' | 'suspended' | 'banned') || 'active',
            backgroundAlertsEnabled: data.backgroundAlertsEnabled !== undefined ? Boolean(data.backgroundAlertsEnabled) : undefined,
            profileCompleted: data.profileCompleted !== undefined ? Boolean(data.profileCompleted) : undefined,
            profileCustomized: data.profileCustomized !== undefined ? Boolean(data.profileCustomized) : undefined,
            profileUpdatedAt: toIsoTimestamp(data.profileUpdatedAt),
            pollVotesCount: typeof data.pollVotesCount === 'number' ? data.pollVotesCount : 0,
            feedCommentsCount: typeof data.feedCommentsCount === 'number' ? data.feedCommentsCount : 0,
            createdAt: toIsoTimestamp(data.createdAt) || ''
          };

          // Prevent stale cache or in-flight presence heartbeat from reverting own user's recent edits in the directory
          const recentEdit = recentLocalEditRef.current;
          if (
            docSnap.id === currentUser.uid &&
            recentEdit &&
            recentEdit.uid === currentUser.uid &&
            Date.now() - recentEdit.savedAtMs < 20000 &&
            parseMillis(entry.profileUpdatedAt) <= parseMillis(recentEdit.profile.profileUpdatedAt)
          ) {
            entry = {
              ...entry,
              displayName: recentEdit.profile.displayName,
              photoURL: recentEdit.profile.photoURL,
              county: recentEdit.profile.county,
              constituency: recentEdit.profile.constituency,
              bio: recentEdit.profile.bio,
              occupation: recentEdit.profile.occupation,
              profileCompleted: recentEdit.profile.profileCompleted,
              profileCustomized: true,
              profileUpdatedAt: recentEdit.profile.profileUpdatedAt
            };
          }

          nextMap[docSnap.id] = entry;
        });
        setUsersById(nextMap);
        setCachedUsersDirectory(nextMap);
      },
      (err) => {
        handleFirestoreListenerError(err, OperationType.LIST, 'users');
      }
    );

    return () => unsubUsers();
  }, [currentUser]);

  // Real-time snapshot subscription to own user document in Firestore to keep edits synced and intact
  useEffect(() => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setUserProfile((prev) => {
          const updated = buildProfileFromFirestoreData(
            currentUser.uid,
            data,
            currentUser,
            prev,
            snap.metadata.fromCache
          );
          setCachedSession(updated);
          return updated;
        });
      },
      (err) => {
        handleFirestoreListenerError(err, OperationType.GET, `users/${currentUser.uid}`);
      }
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time presence heartbeat & visibility tracker for active member status
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const userDocRef = doc(db, 'users', uid);

    const markActive = () => {
      if (isFirestoreQuotaExceeded()) return;
      updateDoc(userDocRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      }).catch(() => {});
    };

    const markOffline = () => {
      if (isFirestoreQuotaExceeded()) return;
      updateDoc(userDocRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      }).catch(() => {});
    };

    // Mark active on mount
    markActive();

    // Heartbeat every 120 seconds while document is visible (keeps reads/writes minimal across clients)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        markActive();
      }
    }, 120000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActive();
      } else if (!isFirestoreQuotaExceeded()) {
        updateDoc(userDocRef, {
          lastSeen: serverTimestamp()
        }).catch(() => {});
      }
    };

    const handlePageHide = () => {
      markOffline();
    };

    const handleNetworkOnline = () => {
      if (document.visibilityState === 'visible') {
        markActive();
      }
    };

    const handleNetworkOffline = () => {
      markOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleNetworkOnline);
    window.addEventListener('offline', handleNetworkOffline);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleNetworkOnline);
      window.removeEventListener('offline', handleNetworkOffline);
    };
  }, [currentUser]);

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (error: any) {
      // Don't throw if user simply closed the popup
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Google sign-in error:', error);
        throw error;
      }
    }
  };

  const logout = async () => {
    try {
      recentLocalEditRef.current = null;
      setCachedSession(null);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          await updateDoc(userDocRef, {
            isOnline: false,
            lastSeen: serverTimestamp()
          });
        } catch {
          // ignore
        }
      }
      await signOut(auth);
      await clearServiceWorkerSession();
      setCurrentUser(null);
      setUserProfile(null);
      setUsersById({});
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const switchAccount = async (targetMode: 'google' | 'email' = 'google') => {
    await logout();
    if (targetMode === 'google') {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await loginWithGoogle();
    } else {
      openAuthModal('signin');
    }
  };

  const updateUserCounty = async (county: string) => {
    return updateUserLocation(county);
  };

  const updateUserLocation = async (county: string, constituency?: string) => {
    if (!currentUser) return;
    const baseProfile = userProfile || getCachedSession();
    if (!baseProfile) return;

    const userDocRef = doc(db, 'users', currentUser.uid);
    const updatedAtIso = new Date().toISOString();
    const safeConstituency = constituency ? constituency.trim() : '';

    try {
      const updated: UserProfile = {
        ...baseProfile,
        county,
        constituency: safeConstituency || undefined,
        profileCustomized: true,
        profileUpdatedAt: updatedAtIso
      };
      const completeness = getProfileCompleteness(updated);
      updated.profileCompleted = completeness.isComplete;

      recentLocalEditRef.current = {
        uid: currentUser.uid,
        profile: updated,
        savedAtMs: Date.now()
      };
      setCachedUserEdits(currentUser.uid, updated);

      const payload: any = {
        uid: currentUser.uid,
        displayName: updated.displayName || currentUser.displayName || 'Citizen Member',
        email: updated.email || currentUser.email || '',
        county,
        constituency: safeConstituency,
        profileCompleted: completeness.isComplete,
        profileCustomized: true,
        profileUpdatedAt: updatedAtIso
      };

      await setDoc(userDocRef, payload, { merge: true });
      setUserProfile(updated);
      setCachedSession(updated);
      setUsersById((prev) => ({ ...prev, [currentUser.uid]: updated }));
      void propagateUserProfileUpdates(currentUser.uid, updated);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const updateFullProfile = async (updates: {
    displayName?: string;
    photoURL?: string;
    county?: string;
    constituency?: string;
    bio?: string;
    occupation?: string;
    backgroundAlertsEnabled?: boolean;
  }) => {
    if (!currentUser) return;

    if (updates.photoURL !== undefined && updates.photoURL.length > 590000) {
      throw new Error('Selected profile picture is too large even after compression. Please pick a smaller image.');
    }

    const userDocRef = doc(db, 'users', currentUser.uid);
    const updatedAtIso = new Date().toISOString();
    const isIdentityEdit =
      updates.displayName !== undefined ||
      updates.photoURL !== undefined ||
      updates.county !== undefined ||
      updates.constituency !== undefined ||
      updates.bio !== undefined ||
      updates.occupation !== undefined;

    try {
      const baseSource =
        userProfile ||
        (getCachedSession()?.uid === currentUser.uid ? getCachedSession() : null);

      const baseProfile: UserProfile = baseSource || {
        uid: currentUser.uid,
        displayName:
          (updates.displayName !== undefined ? updates.displayName.trim() : '') ||
          currentUser.displayName ||
          'TUJUANE Member',
        email: currentUser.email || '',
        photoURL: updates.photoURL ? updates.photoURL : undefined,
        county: updates.county || 'Nairobi',
        constituency: undefined,
        bio: undefined,
        occupation: undefined,
        createdAt: new Date().toISOString()
      };

      const resolvedDisplayName =
        updates.displayName !== undefined && updates.displayName.trim()
          ? updates.displayName.trim()
          : baseProfile.displayName || currentUser.displayName || 'Citizen Member';

      const payload: any = {
        uid: currentUser.uid,
        displayName: resolvedDisplayName,
        email: currentUser.email || baseProfile.email || '',
        county:
          updates.county !== undefined
            ? updates.county.trim() || 'Nairobi'
            : baseProfile.county || 'Nairobi',
        lastSeen: serverTimestamp()
      };

      if (updates.photoURL !== undefined) {
        payload.photoURL = updates.photoURL.trim();
      }
      if (updates.constituency !== undefined) {
        payload.constituency = updates.constituency.trim();
      }
      if (updates.bio !== undefined) {
        payload.bio = updates.bio.trim();
      }
      if (updates.occupation !== undefined) {
        payload.occupation = updates.occupation.trim();
      }
      if (updates.backgroundAlertsEnabled !== undefined) {
        payload.backgroundAlertsEnabled = Boolean(updates.backgroundAlertsEnabled);
      }

      const updated: UserProfile = {
        ...baseProfile,
        displayName: resolvedDisplayName,
        photoURL:
          updates.photoURL !== undefined
            ? updates.photoURL.trim()
              ? updates.photoURL.trim()
              : undefined
            : baseProfile.photoURL,
        county: payload.county,
        constituency:
          updates.constituency !== undefined
            ? updates.constituency.trim() || undefined
            : baseProfile.constituency,
        bio: updates.bio !== undefined ? updates.bio.trim() || undefined : baseProfile.bio,
        occupation:
          updates.occupation !== undefined
            ? updates.occupation.trim() || undefined
            : baseProfile.occupation,
        backgroundAlertsEnabled:
          payload.backgroundAlertsEnabled !== undefined
            ? payload.backgroundAlertsEnabled
            : baseProfile.backgroundAlertsEnabled,
        profileCustomized: isIdentityEdit ? true : baseProfile.profileCustomized,
        profileUpdatedAt: isIdentityEdit ? updatedAtIso : baseProfile.profileUpdatedAt
      };

      const completeness = getProfileCompleteness(updated);
      payload.profileCompleted = completeness.isComplete;
      updated.profileCompleted = completeness.isComplete;
      if (updated.profileCustomized) {
        payload.profileCustomized = true;
      }
      if (updated.profileUpdatedAt) {
        payload.profileUpdatedAt = updated.profileUpdatedAt;
      }

      // Record recent local edit before write so any snapshot arriving mid-write cannot revert state
      recentLocalEditRef.current = {
        uid: currentUser.uid,
        profile: updated,
        savedAtMs: Date.now()
      };
      setCachedUserEdits(currentUser.uid, updated);

      // Persist to Firestore users/{uid}
      await setDoc(userDocRef, payload, { merge: true });

      // Update React states & persistent cache immediately
      setUserProfile(updated);
      setCachedSession(updated);
      setUsersById((prev) => ({ ...prev, [currentUser.uid]: updated }));

      // Sync Firebase Auth profile (displayName + cleared or short HTTP photoURL)
      const authUpdates: { displayName?: string; photoURL?: string } = {};
      if (payload.displayName && currentUser.displayName !== payload.displayName) {
        authUpdates.displayName = payload.displayName;
      }
      if (
        updates.photoURL !== undefined &&
        (updates.photoURL.trim() === '' ||
          (updates.photoURL.startsWith('http') && updates.photoURL.length < 1500))
      ) {
        authUpdates.photoURL = updates.photoURL.trim();
      }
      if (Object.keys(authUpdates).length > 0) {
        try {
          await updateProfile(currentUser, authUpdates);
        } catch (authErr) {
          console.warn('Firebase Auth profile sync notice (non-fatal):', authErr);
        }
      }

      // Actively propagate updated details across posts, stories, direct chats, and groups
      await propagateUserProfileUpdates(currentUser.uid, updated);
    } catch (err) {
      console.error('Failed to update full profile:', err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const blockUser = async (targetUserId: string) => {
    if (!currentUser) return;
    setBlockedUserIds((prev) => (prev.includes(targetUserId) ? prev : [...prev, targetUserId]));
    await blockUserApi(currentUser.uid, targetUserId);
  };

  const unblockUser = async (targetUserId: string) => {
    if (!currentUser) return;
    setBlockedUserIds((prev) => prev.filter((id) => id !== targetUserId));
    await unblockUserApi(currentUser.uid, targetUserId);
  };

  const muteUser = async (targetUserId: string) => {
    if (!currentUser) return;
    setMutedUserIds((prev) => (prev.includes(targetUserId) ? prev : [...prev, targetUserId]));
    await muteUserApi(currentUser.uid, targetUserId);
  };

  const unmuteUser = async (targetUserId: string) => {
    if (!currentUser) return;
    setMutedUserIds((prev) => prev.filter((id) => id !== targetUserId));
    await unmuteUserApi(currentUser.uid, targetUserId);
  };

  const registerWithEmailPassword = async (
    email: string,
    password: string,
    displayName: string,
    county?: string,
    constituency?: string
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = cred.user;
    // Block onAuthStateChanged -> syncUserProfile from overwriting with placeholder defaults before setDoc completes
    registeringUidRef.current = user.uid;

    const chosenName = displayName.trim() || 'TUJUANE Member';
    const chosenCounty = county || 'Nairobi';
    const chosenConstituency = constituency?.trim() || '';
    const updatedAtIso = new Date().toISOString();

    const newProfile: UserProfile = {
      uid: user.uid,
      displayName: chosenName,
      email: email.trim(),
      county: chosenCounty,
      constituency: chosenConstituency || undefined,
      blockedUserIds: [],
      mutedUserIds: [],
      isOnline: true,
      profileCustomized: true,
      profileUpdatedAt: updatedAtIso,
      lastSeen: updatedAtIso,
      createdAt: updatedAtIso
    };

    recentLocalEditRef.current = {
      uid: user.uid,
      profile: newProfile,
      savedAtMs: Date.now()
    };
    setCachedUserEdits(user.uid, newProfile);
    setCachedSession(newProfile);
    setUserProfile(newProfile);
    setUsersById((prev) => ({ ...prev, [user.uid]: newProfile }));

    try {
      if (displayName.trim()) {
        try {
          await updateProfile(user, { displayName: chosenName });
        } catch (err) {
          console.warn('Profile display name update deferred:', err);
        }
      }

      const userDocRef = doc(db, 'users', user.uid);
      try {
        await setDoc(userDocRef, {
          uid: user.uid,
          displayName: newProfile.displayName,
          email: newProfile.email,
          photoURL: '',
          county: newProfile.county,
          constituency: chosenConstituency,
          blockedUserIds: [],
          mutedUserIds: [],
          isOnline: true,
          profileCustomized: true,
          profileUpdatedAt: updatedAtIso,
          lastSeen: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('Firestore user doc initialization deferred:', err);
      }
      setCurrentUser(user);
      setUserProfile(newProfile);
      setCachedSession(newProfile);
    } finally {
      if (registeringUidRef.current === user.uid) {
        registeringUidRef.current = null;
      }
    }
    closeAuthModal();
  };

  const loginWithEmailPassword = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (cred.user) {
      await syncUserProfile(cred.user);
    }
    closeAuthModal();
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        usersById,
        isProfileComplete,
        profileCompleteness,
        loading,
        blockedUserIds,
        mutedUserIds,
        blockUser,
        unblockUser,
        muteUser,
        unmuteUser,
        loginWithGoogle,
        registerWithEmailPassword,
        loginWithEmailPassword,
        resetPassword,
        logout,
        switchAccount,
        updateUserCounty,
        updateUserLocation,
        updateFullProfile,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        authModalInitialMode
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
