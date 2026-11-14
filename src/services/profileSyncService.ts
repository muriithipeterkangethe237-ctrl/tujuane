import {
  collection,
  getDocs,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types/chat';

/**
 * Actively propagates user profile edits across authored posts, stories,
 * 1-on-1 direct chats, and community groups so changes persist everywhere.
 */
export async function propagateUserProfileUpdates(
  uid: string,
  profile: UserProfile
): Promise<void> {
  const safeName = profile.displayName || 'Citizen Member';
  const safePhoto = profile.photoURL || '';
  const safeCounty = profile.county || 'Nairobi';
  const safeConstituency = profile.constituency || '';

  const jobs: Promise<void>[] = [];

  // 1. Update authored community_posts
  jobs.push(
    (async () => {
      try {
        const postsQ = query(
          collection(db, 'community_posts'),
          where('authorId', '==', uid)
        );
        const snap = await getDocs(postsQ);
        await Promise.allSettled(
          snap.docs.map((postDoc) =>
            updateDoc(postDoc.ref, {
              authorName: safeName,
              authorPhotoUrl: safePhoto,
              authorCounty: safeCounty
            }).catch(() => {})
          )
        );
      } catch {
        // non-fatal background sync
      }
    })()
  );

  // 2. Update authored stories
  jobs.push(
    (async () => {
      try {
        const storiesQ = query(
          collection(db, 'stories'),
          where('authorId', '==', uid)
        );
        const snap = await getDocs(storiesQ);
        await Promise.allSettled(
          snap.docs.map((storyDoc) =>
            updateDoc(storyDoc.ref, {
              authorName: safeName,
              authorPhotoUrl: safePhoto,
              authorCounty: safeCounty
            }).catch(() => {})
          )
        );
      } catch {
        // non-fatal background sync
      }
    })()
  );

  // 3. Update participantDetails in 1-on-1 direct chats
  jobs.push(
    (async () => {
      try {
        const chatsQ = query(
          collection(db, 'chats'),
          where('participants', 'array-contains', uid)
        );
        const snap = await getDocs(chatsQ);
        await Promise.allSettled(
          snap.docs.map((chatDoc) =>
            updateDoc(chatDoc.ref, {
              [`participantDetails.${uid}`]: {
                displayName: safeName,
                email: profile.email || '',
                photoURL: safePhoto,
                county: safeCounty,
                constituency: safeConstituency
              }
            }).catch(() => {})
          )
        );
      } catch {
        // non-fatal background sync
      }
    })()
  );

  // 4. Update memberDetails in community groups
  jobs.push(
    (async () => {
      try {
        const groupsQ = query(
          collection(db, 'groups'),
          where('members', 'array-contains', uid)
        );
        const snap = await getDocs(groupsQ);
        await Promise.allSettled(
          snap.docs.map((groupDoc) =>
            updateDoc(groupDoc.ref, {
              [`memberDetails.${uid}`]: {
                displayName: safeName,
                photoURL: safePhoto,
                county: safeCounty
              }
            }).catch(() => {})
          )
        );
      } catch {
        // non-fatal background sync
      }
    })()
  );

  await Promise.allSettled(jobs);
}
