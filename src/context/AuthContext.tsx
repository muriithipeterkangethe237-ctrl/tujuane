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
  handleFirestoreError,
  OperationType
} from '../firebase';
import { UserProfile } from '../types/chat';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserCounty: (county: string) => Promise<void>;
  updateUserLocation: (county: string, constituency?: string) => Promise<void>;
  updateFullProfile: (updates: {
    displayName?: string;
    county?: string;
    constituency?: string;
    bio?: string;
    occupation?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync user profile in Firestore
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
      }
    } catch (err: any) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return syncUserProfile(user, retries - 1);
      }
      console.warn('Operating in offline mode for user profile:', err?.message || err);
      // Fallback local profile if offline or permission pending
      setUserProfile({
        uid: user.uid,
        displayName: user.displayName || 'TUJUANE Member',
        email: user.email || '',
        photoURL: user.photoURL || undefined,
        county: 'Nairobi',
        isOnline: true,
        createdAt: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify if token can be retrieved from token service
          await user.getIdToken();
          setCurrentUser(user);
          await syncUserProfile(user);
        } catch (tokenErr: any) {
          const msg = tokenErr?.message || String(tokenErr);
          console.warn('Cached auth session cannot be verified, resetting session:', msg);
          try {
            await signOut(auth);
          } catch {
            // ignore
          }
          setCurrentUser(null);
          setUserProfile(null);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      setUserProfile((prev) => (prev ? { ...prev, county, constituency } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const updateFullProfile = async (updates: {
    displayName?: string;
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
      if (updates.county !== undefined) payload.county = updates.county;
      if (updates.constituency !== undefined) payload.constituency = updates.constituency;
      if (updates.bio !== undefined) payload.bio = updates.bio.trim();
      if (updates.occupation !== undefined) payload.occupation = updates.occupation.trim();

      await updateDoc(userDocRef, payload);
      setUserProfile((prev) => (prev ? { ...prev, ...payload } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        loginWithGoogle,
        logout,
        updateUserCounty,
        updateUserLocation,
        updateFullProfile
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
