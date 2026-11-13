import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch
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
    lastMessageSenderId: creator.uid,
    lastMessageSenderName: creator.displayName,
    lastMessageStatus: 'sent',
    unreadBy: [],
    deliveredBy: [creator.uid],
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
          lastMessageId: d.lastMessageId || undefined,
          lastMessageSenderId: d.lastMessageSenderId || undefined,
          lastMessageSenderName: d.lastMessageSenderName,
          lastMessageStatus: d.lastMessageStatus || undefined,
          lastMessageTimestamp: d.lastMessageTimestamp?.toDate
            ? d.lastMessageTimestamp.toDate().toISOString()
            : undefined,
          unreadBy: Array.isArray(d.unreadBy) ? d.unreadBy : [],
          deliveredBy: Array.isArray(d.deliveredBy) ? d.deliveredBy : [],
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
          status: d.status || 'sent',
          deliveredTo: Array.isArray(d.deliveredTo) ? d.deliveredTo : [],
          readBy: Array.isArray(d.readBy) ? d.readBy : [],
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
    status: 'sent',
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp()
  };

  if (mediaUrl) payload.mediaUrl = mediaUrl;
  if (attachment) payload.attachment = attachment;
  if (replyTo) payload.replyTo = replyTo;

  try {
    await setDoc(messageRef, payload);

    const groupSnap = await getDoc(groupRef);
    const groupData = groupSnap.exists() ? groupSnap.data() : null;
    const members: string[] = Array.isArray(groupData?.members) ? groupData.members : [];
    const otherMembers = members.filter((uid) => uid !== sender.uid);

    let preview = text.trim().slice(0, 100);
    if (attachment && !text.trim()) {
      preview = `📎 Attached file: ${attachment.name}`;
    } else if (mediaUrl && !text.trim()) {
      preview = '📷 Shared a photo';
    } else if (mediaUrl) {
      preview = `📷 ${text.trim().slice(0, 80)}`;
    }

    await updateDoc(groupRef, {
      lastMessage: preview,
      lastMessageId: messageId,
      lastMessageSenderId: sender.uid,
      lastMessageSenderName: sender.displayName,
      lastMessageStatus: 'sent',
      unreadBy: otherMembers,
      deliveredBy: [sender.uid],
      lastMessageTimestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}/messages/${messageId}`);
  }
}

const inFlightGroupDeliveryChecks = new Set<string>();
const pendingGroupDeliveryRechecks = new Set<string>();

/**
 * Mark unread group messages as delivered when a group member is online in TUJUANE
 */
export async function markGroupUnreadMessagesAsDelivered(
  groupId: string,
  userId: string
): Promise<void> {
  if (!groupId || !userId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const lockKey = `${groupId}:${userId}`;
  if (inFlightGroupDeliveryChecks.has(lockKey)) {
    pendingGroupDeliveryRechecks.add(lockKey);
    return;
  }
  inFlightGroupDeliveryChecks.add(lockKey);

  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) return;
    const groupData = groupSnap.data();
    const members: string[] = Array.isArray(groupData.members) ? groupData.members : [];
    if (!members.includes(userId)) return;

    const msgsSnap = await getDocs(collection(db, 'groups', groupId, 'messages'));
    const undeliveredDocs = msgsSnap.docs.filter((docSnap) => {
      const d = docSnap.data();
      if (d.senderId === userId) return false;
      const deliveredTo: string[] = Array.isArray(d.deliveredTo) ? d.deliveredTo : [];
      return !deliveredTo.includes(userId) && d.status !== 'read';
    });

    const deliveredBy: string[] = Array.isArray(groupData.deliveredBy) ? groupData.deliveredBy : [];
    const shouldUpdateGroupDeliveredBy = !deliveredBy.includes(userId);
    const shouldUpgradeGroupStatus =
      groupData.lastMessageSenderId !== userId &&
      groupData.lastMessageStatus !== 'delivered' &&
      groupData.lastMessageStatus !== 'read';

    if (undeliveredDocs.length === 0 && !shouldUpdateGroupDeliveredBy && !shouldUpgradeGroupStatus) {
      return;
    }

    const batch = writeBatch(db);
    for (const docSnap of undeliveredDocs) {
      batch.update(docSnap.ref, {
        deliveredTo: arrayUnion(userId),
        status: 'delivered'
      });
    }

    const groupUpdate: Record<string, any> = {};
    if (shouldUpdateGroupDeliveredBy) {
      groupUpdate.deliveredBy = arrayUnion(userId);
    }
    if (shouldUpgradeGroupStatus) {
      groupUpdate.lastMessageStatus = 'delivered';
    }
    if (Object.keys(groupUpdate).length > 0) {
      batch.update(groupRef, groupUpdate);
    }

    await batch.commit();
  } catch (err) {
    console.warn('Could not mark background group messages as delivered:', err);
  } finally {
    inFlightGroupDeliveryChecks.delete(lockKey);
    if (pendingGroupDeliveryRechecks.has(lockKey)) {
      pendingGroupDeliveryRechecks.delete(lockKey);
      markGroupUnreadMessagesAsDelivered(groupId, userId);
    }
  }
}

/**
 * Mark group messages as delivered while viewing or loading the group
 */
export async function markGroupMessagesAsDelivered(
  groupId: string,
  userId: string,
  messagesToDeliver: ChannelMessage[]
): Promise<void> {
  const eligible = messagesToDeliver.filter(
    (m) =>
      m.senderId !== userId &&
      (!m.deliveredTo || !m.deliveredTo.includes(userId))
  );

  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    const groupData = groupSnap.exists() ? groupSnap.data() : null;
    const deliveredBy: string[] = Array.isArray(groupData?.deliveredBy) ? groupData.deliveredBy : [];
    const needsDeliveredBy = !!groupData && !deliveredBy.includes(userId);
    const needsGroupStatusUpgrade =
      !!groupData &&
      groupData.lastMessageSenderId !== userId &&
      (!groupData.lastMessageStatus || groupData.lastMessageStatus === 'sent');

    if (eligible.length === 0 && !needsDeliveredBy && !needsGroupStatusUpgrade) return;

    const batch = writeBatch(db);
    for (const msg of eligible) {
      const msgRef = doc(db, 'groups', groupId, 'messages', msg.id);
      batch.update(msgRef, {
        deliveredTo: arrayUnion(userId),
        status: msg.status === 'read' ? 'read' : 'delivered'
      });
    }

    const groupUpdate: Record<string, any> = {};
    if (needsDeliveredBy) groupUpdate.deliveredBy = arrayUnion(userId);
    if (needsGroupStatusUpgrade) groupUpdate.lastMessageStatus = 'delivered';
    if (Object.keys(groupUpdate).length > 0) {
      batch.update(groupRef, groupUpdate);
    }

    await batch.commit();
  } catch (err) {
    console.warn('Could not mark group messages as delivered:', err);
  }
}

/**
 * Mark group messages as read when a group member actively views the thread
 */
export async function markGroupMessagesAsRead(
  groupId: string,
  userId: string,
  messagesToRead: ChannelMessage[]
): Promise<void> {
  const eligible = messagesToRead.filter(
    (m) =>
      m.senderId !== userId &&
      (!m.readBy || !m.readBy.includes(userId))
  );

  if (eligible.length === 0 && messagesToRead.length === 0) {
    return;
  }

  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    const groupData = groupSnap.exists() ? groupSnap.data() : null;
    const viewedIds = new Set(messagesToRead.map((m) => m.id));
    const lastMsgId = typeof groupData?.lastMessageId === 'string' ? groupData.lastMessageId : undefined;
    const isLastMsgViewed = !lastMsgId || viewedIds.has(lastMsgId);

    const isUnreadForUser =
      isLastMsgViewed &&
      !!groupData &&
      Array.isArray(groupData.unreadBy) &&
      groupData.unreadBy.includes(userId);
    const shouldMarkLastMessageRead =
      isLastMsgViewed &&
      !!groupData &&
      groupData.lastMessageSenderId !== userId &&
      groupData.lastMessageStatus !== 'read';

    if (eligible.length === 0 && !isUnreadForUser && !shouldMarkLastMessageRead) {
      return;
    }

    const batch = writeBatch(db);
    if (isUnreadForUser || shouldMarkLastMessageRead) {
      const groupUpdate: Record<string, any> = {
        unreadBy: arrayRemove(userId),
        deliveredBy: arrayUnion(userId)
      };
      if (shouldMarkLastMessageRead) {
        groupUpdate.lastMessageStatus = 'read';
      }
      batch.update(groupRef, groupUpdate);
    }

    for (const msg of eligible) {
      const msgRef = doc(db, 'groups', groupId, 'messages', msg.id);
      batch.update(msgRef, {
        readBy: arrayUnion(userId),
        deliveredTo: arrayUnion(userId),
        status: 'read'
      });
    }

    await batch.commit();
  } catch (err) {
    console.warn('Could not mark group messages as read:', err);
  }
}
