export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  county?: string;
  constituency?: string;
  bio?: string;
  occupation?: string;
  isOnline?: boolean;
  lastSeen?: string;
  blockedUserIds?: string[];
  mutedUserIds?: string[];
  isDeveloper?: boolean;
  accountStatus?: 'active' | 'suspended' | 'banned';
  suspendedUntil?: string;
  banReason?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  createdAt: string;
}


export interface HotspotReference {
  id: string;
  name: string;
  county: string;
  town: string;
  landmark: string;
  ssid: string;
  avgSpeedMbps: number;
}

export interface MessageAttachment {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  isDocument?: boolean;
}

export interface MessageReplyReference {
  messageId: string;
  senderName: string;
  senderId: string;
  text: string;
  hasAttachment?: boolean;
  mediaUrl?: string;
}

export interface ChatConversation {
  id: string;
  participants: [string, string];
  participantDetails?: Record<
    string,
    {
      displayName: string;
      email?: string;
      photoURL?: string;
      county?: string;
    }
  >;
  lastMessage?: string;
  lastMessageId?: string;
  lastMessageSenderId?: string;
  lastMessageStatus?: MessageStatus;
  lastMessageTimestamp?: string;
  typingUsers?: Record<
    string,
    {
      isTyping: boolean;
      displayName?: string;
      updatedAt?: number;
    }
  >;
  unreadBy?: string[];
  createdAt: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  recipientId: string;
  text: string;
  mediaUrl?: string; // compressed base64 image data URI
  attachment?: MessageAttachment; // generic document/file attachment
  hotspotReference?: HotspotReference;
  replyTo?: MessageReplyReference;
  status?: MessageStatus;
  readBy?: string[];
  deliveredTo?: string[];
  isEdited?: boolean;
  editedAt?: string;
  isDeletedForEveryone?: boolean;
  deletedForUsers?: string[];
  createdAt: string;
}

export interface CommunityChannel {
  id: string;
  name: string;
  description: string;
  category: 'county' | 'topic' | 'campus' | 'hustle' | 'announcements';
  countyScope?: string;
  icon: string;
  memberCount: number;
  lastMessage?: string;
  lastMessageSenderName?: string;
  lastMessageTimestamp?: string;
  isOfficial?: boolean;
}

export interface GroupChat {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  creatorName: string;
  icon?: string;
  county?: string;
  members: string[]; // user UIDs
  admins: string[];
  memberDetails?: Record<
    string,
    {
      displayName: string;
      photoURL?: string;
      county?: string;
    }
  >;
  lastMessage?: string;
  lastMessageId?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageStatus?: MessageStatus;
  lastMessageTimestamp?: string;
  unreadBy?: string[];
  deliveredBy?: string[];
  isPublic?: boolean;
  createdAt: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  senderCounty?: string;
  text: string;
  mediaUrl?: string;
  attachment?: MessageAttachment;
  replyTo?: MessageReplyReference;
  status?: MessageStatus;
  readBy?: string[];
  deliveredTo?: string[];
  upvotes?: number;
  isEdited?: boolean;
  editedAt?: string;
  createdAt: string;
}

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'direct_chat' | 'channel' | 'group' | 'mention';
  sourceId: string;
  sourceName: string;
  read: boolean;
}


