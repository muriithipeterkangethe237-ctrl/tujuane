import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser || null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getCachedSession());
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState<boolean>(() => !auth.currentUser && !getCachedSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signin' | 'register'>('signin');

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

  // Sync user profile in Firestore and update persistent local cache
  const syncUserProfile = async (user: User, retries = 2) => {
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const profile: UserProfile = {
          uid: user.uid,
          // Firestore saved profile ALWAYS takes precedence over Google/Firebase Auth
          displayName:
            data.displayName && typeof data.displayName === 'string' && data.displayName.trim()
              ? data.displayName.trim()
              : user.displayName || 'TUJUANE Community Member',
          email: data.email || user.email || '',
          // If user saved a photo or explicitly cleared it in Firestore, respect it over Google auth photo
          photoURL:
            data.photoURL !== undefined && data.photoURL !== null
              ? data.photoURL.trim() ? data.photoURL : undefined
              : user.photoURL || undefined,
          county: data.county || 'Nairobi',
          constituency: data.constituency || undefined,
          bio: data.bio || undefined,
          occupation: data.occupation || undefined,
          blockedUserIds: Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [],
          mutedUserIds: Array.isArray(data.mutedUserIds) ? data.mutedUserIds : [],
          isDeveloper: data.isDeveloper !== undefined ? Boolean(data.isDeveloper) : (user.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com'),
          accountStatus: (data.accountStatus as 'active' | 'suspended' | 'banned') || 'active',
          suspendedUntil: data.suspendedUntil?.toDate
            ? data.suspendedUntil.toDate().toISOString()
            : typeof data.suspendedUntil === 'string'
            ? data.suspendedUntil
            : undefined,
          banReason: data.banReason || undefined,
          statusUpdatedAt: data.statusUpdatedAt?.toDate
            ? data.statusUpdatedAt.toDate().toISOString()
            : typeof data.statusUpdatedAt === 'string'
            ? data.statusUpdatedAt
            : undefined,
          statusUpdatedBy: data.statusUpdatedBy || undefined,
          pollVotesCount: typeof data.pollVotesCount === 'number' ? data.pollVotesCount : 0,
          feedCommentsCount: typeof data.feedCommentsCount === 'number' ? data.feedCommentsCount : 0,
          isOnline: true,
          lastSeen: new Date().toISOString(),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
        setUserProfile(profile);
        setCachedSession(profile);
        if (profile.blockedUserIds) setBlockedUserIds(profile.blockedUserIds);
        if (profile.mutedUserIds) setMutedUserIds(profile.mutedUserIds);

        // Update presence non-blockingly
        updateDoc(userDocRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        }).catch((err) => {
          console.warn('Presence status update deferred:', err?.message || err);
        });
      } else {
        // Create new user profile document
        const newProfile: UserProfile = {
          uid: user.uid,
          displayName: user.displayName || 'TUJUANE Community Member',
          email: user.email || '',
          photoURL: user.photoURL || undefined,
          county: 'Nairobi',
          blockedUserIds: [],
          mutedUserIds: [],
          isOnline: true,
          lastSeen: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        await setDoc(userDocRef, {
          uid: user.uid,
          displayName: newProfile.displayName,
          email: newProfile.email,
          photoURL: newProfile.photoURL || '',
          county: newProfile.county,
          blockedUserIds: [],
          mutedUserIds: [],
          isOnline: true,
          lastSeen: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        setUserProfile(newProfile);
        setCachedSession(newProfile);
      }
    } catch (err: any) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return syncUserProfile(user, retries - 1);
      }
      console.warn('Operating in offline mode for user profile:', err?.message || err);
      // Prefer cached session over resetting to blank
      const cached = getCachedSession();
      if (cached && cached.uid === user.uid) {
        setUserProfile(cached);
        return;
      }
      const fallbackProfile: UserProfile = {
        uid: user.uid,
        displayName: user.displayName || 'TUJUANE Member',
        email: user.email || '',
        photoURL: user.photoURL || undefined,
        county: 'Nairobi',
        blockedUserIds: [],
        mutedUserIds: [],
        isOnline: true,
        createdAt: new Date().toISOString()
      };
      setUserProfile(fallbackProfile);
      setCachedSession(fallbackProfile);
    }
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
      collection(db, 'users'),
      (snapshot) => {
        const nextMap: Record<string, UserProfile> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          nextMap[docSnap.id] = {
            uid: docSnap.id,
            displayName: data.displayName || 'Citizen Member',
            email: data.email || '',
            photoURL: data.photoURL && String(data.photoURL).trim() ? data.photoURL : undefined,
            county: data.county || 'Nairobi',
            constituency: data.constituency || undefined,
            bio: data.bio || undefined,
            occupation: data.occupation || undefined,
            isOnline: Boolean(data.isOnline),
            lastSeen: data.lastSeen?.toDate
              ? data.lastSeen.toDate().toISOString()
              : typeof data.lastSeen === 'string'
              ? data.lastSeen
              : undefined,
            isDeveloper: Boolean(data.isDeveloper),
            accountStatus: (data.accountStatus as 'active' | 'suspended' | 'banned') || 'active',
            backgroundAlertsEnabled: data.backgroundAlertsEnabled !== undefined ? Boolean(data.backgroundAlertsEnabled) : undefined,
            profileCompleted: data.profileCompleted !== undefined ? Boolean(data.profileCompleted) : undefined,
            pollVotesCount: typeof data.pollVotesCount === 'number' ? data.pollVotesCount : 0,
            feedCommentsCount: typeof data.feedCommentsCount === 'number' ? data.feedCommentsCount : 0,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : typeof data.createdAt === 'string'
              ? data.createdAt
              : ''
          };
        });
        setUsersById(nextMap);
      },
      () => {
        // non-fatal directory listener notice
      }
    );

    return () => unsubUsers();
  }, [currentUser]);

  // Real-time snapshot subscription to own user document in Firestore to prevent stale/reverting edits
  useEffect(() => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setUserProfile((prev) => {
          const updated: UserProfile = {
            uid: currentUser.uid,
            displayName:
              data.displayName && typeof data.displayName === 'string' && data.displayName.trim()
                ? data.displayName.trim()
                : prev?.displayName || currentUser.displayName || 'TUJUANE Community Member',
            email: data.email || prev?.email || currentUser.email || '',
            photoURL:
              data.photoURL !== undefined && data.photoURL !== null
                ? data.photoURL.trim() ? data.photoURL : undefined
                : prev?.photoURL || currentUser.photoURL || undefined,
            county: data.county || prev?.county || 'Nairobi',
            constituency: data.constituency !== undefined ? data.constituency : prev?.constituency,
            bio: data.bio !== undefined ? data.bio : prev?.bio,
            occupation: data.occupation !== undefined ? data.occupation : prev?.occupation,
            blockedUserIds: Array.isArray(data.blockedUserIds) ? data.blockedUserIds : (prev?.blockedUserIds || []),
            mutedUserIds: Array.isArray(data.mutedUserIds) ? data.mutedUserIds : (prev?.mutedUserIds || []),
            isDeveloper: data.isDeveloper !== undefined ? Boolean(data.isDeveloper) : (prev?.isDeveloper ?? (currentUser.email?.toLowerCase().trim() === 'muriithipeterkangethe237@gmail.com')),
            accountStatus: (data.accountStatus as 'active' | 'suspended' | 'banned') || prev?.accountStatus || 'active',
            suspendedUntil: data.suspendedUntil?.toDate
              ? data.suspendedUntil.toDate().toISOString()
              : typeof data.suspendedUntil === 'string'
              ? data.suspendedUntil
              : prev?.suspendedUntil,
            banReason: data.banReason !== undefined ? data.banReason : prev?.banReason,
            statusUpdatedAt: data.statusUpdatedAt?.toDate
              ? data.statusUpdatedAt.toDate().toISOString()
              : typeof data.statusUpdatedAt === 'string'
              ? data.statusUpdatedAt
              : prev?.statusUpdatedAt,
            statusUpdatedBy: data.statusUpdatedBy !== undefined ? data.statusUpdatedBy : prev?.statusUpdatedBy,
            pollVotesCount: typeof data.pollVotesCount === 'number' ? data.pollVotesCount : (prev?.pollVotesCount ?? 0),
            feedCommentsCount: typeof data.feedCommentsCount === 'number' ? data.feedCommentsCount : (prev?.feedCommentsCount ?? 0),
            isOnline: data.isOnline !== undefined ? Boolean(data.isOnline) : true,
            lastSeen: data.lastSeen?.toDate ? data.lastSeen.toDate().toISOString() : (typeof data.lastSeen === 'string' ? data.lastSeen : new Date().toISOString()),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : prev?.createdAt || new Date().toISOString())
          };
          setCachedSession(updated);
          return updated;
        });
      },
      (err) => {
        console.warn('Real-time user profile sync notice:', err?.message || err);
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
      updateDoc(userDocRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      }).catch(() => {});
    };

    const markOffline = () => {
      updateDoc(userDocRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      }).catch(() => {});
    };

    // Mark active on mount
    markActive();

    // Heartbeat every 35 seconds while document is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        markActive();
      }
    }, 35000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActive();
      } else {
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
    if (!currentUser || !userProfile) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      const updated: UserProfile = { ...userProfile, county, constituency: constituency || undefined };
      const completeness = getProfileCompleteness(updated);
      const payload: any = {
        county,
        constituency: constituency || '',
        profileCompleted: completeness.isComplete
      };
      await updateDoc(userDocRef, payload);
      updated.profileCompleted = completeness.isComplete;
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
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      const payload: any = {
        uid: currentUser.uid,
        email: currentUser.email || userProfile?.email || '',
        lastSeen: serverTimestamp()
      };
      if (updates.displayName !== undefined) payload.displayName = updates.displayName.trim();
      if (updates.photoURL !== undefined) payload.photoURL = updates.photoURL;
      if (updates.county !== undefined) payload.county = updates.county;
      if (updates.constituency !== undefined) payload.constituency = updates.constituency;
      if (updates.bio !== undefined) payload.bio = updates.bio.trim();
      if (updates.occupation !== undefined) payload.occupation = updates.occupation.trim();
      if (updates.backgroundAlertsEnabled !== undefined) {
        payload.backgroundAlertsEnabled = Boolean(updates.backgroundAlertsEnabled);
      }

      const baseProfile: UserProfile = userProfile || {
        uid: currentUser.uid,
        displayName: payload.displayName || currentUser.displayName || 'TUJUANE Member',
        email: currentUser.email || '',
        photoURL: payload.photoURL || undefined,
        county: payload.county || 'Nairobi',
        constituency: undefined,
        bio: undefined,
        occupation: undefined,
        createdAt: new Date().toISOString()
      };

      const updated: UserProfile = {
        ...baseProfile,
        displayName: payload.displayName !== undefined && payload.displayName ? payload.displayName : baseProfile.displayName,
        photoURL: payload.photoURL !== undefined ? (payload.photoURL.trim() ? payload.photoURL : undefined) : baseProfile.photoURL,
        county: payload.county !== undefined ? payload.county : baseProfile.county,
        constituency: payload.constituency !== undefined ? (payload.constituency || undefined) : baseProfile.constituency,
        bio: payload.bio !== undefined ? payload.bio : baseProfile.bio,
        occupation: payload.occupation !== undefined ? payload.occupation : baseProfile.occupation,
        backgroundAlertsEnabled:
          payload.backgroundAlertsEnabled !== undefined
            ? payload.backgroundAlertsEnabled
            : baseProfile.backgroundAlertsEnabled
      };

      const completeness = getProfileCompleteness(updated);
      payload.profileCompleted = completeness.isComplete;
      updated.profileCompleted = completeness.isComplete;

      // Persist to Firestore users/{uid}
      await setDoc(userDocRef, payload, { merge: true });

      // Update React states & persistent cache immediately
      setUserProfile(updated);
      setCachedSession(updated);
      setUsersById((prev) => ({ ...prev, [currentUser.uid]: updated }));

      // Sync Firebase Auth profile (displayName + short HTTP photoURL if applicable)
      const authUpdates: { displayName?: string; photoURL?: string } = {};
      if (payload.displayName && currentUser.displayName !== payload.displayName) {
        authUpdates.displayName = payload.displayName;
      }
      if (
        updates.photoURL !== undefined &&
        (updates.photoURL === '' || (updates.photoURL.startsWith('http') && updates.photoURL.length < 1500))
      ) {
        authUpdates.photoURL = updates.photoURL;
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
    if (displayName.trim()) {
      try {
        await updateProfile(user, { displayName: displayName.trim() });
      } catch (err) {
        console.warn('Profile display name update deferred:', err);
      }
    }
    const userDocRef = doc(db, 'users', user.uid);
    const newProfile: UserProfile = {
      uid: user.uid,
      displayName: displayName.trim() || 'TUJUANE Member',
      email: email.trim(),
      county: county || 'Nairobi',
      constituency: constituency || undefined,
      blockedUserIds: [],
      mutedUserIds: [],
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(userDocRef, {
        uid: user.uid,
        displayName: newProfile.displayName,
        email: newProfile.email,
        photoURL: '',
        county: newProfile.county,
        constituency: newProfile.constituency || '',
        blockedUserIds: [],
        mutedUserIds: [],
        isOnline: true,
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Firestore user doc initialization deferred:', err);
    }
    setCurrentUser(user);
    setUserProfile(newProfile);
    setCachedSession(newProfile);
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
