import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types/chat';
import { FollowRelationship, FriendRequest } from '../types/social';

const FOLLOWS_COLLECTION = 'follows';
const FRIEND_REQUESTS_COLLECTION = 'friend_requests';

/**
 * Follow a citizen
 */
export async function followUser(
  follower: UserProfile,
  targetUser: UserProfile
): Promise<void> {
  const followId = `${follower.uid}_${targetUser.uid}`;
  const followRef = doc(db, FOLLOWS_COLLECTION, followId);

  const payload: any = {
    id: followId,
    followerId: follower.uid,
    followerName: follower.displayName,
    followerPhoto: follower.photoURL || '',
    followerCounty: follower.county || 'Nairobi',
    followingId: targetUser.uid,
    followingName: targetUser.displayName,
    followingPhoto: targetUser.photoURL || '',
    followingCounty: targetUser.county || 'Nairobi',
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(followRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FOLLOWS_COLLECTION}/${followId}`);
  }
}

/**
 * Unfollow a citizen
 */
export async function unfollowUser(
  followerId: string,
  targetUserId: string
): Promise<void> {
  const followId = `${followerId}_${targetUserId}`;
  const followRef = doc(db, FOLLOWS_COLLECTION, followId);

  try {
    await deleteDoc(followRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${FOLLOWS_COLLECTION}/${followId}`);
  }
}

/**
 * Subscribe to the users that a citizen is following
 */
export function subscribeToFollowing(
  userId: string,
  callback: (following: FollowRelationship[]) => void
): () => void {
  const q = query(collection(db, FOLLOWS_COLLECTION), where('followerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FollowRelationship[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          followerId: data.followerId,
          followerName: data.followerName,
          followerPhoto: data.followerPhoto,
          followerCounty: data.followerCounty,
          followingId: data.followingId,
          followingName: data.followingName,
          followingPhoto: data.followingPhoto,
          followingCounty: data.followingCounty,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });
      callback(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, FOLLOWS_COLLECTION);
    }
  );
}

/**
 * Subscribe to the followers of a citizen
 */
export function subscribeToFollowers(
  userId: string,
  callback: (followers: FollowRelationship[]) => void
): () => void {
  const q = query(collection(db, FOLLOWS_COLLECTION), where('followingId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FollowRelationship[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          followerId: data.followerId,
          followerName: data.followerName,
          followerPhoto: data.followerPhoto,
          followerCounty: data.followerCounty,
          followingId: data.followingId,
          followingName: data.followingName,
          followingPhoto: data.followingPhoto,
          followingCounty: data.followingCounty,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });
      callback(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, FOLLOWS_COLLECTION);
    }
  );
}

/**
 * Send a friend request to another citizen
 */
export async function sendFriendRequest(
  sender: UserProfile,
  receiver: UserProfile
): Promise<string> {
  const requestId = `freq_${sender.uid}_${receiver.uid}`;
  const reqRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);

  const payload: any = {
    id: requestId,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || '',
    senderCounty: sender.county || 'Nairobi',
    senderConstituency: sender.constituency || '',
    receiverId: receiver.uid,
    receiverName: receiver.displayName,
    receiverPhoto: receiver.photoURL || '',
    receiverCounty: receiver.county || 'Nairobi',
    receiverConstituency: receiver.constituency || '',
    status: 'pending',
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(reqRef, payload);
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FRIEND_REQUESTS_COLLECTION}/${requestId}`);
  }
}

/**
 * Accept an incoming friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);
  try {
    await updateDoc(reqRef, {
      status: 'accepted',
      respondedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FRIEND_REQUESTS_COLLECTION}/${requestId}`);
  }
}

/**
 * Decline a friend request
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);
  try {
    await updateDoc(reqRef, {
      status: 'declined',
      respondedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FRIEND_REQUESTS_COLLECTION}/${requestId}`);
  }
}

/**
 * Cancel a sent friend request or remove friend
 */
export async function removeFriendshipOrRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);
  try {
    await deleteDoc(reqRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${FRIEND_REQUESTS_COLLECTION}/${requestId}`);
  }
}

/**
 * Subscribe to incoming friend requests for a user
 */
export function subscribeToIncomingFriendRequests(
  userId: string,
  callback: (requests: FriendRequest[]) => void
): () => void {
  const q = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('receiverId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FriendRequest[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto,
          senderCounty: data.senderCounty,
          senderConstituency: data.senderConstituency,
          receiverId: data.receiverId,
          receiverName: data.receiverName,
          receiverPhoto: data.receiverPhoto,
          receiverCounty: data.receiverCounty,
          receiverConstituency: data.receiverConstituency,
          status: data.status,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
          respondedAt: data.respondedAt?.toDate ? data.respondedAt.toDate().toISOString() : undefined
        };
      });
      callback(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, FRIEND_REQUESTS_COLLECTION);
    }
  );
}

/**
 * Subscribe to all accepted friends of a user
 */
export function subscribeToFriends(
  userId: string,
  callback: (friends: FriendRequest[]) => void
): () => void {
  // Query where user is either sender or receiver and status is accepted
  const qSender = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('senderId', '==', userId),
    where('status', '==', 'accepted')
  );

  const qReceiver = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('receiverId', '==', userId),
    where('status', '==', 'accepted')
  );

  let senderFriends: FriendRequest[] = [];
  let receiverFriends: FriendRequest[] = [];

  const updateMerged = () => {
    const map = new Map<string, FriendRequest>();
    [...senderFriends, ...receiverFriends].forEach((f) => map.set(f.id, f));
    callback(Array.from(map.values()));
  };

  const unsub1 = onSnapshot(qSender, (snap) => {
    senderFriends = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString()
    })) as FriendRequest[];
    updateMerged();
  });

  const unsub2 = onSnapshot(qReceiver, (snap) => {
    receiverFriends = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString()
    })) as FriendRequest[];
    updateMerged();
  });

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Subscribe to all friend requests involving user (both sent & received) to know request status
 */
export function subscribeToAllUserFriendRequests(
  userId: string,
  callback: (requests: FriendRequest[]) => void
): () => void {
  const qSender = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('senderId', '==', userId)
  );
  const qReceiver = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('receiverId', '==', userId)
  );

  let sentList: FriendRequest[] = [];
  let receivedList: FriendRequest[] = [];

  const notify = () => {
    const map = new Map<string, FriendRequest>();
    [...sentList, ...receivedList].forEach((r) => map.set(r.id, r));
    callback(Array.from(map.values()));
  };

  const unsub1 = onSnapshot(qSender, (snap) => {
    sentList = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString()
    })) as FriendRequest[];
    notify();
  });

  const unsub2 = onSnapshot(qReceiver, (snap) => {
    receivedList = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString()
    })) as FriendRequest[];
    notify();
  });

  return () => {
    unsub1();
    unsub2();
  };
}
