import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CommunityChannel,
  GroupChat,
  ChannelMessage,
  UserProfile,
  MessageAttachment,
  MessageReplyReference
} from '../types/chat';

// Predefined sample channels removed — chats use real 1-on-1 conversations and user-created groups
export const DEFAULT_CHANNELS: CommunityChannel[] = [];

/**
 * Subscribe to messages in a public channel
 */
export function subscribeToChannelMessages(
  channelId: string,
  callback: (messages: ChannelMessage[]) => void
): () => void {
  const path = `channels/${channelId}/messages`;
  const q = query(collection(db, path), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChannelMessage[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          channelId: d.channelId || channelId,
          senderId: d.senderId,
          senderName: d.senderName || 'Member',
          senderPhoto: d.senderPhoto,
          senderCounty: d.senderCounty || 'Nairobi',
          text: d.text || '',
          mediaUrl: d.mediaUrl,
          attachment: d.attachment,
          replyTo: d.replyTo,
          upvotes: d.upvotes || 0,
          isEdited: !!d.isEdited,
          editedAt: d.editedAt?.toDate ? d.editedAt.toDate().toISOString() : undefined,
          createdAt: d.createdAt?.toDate
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString()
        };
      });
      callback(messages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

/**
 * Send a message to a channel
 */
export async function sendChannelMessage(
  channelId: string,
  sender: UserProfile,
  text: string,
  mediaUrl?: string,
  attachment?: MessageAttachment,
  replyTo?: MessageReplyReference
): Promise<void> {
  const messageId = `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const messageRef = doc(db, 'channels', channelId, 'messages', messageId);
  const channelRef = doc(db, 'channels', channelId);

  const payload: any = {
    id: messageId,
    channelId,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || '',
    senderCounty: sender.county || 'Nairobi',
    text: text.trim().slice(0, 1000),
    upvotes: 0,
    createdAt: serverTimestamp()
  };

  if (mediaUrl) payload.mediaUrl = mediaUrl;
  if (attachment) payload.attachment = attachment;
  if (replyTo) payload.replyTo = replyTo;

  try {
    await setDoc(messageRef, payload);

    // Update parent channel preview if exists
    try {
      await updateDoc(channelRef, {
        lastMessage: text.slice(0, 80),
        lastMessageSenderName: sender.displayName,
        lastMessageTimestamp: serverTimestamp()
      });
    } catch {
      // Parent doc might be virtual/predefined, ignore
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `channels/${channelId}/messages/${messageId}`);
  }
}

/**
 * Create a new custom group chat
 */
export async function createGroupChat(
  creator: UserProfile,
  params: {
    name: string;
    description?: string;
    county?: string;
    icon?: string;
    isPublic?: boolean;
    initialMembers?: string[];
  }
): Promise<string> {
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const groupRef = doc(db, 'groups', groupId);

  const members = Array.from(new Set([creator.uid, ...(params.initialMembers || [])]));

  const payload = {
    id: groupId,
    name: params.name.trim().slice(0, 100),
    description: (params.description || '').trim().slice(0, 300),
    creatorId: creator.uid,
    creatorName: creator.displayName,
    icon: params.icon || '👥',
    county: params.county || creator.county || 'Nairobi',
    members,
    admins: [creator.uid],
    memberDetails: {
      [creator.uid]: {
        displayName: creator.displayName,
        photoURL: creator.photoURL || '',
        county: creator.county || 'Nairobi'
      }
    },
    isPublic: params.isPublic ?? true,
    lastMessage: 'Group created by ' + creator.displayName,
    lastMessageSenderName: creator.displayName,
    lastMessageTimestamp: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(groupRef, payload);
    return groupId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}`);
  }
}

/**
 * Subscribe to groups that user is a member of or public groups
 */
export function subscribeToGroups(
  userId: string,
  callback: (groups: GroupChat[]) => void
): () => void {
  const path = 'groups';
  const q = query(collection(db, path), orderBy('lastMessageTimestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const groups: GroupChat[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || 'Community Group',
          description: d.description,
          creatorId: d.creatorId,
          creatorName: d.creatorName || 'Member',
          icon: d.icon || '👥',
          county: d.county,
          members: Array.isArray(d.members) ? d.members : [],
          admins: Array.isArray(d.admins) ? d.admins : [],
          memberDetails: d.memberDetails || {},
          lastMessage: d.lastMessage,
          lastMessageSenderName: d.lastMessageSenderName,
          lastMessageTimestamp: d.lastMessageTimestamp?.toDate
            ? d.lastMessageTimestamp.toDate().toISOString()
            : undefined,
          isPublic: d.isPublic ?? true,
          createdAt: d.createdAt?.toDate
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString()
        };
      });
      callback(groups);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

/**
 * Join an existing group chat
 */
export async function joinGroupChat(groupId: string, user: UserProfile): Promise<void> {
  const groupRef = doc(db, 'groups', groupId);
  try {
    await updateDoc(groupRef, {
      members: arrayUnion(user.uid),
      [`memberDetails.${user.uid}`]: {
        displayName: user.displayName,
        photoURL: user.photoURL || '',
        county: user.county || 'Nairobi'
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
  }
}

/**
 * Subscribe to messages in a group chat
 */
export function subscribeToGroupMessages(
  groupId: string,
  callback: (messages: ChannelMessage[]) => void
): () => void {
  const path = `groups/${groupId}/messages`;
  const q = query(collection(db, path), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChannelMessage[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          channelId: groupId,
          senderId: d.senderId,
          senderName: d.senderName || 'Member',
          senderPhoto: d.senderPhoto,
          senderCounty: d.senderCounty || 'Nairobi',
          text: d.text || '',
          mediaUrl: d.mediaUrl,
          attachment: d.attachment,
          replyTo: d.replyTo,
          isEdited: !!d.isEdited,
          editedAt: d.editedAt?.toDate ? d.editedAt.toDate().toISOString() : undefined,
          createdAt: d.createdAt?.toDate
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString()
        };
      });
      callback(messages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

/**
 * Send a message to a group chat
 */
export async function sendGroupMessage(
  groupId: string,
  sender: UserProfile,
  text: string,
  mediaUrl?: string,
  attachment?: MessageAttachment,
  replyTo?: MessageReplyReference
): Promise<void> {
  const messageId = `gmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const messageRef = doc(db, 'groups', groupId, 'messages', messageId);
  const groupRef = doc(db, 'groups', groupId);

  const payload: any = {
    id: messageId,
    groupId,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || '',
    senderCounty: sender.county || 'Nairobi',
    text: text.trim().slice(0, 1000),
    createdAt: serverTimestamp()
  };

  if (mediaUrl) payload.mediaUrl = mediaUrl;
  if (attachment) payload.attachment = attachment;
  if (replyTo) payload.replyTo = replyTo;

  try {
    await setDoc(messageRef, payload);

    await updateDoc(groupRef, {
      lastMessage: text.slice(0, 80),
      lastMessageSenderName: sender.displayName,
      lastMessageTimestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}/messages/${messageId}`);
  }
}
