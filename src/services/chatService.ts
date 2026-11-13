import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  UserProfile,
  ChatConversation,
  ChatMessage,
  HotspotReference,
  MessageAttachment,
  MessageReplyReference
} from '../types/chat';
import { sendUserNotification } from './userNotificationService';

// Generate a deterministic chat ID for two users so only one 1-on-1 thread exists
export function getDirectChatId(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * Get or create a 1-on-1 direct conversation between two users
 */
export async function getOrCreateDirectChat(
  currentUser: UserProfile,
  targetUser: UserProfile
): Promise<string> {
  const chatId = getDirectChatId(currentUser.uid, targetUser.uid);
  const chatRef = doc(db, 'chats', chatId);

  try {
    const participants: [string, string] = [currentUser.uid, targetUser.uid].sort() as [
      string,
      string
    ];

    const snap = await getDoc(chatRef);
    if (!snap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants,
        participantDetails: {
          [currentUser.uid]: {
            displayName: currentUser.displayName || 'Citizen',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            county: currentUser.county || 'Nairobi'
          },
          [targetUser.uid]: {
            displayName: targetUser.displayName || 'Citizen',
            email: targetUser.email || '',
            photoURL: targetUser.photoURL || '',
            county: targetUser.county || 'Nairobi'
          }
        },
        createdAt: serverTimestamp(),
        lastMessage: 'Conversation started',
        lastMessageSenderId: currentUser.uid,
        lastMessageTimestamp: serverTimestamp(),
        typingUsers: {}
      });
    }
    return chatId;
  } catch (error) {
    console.warn('Direct chat access note:', error);
    try {
      const participants: [string, string] = [currentUser.uid, targetUser.uid].sort() as [
        string,
        string
      ];
      await setDoc(chatRef, {
        id: chatId,
        participants,
        participantDetails: {
          [currentUser.uid]: {
            displayName: currentUser.displayName || 'Citizen',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            county: currentUser.county || 'Nairobi'
          },
          [targetUser.uid]: {
            displayName: targetUser.displayName || 'Citizen',
            email: targetUser.email || '',
            photoURL: targetUser.photoURL || '',
            county: targetUser.county || 'Nairobi'
          }
        },
        createdAt: serverTimestamp(),
        lastMessage: 'Conversation started',
        lastMessageSenderId: currentUser.uid,
        lastMessageTimestamp: serverTimestamp(),
        typingUsers: {}
      }, { merge: true });
    } catch (secondError) {
      console.warn('Direct chat set fallback note:', secondError);
    }
    return chatId;
  }
}

/**
 * Update user typing indicator in conversation
 */
export async function setTypingStatus(
  chatId: string,
  userId: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const chatRef = doc(db, 'chats', chatId);
  try {
    await updateDoc(chatRef, {
      [`typingUsers.${userId}`]: {
        isTyping,
        displayName,
        updatedAt: Date.now()
      }
    });
  } catch (error) {
    // Non-critical, ignore transient typing error
    console.warn('Could not update typing indicator:', error);
  }
}

/**
 * Send a message in a 1-on-1 chat
 */
export async function sendChatMessage(
  chatId: string,
  sender: UserProfile,
  recipientId: string,
  text: string,
  hotspotRef?: HotspotReference,
  mediaUrl?: string,
  attachment?: MessageAttachment,
  replyTo?: MessageReplyReference
): Promise<void> {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  const chatRef = doc(db, 'chats', chatId);

  const payload: any = {
    id: messageId,
    chatId,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || '',
    recipientId,
    text: text.trim().slice(0, 1000),
    status: 'sent',
    readBy: [sender.uid],
    deliveredTo: [sender.uid],
    createdAt: serverTimestamp()
  };

  if (hotspotRef) {
    payload.hotspotReference = {
      id: hotspotRef.id,
      name: hotspotRef.name,
      county: hotspotRef.county,
      town: hotspotRef.town,
      landmark: hotspotRef.landmark,
      ssid: hotspotRef.ssid,
      avgSpeedMbps: hotspotRef.avgSpeedMbps
    };
  }

  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
  }

  if (attachment) {
    payload.attachment = {
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
      dataUrl: attachment.dataUrl,
      isDocument: !!attachment.isDocument
    };
  }

  if (replyTo) {
    payload.replyTo = {
      messageId: replyTo.messageId,
      senderName: replyTo.senderName,
      senderId: replyTo.senderId,
      text: replyTo.text.slice(0, 200),
      hasAttachment: !!replyTo.hasAttachment,
      mediaUrl: replyTo.mediaUrl || ''
    };
  }

  try {
    // Write message
    await setDoc(messageRef, payload);

    // Update parent conversation's lastMessage
    let preview = text.trim().slice(0, 100);
    if (hotspotRef) {
      preview = `📍 Shared Hotspot: ${hotspotRef.name}`;
    } else if (attachment && !text.trim()) {
      preview = `📎 Attached file: ${attachment.name}`;
    } else if (mediaUrl && !text.trim()) {
      preview = '📷 Shared an image';
    } else if (mediaUrl) {
      preview = `📷 ${text.trim().slice(0, 80)}`;
    }

    await updateDoc(chatRef, {
      lastMessage: preview,
      lastMessageId: messageId,
      lastMessageSenderId: sender.uid,
      lastMessageStatus: 'sent',
      lastMessageTimestamp: serverTimestamp(),
      unreadBy: arrayUnion(recipientId),
      [`typingUsers.${sender.uid}`]: {
        isTyping: false,
        updatedAt: Date.now()
      }
    });

    // Send real-time notification to the recipient without revealing private message text
    if (recipientId && recipientId !== sender.uid) {
      sendUserNotification({
        userId: recipientId,
        category: 'direct_chat',
        type: 'direct_message',
        title: `Message from ${sender.displayName || 'Citizen'}`,
        message: 'New direct message',
        actorId: sender.uid,
        actorName: sender.displayName,
        actorPhoto: sender.photoURL,
        actorCounty: sender.county,
        details: chatId
      }).catch((err) => {
        console.warn('Could not dispatch message notification:', err);
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/messages/${messageId}`);
  }
}

const inFlightDeliveryChecks = new Set<string>();
const pendingDeliveryRechecks = new Set<string>();

/**
 * Automatically mark incoming unread messages as delivered when the recipient is online in the app
 * (even before opening the exact conversation thread)
 */
export async function markChatUnreadMessagesAsDelivered(
  chatId: string,
  recipientId: string
): Promise<void> {
  if (!chatId || !recipientId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const lockKey = `${chatId}:${recipientId}`;
  if (inFlightDeliveryChecks.has(lockKey)) {
    pendingDeliveryRechecks.add(lockKey);
    return;
  }
  inFlightDeliveryChecks.add(lockKey);

  try {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, where('recipientId', '==', recipientId));
    const snap = await getDocs(q);

    const undeliveredDocs = snap.docs.filter((docSnap) => {
      const d = docSnap.data();
      const deliveredTo: string[] = Array.isArray(d.deliveredTo) ? d.deliveredTo : [];
      return !deliveredTo.includes(recipientId) && d.status !== 'read';
    });

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const chatData = chatSnap.exists() ? chatSnap.data() : null;
    const shouldUpgradeConversationStatus =
      !!chatData &&
      chatData.lastMessageSenderId !== recipientId &&
      chatData.lastMessageStatus !== 'delivered' &&
      chatData.lastMessageStatus !== 'read';

    if (undeliveredDocs.length === 0 && !shouldUpgradeConversationStatus) {
      return;
    }

    const batch = writeBatch(db);
    for (const docSnap of undeliveredDocs) {
      batch.update(docSnap.ref, {
        deliveredTo: arrayUnion(recipientId),
        status: 'delivered'
      });
    }
    if (shouldUpgradeConversationStatus) {
      batch.update(chatRef, {
        lastMessageStatus: 'delivered'
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Could not mark background chat messages as delivered:', err);
  } finally {
    inFlightDeliveryChecks.delete(lockKey);
    if (pendingDeliveryRechecks.has(lockKey)) {
      pendingDeliveryRechecks.delete(lockKey);
      markChatUnreadMessagesAsDelivered(chatId, recipientId);
    }
  }
}

/**
 * Mark messages as delivered
 */
export async function markMessagesAsDelivered(
  chatId: string,
  recipientId: string,
  messagesToDeliver: ChatMessage[]
): Promise<void> {
  const eligible = messagesToDeliver.filter(
    (m) =>
      m.recipientId === recipientId &&
      (!m.deliveredTo || !m.deliveredTo.includes(recipientId))
  );

  if (eligible.length === 0) return;

  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const chatData = chatSnap.exists() ? chatSnap.data() : null;

    const batch = writeBatch(db);
    for (const msg of eligible) {
      const msgRef = doc(db, 'chats', chatId, 'messages', msg.id);
      batch.update(msgRef, {
        deliveredTo: arrayUnion(recipientId),
        status: msg.status === 'read' ? 'read' : 'delivered'
      });
    }
    if (
      chatData &&
      chatData.lastMessageSenderId !== recipientId &&
      (!chatData.lastMessageStatus || chatData.lastMessageStatus === 'sent')
    ) {
      batch.update(chatRef, {
        lastMessageStatus: 'delivered'
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Could not mark messages as delivered:', err);
  }
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  chatId: string,
  recipientId: string,
  messagesToRead: ChatMessage[]
): Promise<void> {
  const eligible = messagesToRead.filter(
    (m) =>
      m.recipientId === recipientId &&
      (!m.readBy || !m.readBy.includes(recipientId))
  );

  if (eligible.length === 0 && messagesToRead.length === 0) {
    return;
  }

  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const chatData = chatSnap.exists() ? chatSnap.data() : null;
    const viewedIds = new Set(messagesToRead.map((m) => m.id));
    const lastMsgId = typeof chatData?.lastMessageId === 'string' ? chatData.lastMessageId : undefined;
    const isLastMsgViewed = !lastMsgId || viewedIds.has(lastMsgId);

    const isConversationUnreadForUser =
      isLastMsgViewed &&
      !!chatData &&
      Array.isArray(chatData.unreadBy) &&
      chatData.unreadBy.includes(recipientId);
    const shouldMarkLastMessageRead =
      isLastMsgViewed &&
      !!chatData &&
      chatData.lastMessageSenderId !== recipientId &&
      chatData.lastMessageStatus !== 'read';

    if (eligible.length === 0 && !isConversationUnreadForUser && !shouldMarkLastMessageRead) {
      return;
    }

    const batch = writeBatch(db);
    if (isConversationUnreadForUser || shouldMarkLastMessageRead) {
      const chatUpdate: Record<string, any> = {
        unreadBy: arrayRemove(recipientId)
      };
      if (shouldMarkLastMessageRead) {
        chatUpdate.lastMessageStatus = 'read';
      }
      batch.update(chatRef, chatUpdate);
    }

    for (const msg of eligible) {
      const msgRef = doc(db, 'chats', chatId, 'messages', msg.id);
      batch.update(msgRef, {
        readBy: arrayUnion(recipientId),
        deliveredTo: arrayUnion(recipientId),
        status: 'read'
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Could not mark messages as read:', err);
  }
}

/**
 * Edit an existing sent message
 */
export async function editChatMessage(
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  try {
    await updateDoc(messageRef, {
      text: newText.trim().slice(0, 1000),
      isEdited: true,
      editedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

/**
 * Delete a message for everyone
 */
export async function deleteMessageForEveryone(
  chatId: string,
  messageId: string
): Promise<void> {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  try {
    await updateDoc(messageRef, {
      isDeletedForEveryone: true,
      text: 'This message was deleted',
      mediaUrl: '',
      attachment: {}
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

/**
 * Delete a message for me (local delete)
 */
export async function deleteMessageForMe(
  chatId: string,
  messageId: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  try {
    await updateDoc(messageRef, {
      deletedForUsers: arrayUnion(userId)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

/**
 * Subscribe to all 1-on-1 chats for the current user in real-time
 */
export function subscribeToUserChats(
  userId: string,
  callback: (chats: ChatConversation[]) => void
): () => void {
  const path = 'chats';
  const q = query(
    collection(db, path),
    where('participants', 'array-contains', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chats: ChatConversation[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          participants: d.participants as [string, string],
          participantDetails: d.participantDetails,
          lastMessage: d.lastMessage,
          lastMessageId: d.lastMessageId || undefined,
          lastMessageSenderId: d.lastMessageSenderId,
          lastMessageStatus: d.lastMessageStatus || undefined,
          lastMessageTimestamp: d.lastMessageTimestamp?.toDate
            ? d.lastMessageTimestamp.toDate().toISOString()
            : undefined,
          typingUsers: d.typingUsers || {},
          unreadBy: Array.isArray(d.unreadBy) ? d.unreadBy : [],
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });

      // Sort chats by most recent message
      chats.sort((a, b) => {
        const timeA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
        const timeB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
        return timeB - timeA;
      });

      callback(chats);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Subscribe to messages for a specific conversation in real-time
 */
export function subscribeToChatMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const path = `chats/${chatId}/messages`;
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          chatId: d.chatId,
          senderId: d.senderId,
          senderName: d.senderName,
          senderPhoto: d.senderPhoto,
          recipientId: d.recipientId,
          text: d.text,
          mediaUrl: d.mediaUrl || undefined,
          attachment: d.attachment && d.attachment.name ? d.attachment : undefined,
          hotspotReference: d.hotspotReference,
          replyTo: d.replyTo && d.replyTo.messageId ? d.replyTo : undefined,
          status: d.status || 'sent',
          readBy: d.readBy || [],
          deliveredTo: d.deliveredTo || [],
          isEdited: !!d.isEdited,
          editedAt: d.editedAt?.toDate ? d.editedAt.toDate().toISOString() : undefined,
          isDeletedForEveryone: !!d.isDeletedForEveryone,
          deletedForUsers: d.deletedForUsers || [],
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()
        };
      });
      callback(messages);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Determine if a user is currently considered online with a grace period for heartbeats
 */
export function isUserOnline(isOnline?: boolean, lastSeenIso?: string): boolean {
  if (!isOnline) return false;
  if (!lastSeenIso) return !!isOnline;
  try {
    const diffMs = Date.now() - new Date(lastSeenIso).getTime();
    // Consider active if heartbeat was within the last 2.5 minutes (150 seconds)
    return diffMs >= 0 && diffMs < 150000;
  } catch {
    return !!isOnline;
  }
}

/**
 * Format user's last online presence timestamp cleanly for chats
 */
export function formatLastSeen(lastSeenIso?: string, isOnline?: boolean): string {
  if (isOnline) {
    return 'Online now';
  }
  if (!lastSeenIso) {
    return 'Offline';
  }
  try {
    const lastSeenDate = new Date(lastSeenIso);
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    if (isNaN(diffMs) || diffMs < 0) {
      return 'Offline';
    }
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) {
      return 'Last seen just now';
    }
    if (diffMinutes < 60) {
      return `Last seen ${diffMinutes}m ago`;
    }
    if (diffHours < 24) {
      const isToday = lastSeenDate.toDateString() === now.toDateString();
      const timeStr = lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isToday) {
        return `Last seen today at ${timeStr}`;
      }
      return `Last seen ${diffHours}h ago`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = lastSeenDate.toDateString() === yesterday.toDateString();
    const timeStr = lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) {
      return `Last seen yesterday at ${timeStr}`;
    }
    if (diffDays < 7) {
      return `Last seen ${diffDays}d ago at ${timeStr}`;
    }
    const dateStr = lastSeenDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `Last seen on ${dateStr}`;
  } catch {
    return 'Offline';
  }
}

/**
 * Real-time subscription to a specific user's online and last seen status
 */
export function subscribeToUserPresence(
  userId: string,
  callback: (presence: { isOnline: boolean; lastSeen?: string; lastSeenText: string }) => void
): () => void {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) {
        callback({ isOnline: false, lastSeenText: 'Offline' });
        return;
      }
      const data = snap.data();
      const lastSeenIso = data.lastSeen?.toDate
        ? data.lastSeen.toDate().toISOString()
        : typeof data.lastSeen === 'string'
        ? data.lastSeen
        : undefined;
      const online = isUserOnline(!!data.isOnline, lastSeenIso);
      const text = formatLastSeen(lastSeenIso, online);
      callback({
        isOnline: online,
        lastSeen: lastSeenIso,
        lastSeenText: text
      });
    },
    (err) => {
      console.warn('Presence subscription note:', err);
    }
  );
}

/**
 * Update user's presence state in Firestore
 */
export async function updateUserPresence(
  userId: string,
  isOnline: boolean
): Promise<void> {
  if (!userId) return;
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      isOnline,
      lastSeen: serverTimestamp()
    });
  } catch (err) {
    // Non-fatal presence update
  }
}

const DEVELOPER_EMAIL = 'muriithipeterkangethe237@gmail.com';

/**
 * Check if a user is the platform developer
 */
export function isDeveloperAccount(email?: string, isDev?: boolean): boolean {
  if (isDev) return true;
  if (!email) return false;
  return email.toLowerCase().trim() === DEVELOPER_EMAIL.toLowerCase().trim();
}

/**
 * Subscribe to a lightweight presence map for all users (used to render accurate online/delivered ticks in all inboxes)
 */
export function subscribeToAllUserPresenceMap(
  callback: (presenceMap: Record<string, { isOnline: boolean; lastSeen?: string }>) => void
): () => void {
  const path = 'users';
  const q = query(collection(db, path));

  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, { isOnline: boolean; lastSeen?: string }> = {};
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const lastSeenIso = d.lastSeen?.toDate
          ? d.lastSeen.toDate().toISOString()
          : typeof d.lastSeen === 'string'
          ? d.lastSeen
          : undefined;
        map[docSnap.id] = {
          isOnline: isUserOnline(!!d.isOnline, lastSeenIso),
          lastSeen: lastSeenIso
        };
      }
      callback(map);
    },
    (error) => {
      console.warn('Presence map subscription notice:', error);
    }
  );
}

/**
 * Subscribe to community members registered in TUJUANE.
 * By default, hides the platform developer account from public citizen views.
 */
export function subscribeToCommunityUsers(
  currentUserId: string,
  callback: (users: UserProfile[]) => void,
  includeDeveloper: boolean = false
): () => void {
  const path = 'users';
  const q = query(collection(db, path));

  return onSnapshot(
    q,
    (snapshot) => {
      const users: UserProfile[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const lastSeenIso = d.lastSeen?.toDate
            ? d.lastSeen.toDate().toISOString()
            : typeof d.lastSeen === 'string'
            ? d.lastSeen
            : undefined;
          const online = isUserOnline(!!d.isOnline, lastSeenIso);
          const email = d.email || '';
          const isDev = d.isDeveloper !== undefined ? Boolean(d.isDeveloper) : isDeveloperAccount(email);

          return {
            uid: docSnap.id,
            displayName: d.displayName || 'TUJUANE Member',
            email,
            photoURL: d.photoURL || undefined,
            county: d.county || 'Nairobi',
            constituency: d.constituency || undefined,
            bio: d.bio || undefined,
            occupation: d.occupation || undefined,
            isOnline: online,
            lastSeen: lastSeenIso,
            blockedUserIds: Array.isArray(d.blockedUserIds) ? d.blockedUserIds : [],
            mutedUserIds: Array.isArray(d.mutedUserIds) ? d.mutedUserIds : [],
            isDeveloper: isDev,
            accountStatus: (d.accountStatus as 'active' | 'suspended' | 'banned') || 'active',
            suspendedUntil: d.suspendedUntil?.toDate
              ? d.suspendedUntil.toDate().toISOString()
              : typeof d.suspendedUntil === 'string'
              ? d.suspendedUntil
              : undefined,
            banReason: d.banReason || undefined,
            statusUpdatedAt: d.statusUpdatedAt?.toDate
              ? d.statusUpdatedAt.toDate().toISOString()
              : typeof d.statusUpdatedAt === 'string'
              ? d.statusUpdatedAt
              : undefined,
            statusUpdatedBy: d.statusUpdatedBy || undefined,
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()
          };
        })
        .filter((u) => {
          // If developer views directory in developer control panel, they see all citizens
          if (includeDeveloper) {
            return true;
          }
          // For regular citizens: hide developer account and self
          if (u.uid === currentUserId) return false;
          if (isDeveloperAccount(u.email, u.isDeveloper)) return false;
          return true;
        });

      callback(users);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Update a citizen's account status (Active, Suspended, or Banned).
 * Restricted to developer/admin access.
 */
export async function updateCitizenAccountStatus(
  targetUserId: string,
  status: 'active' | 'suspended' | 'banned',
  reason?: string,
  suspendedUntil?: string,
  moderatorEmail: string = DEVELOPER_EMAIL
): Promise<void> {
  const userRef = doc(db, 'users', targetUserId);
  const payload: Record<string, any> = {
    accountStatus: status,
    banReason: status === 'active' ? '' : (reason || 'Community safety standards violation'),
    statusUpdatedAt: serverTimestamp(),
    statusUpdatedBy: moderatorEmail
  };

  if (status === 'suspended' && suspendedUntil) {
    payload.suspendedUntil = suspendedUntil;
  } else {
    payload.suspendedUntil = '';
  }

  try {
    await updateDoc(userRef, payload);

    // Send disciplinary or reinstatement notification to the user
    let title = 'Account Status Notice';
    let message = '';
    let notifStatus: 'good' | 'warning' | 'restricted' = 'good';

    if (status === 'banned') {
      title = '⛔ Account Permanently Banned';
      message = `Your account has been permanently restricted from TUJUANE due to serious violations: ${reason || 'Violation of community safety terms'}.`;
      notifStatus = 'restricted';
    } else if (status === 'suspended') {
      const untilDateStr = suspendedUntil ? new Date(suspendedUntil).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'temporary duration';
      title = '⚠️ Account Suspended';
      message = `Your account has been suspended until ${untilDateStr}. Reason: ${reason || 'Community standards violation'}. During suspension, posting, commenting, and chatting are disabled.`;
      notifStatus = 'restricted';
    } else {
      title = '✅ Account Reinstated';
      message = 'Your TUJUANE account standing has been restored to Active. You can now post, chat, and participate in community activities.';
      notifStatus = 'good';
    }

    await sendUserNotification({
      userId: targetUserId,
      category: 'account_status',
      type: status === 'active' ? 'account_good_standing' : 'account_warning',
      title,
      message,
      accountStatus: notifStatus
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
  }
}


