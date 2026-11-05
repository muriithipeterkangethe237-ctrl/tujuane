import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
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

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
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
  updateUserCounty: (county: string) => Promise<void>;
  updateUserLocation: (county: string, constituency?: string) => Promise<void>;
  updateFullProfile: (updates: {
    displayName?: string;
    photoURL?: string;
    county?: string;
    constituency?: string;
    bio?: string;
    occupation?: string;
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
  const [loading, setLoading] = useState<boolean>(() => !auth.currentUser && !getCachedSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signin' | 'register'>('signin');

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
          displayName: user.displayName || data.displayName || 'TUJUANE Community Member',
          email: user.email || data.email || '',
          photoURL: user.photoURL || data.photoURL || undefined,
          county: data.county || 'Nairobi',
          constituency: data.constituency || undefined,
          bio: data.bio || undefined,
          occupation: data.occupation || undefined,
          isOnline: true,
          lastSeen: new Date().toISOString(),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
        setUserProfile(profile);
        setCachedSession(profile);

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
      // Fallback local profile if offline or permission pending
      const fallbackProfile: UserProfile = {
        uid: user.uid,
        displayName: user.displayName || 'TUJUANE Member',
        email: user.email || '',
        photoURL: user.photoURL || undefined,
        county: 'Nairobi',
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
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
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
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateUserCounty = async (county: string) => {
    return updateUserLocation(county);
  };

  const updateUserLocation = async (county: string, constituency?: string) => {
    if (!currentUser || !userProfile) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      const payload: any = { county };
      if (constituency) {
        payload.constituency = constituency;
      }
      await updateDoc(userDocRef, payload);
      const updated = { ...userProfile, county, constituency };
      setUserProfile(updated);
      setCachedSession(updated);
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
  }) => {
    if (!currentUser || !userProfile) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      const payload: any = {};
      if (updates.displayName !== undefined) payload.displayName = updates.displayName.trim();
      if (updates.photoURL !== undefined) payload.photoURL = updates.photoURL;
      if (updates.county !== undefined) payload.county = updates.county;
      if (updates.constituency !== undefined) payload.constituency = updates.constituency;
      if (updates.bio !== undefined) payload.bio = updates.bio.trim();
      if (updates.occupation !== undefined) payload.occupation = updates.occupation.trim();

      await updateDoc(userDocRef, payload);

      if (currentUser) {
        try {
          await updateProfile(currentUser, {
            displayName: payload.displayName || currentUser.displayName,
            photoURL: payload.photoURL || currentUser.photoURL
          });
        } catch {
          // ignore non-fatal Auth credential sync error
        }
      }

      const updated = { ...userProfile, ...payload };
      setUserProfile(updated);
      setCachedSession(updated);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
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
        loading,
        loginWithGoogle,
        registerWithEmailPassword,
        loginWithEmailPassword,
        resetPassword,
        logout,
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
