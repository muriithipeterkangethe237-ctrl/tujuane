import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ChatConversation,
  ChatMessage,
  UserProfile,
  MessageAttachment,
  MessageReplyReference,
  CommunityChannel,
  GroupChat,
  ChannelMessage,
  InAppNotification
} from '../../types/chat';
import {
  getOrCreateDirectChat,
  subscribeToUserChats,
  subscribeToChatMessages,
  sendChatMessage,
  subscribeToCommunityUsers,
  setTypingStatus,
  markMessagesAsRead,
  markMessagesAsDelivered,
  editChatMessage,
  deleteMessageForEveryone,
  deleteMessageForMe,
  isUserOnline,
  formatLastSeen,
  subscribeToUserPresence
} from '../../services/chatService';
import {
  DEFAULT_CHANNELS,
  subscribeToChannelMessages,
  sendChannelMessage,
  createGroupChat,
  subscribeToGroups,
  joinGroupChat,
  subscribeToGroupMessages,
  sendGroupMessage
} from '../../services/groupChannelService';
import { notificationService } from '../../services/notificationService';
import {
  MessageSquare,
  Send,
  Search,
  MapPin,
  Clock,
  Users,
  ChevronLeft,
  ShieldCheck,
  Check,
  CheckCheck,
  LogOut,
  X,
  Image as ImageIcon,
  Download,
  Paperclip,
  FileText,
  CornerUpLeft,
  CornerUpRight,
  Share2,
  Edit2,
  Trash2,
  MoreVertical,
  Copy,
  Ban,
  FileSpreadsheet,
  AlertCircle,
  Hash,
  Plus,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Globe,
  Sparkles,
  UserPlus,
  Flag
} from 'lucide-react';
import { compressImage } from '../../utils/imageCompressor';
import { ALL_47_COUNTIES, getConstituenciesByCounty } from '../../data/kenyaCounties';
import { ReportModal } from '../ReportModal';

interface CommunityChatHubProps {
  directChatTargetUser?: UserProfile | null;
  onClearDirectChatTargetUser?: () => void;
  onViewUserProfile?: (user: UserProfile) => void;
  onThreadStateChange?: (isOpen: boolean) => void;
}


function formatBytes(bytes: number, decimals = 1): string {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const CommunityChatHub: React.FC<CommunityChatHubProps> = ({
  directChatTargetUser = null,
  onClearDirectChatTargetUser,
  onViewUserProfile,
  onThreadStateChange
}) => {

  const {
    currentUser,
    userProfile,
    loginWithGoogle,
    logout,
    updateUserLocation,
    updateUserCounty,
    blockedUserIds,
    mutedUserIds,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser
  } = useAuth();

  // Primary navigation tabs: Direct 1-on-1, Channels, Groups, Members
  const [activeTab, setActiveTab] = useState<'direct' | 'channels' | 'groups' | 'members'>('direct');

  // Active chat session modes
  const [activeChatMode, setActiveChatMode] = useState<'direct' | 'channel' | 'group'>('direct');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activePartner, setActivePartner] = useState<UserProfile | null>(null);

  // Safety & moderation actions for Direct Chat
  const [isDirectActionMenuOpen, setIsDirectActionMenuOpen] = useState(false);
  const [isDirectReportModalOpen, setIsDirectReportModalOpen] = useState(false);
  const [directUserToBlock, setDirectUserToBlock] = useState<{ id: string; name: string } | null>(null);
  const [isBlockInProgress, setIsBlockInProgress] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState<{
    isOnline: boolean;
    lastSeen?: string;
    lastSeenText: string;
  }>({ isOnline: false, lastSeenText: 'Offline' });
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);

  // Data states
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [directMessages, setDirectMessages] = useState<ChatMessage[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChannelMessage[]>([]);
  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>([]);
  const [communityGroups, setCommunityGroups] = useState<GroupChat[]>([]);
  const [channels] = useState<CommunityChannel[]>(DEFAULT_CHANNELS);

  // Notifications state
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isNotificationsMenuOpen, setIsNotificationsMenuOpen] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>('default');
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('tujuane_sound_muted') === 'true'
      : false;
  });
  const [showPermissionPromptBanner, setShowPermissionPromptBanner] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default';
  });

  // Input & message management states
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<MessageAttachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);

  // Message Management (Reply, Edit, Delete, Forward, Long-press menu)
  const [replyingToMessage, setReplyingToMessage] = useState<any | null>(null);
  const [editingMessage, setEditingMessage] = useState<any | null>(null);
  const [openMenuMessageId, setOpenMenuMessageId] = useState<string | null>(null);
  const [actionModalMessage, setActionModalMessage] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardTab, setForwardTab] = useState<'citizens' | 'channels' | 'groups'>('citizens');
  const [isForwardingSending, setIsForwardingSending] = useState(false);
  const [chatToast, setChatToast] = useState<string | null>(null);

  const showChatToast = (msg: string) => {
    setChatToast(msg);
    setTimeout(() => setChatToast(null), 3000);
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    message: ChatMessage;
    type: 'forEveryone' | 'forMe';
  } | null>(null);

  // Modal States
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupCounty, setNewGroupCounty] = useState('Nairobi');
  const [newGroupIcon, setNewGroupIcon] = useState('👥');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // County & Constituency selection modal
  const [isCountyPickerOpen, setIsCountyPickerOpen] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState<string>(userProfile?.county || 'Nairobi');
  const [selectedConstituency, setSelectedConstituency] = useState<string>(userProfile?.constituency || '');

  // Keep state in sync with loaded userProfile
  useEffect(() => {
    if (userProfile) {
      setSelectedCounty(userProfile.county || 'Nairobi');
      setSelectedConstituency(userProfile.constituency || '');
    }
  }, [userProfile]);

  const availableConstituencies = useMemo(() => {
    return getConstituenciesByCounty(selectedCounty);
  }, [selectedCounty]);

  // Highlighted message
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) setLightboxImage(null);
        if (isCreateGroupModalOpen) setIsCreateGroupModalOpen(false);
        if (deleteConfirmation) setDeleteConfirmation(null);
        if (isCountyPickerOpen) setIsCountyPickerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, isCreateGroupModalOpen, deleteConfirmation, isCountyPickerOpen]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isUserTypingRef = useRef<boolean>(false);

  const groupIcons = ['👥', '💻', '🎓', '⚽', '🚀', '💼', '💡', '🎵', '🚜', '☕', '🏠', '🇰🇪'];

  // Track desktop push permission status
  useEffect(() => {
    setDesktopPermission(notificationService.getPermissionStatus());
    const unsub = notificationService.subscribe((list) => {
      setNotifications(list);
    });
    return () => unsub();
  }, []);

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Current active 1-on-1 conversation
  const currentConversation = useMemo(() => {
    if (activeChatMode !== 'direct') return null;
    return conversations.find((c) => c.id === activeChatId);
  }, [conversations, activeChatId, activeChatMode]);

  // Partner typing indicator
  const isPartnerTyping = useMemo(() => {
    if (activeChatMode !== 'direct' || !activePartner || !currentConversation?.typingUsers) {
      return false;
    }
    const typingInfo = currentConversation.typingUsers[activePartner.uid];
    if (!typingInfo || !typingInfo.isTyping) return false;
    if (typingInfo.updatedAt && Date.now() - typingInfo.updatedAt > 6000) return false;
    return true;
  }, [currentConversation, activePartner, activeChatMode]);

  // Direct messages filtered by user deletion
  const visibleDirectMessages = useMemo(() => {
    if (!currentUser) return directMessages;
    return directMessages.filter(
      (m) => !m.deletedForUsers || !m.deletedForUsers.includes(currentUser.uid)
    );
  }, [directMessages, currentUser]);

  // If a direct chat target was passed, initiate automatically
  useEffect(() => {
    if (directChatTargetUser && (userProfile || currentUser)) {
      handleStartDirectChat(directChatTargetUser);
      if (onClearDirectChatTargetUser) onClearDirectChatTargetUser();
    }
  }, [directChatTargetUser, userProfile, currentUser]);

  // Real-time subscription to active direct chat partner presence & last seen
  useEffect(() => {
    if (activeChatMode !== 'direct' || !activePartner?.uid) {
      setPartnerPresence({ isOnline: false, lastSeenText: 'Offline' });
      return;
    }

    // Subscribe to live partner presence in Firestore
    const unsub = subscribeToUserPresence(activePartner.uid, (presence) => {
      setPartnerPresence(presence);
    });

    return () => unsub();
  }, [activePartner?.uid, activeChatMode]);

  // Subscribe to user conversations
  useEffect(() => {
    if (!currentUser) {
      setConversations([]);
      return;
    }
    const unsub = subscribeToUserChats(currentUser.uid, (userChats) => {
      setConversations(userChats);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to community members
  useEffect(() => {
    if (!currentUser) {
      setCommunityUsers([]);
      return;
    }
    const unsub = subscribeToCommunityUsers(currentUser.uid, (users) => {
      setCommunityUsers(users);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to community groups
  useEffect(() => {
    if (!currentUser) {
      setCommunityGroups([]);
      return;
    }
    const unsub = subscribeToGroups(currentUser.uid, (grps) => {
      setCommunityGroups(grps);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to direct messages in active direct chat
  useEffect(() => {
    if (activeChatMode !== 'direct' || !activeChatId) {
      setDirectMessages([]);
      return;
    }
    const unsub = subscribeToChatMessages(activeChatId, (msgs) => {
      // Check if new message arrived from partner to trigger notification
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (
          currentUser &&
          lastMsg.senderId !== currentUser.uid &&
          Date.now() - new Date(lastMsg.createdAt).getTime() < 3000
        ) {
          // Suppress notification if user is muted or blocked
          if (!mutedUserIds.includes(lastMsg.senderId) && !blockedUserIds.includes(lastMsg.senderId)) {
            notificationService.notify({
              title: `Message from ${lastMsg.senderName || 'TUJUANE Member'}`,
              body: lastMsg.text || 'Shared a media attachment',
              type: 'direct_chat',
              sourceId: activeChatId,
              sourceName: lastMsg.senderName || 'Direct Chat'
            });
          }
        }
      }

      setDirectMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);

      // Auto-mark incoming messages as read & delivered
      if (currentUser) {
        markMessagesAsDelivered(activeChatId, currentUser.uid, msgs);
        markMessagesAsRead(activeChatId, currentUser.uid, msgs);
      }
    });
    return () => unsub();
  }, [activeChatId, activeChatMode, currentUser]);

  // Subscribe to active channel messages
  useEffect(() => {
    if (activeChatMode !== 'channel' || !activeChannel) {
      setChannelMessages([]);
      return;
    }
    const unsub = subscribeToChannelMessages(activeChannel.id, (msgs) => {
      setChannelMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });
    return () => unsub();
  }, [activeChannel, activeChatMode]);

  // Subscribe to active group messages
  useEffect(() => {
    if (activeChatMode !== 'group' || !activeGroup) {
      setGroupMessages([]);
      return;
    }
    const unsub = subscribeToGroupMessages(activeGroup.id, (msgs) => {
      setGroupMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });
    return () => unsub();
  }, [activeGroup, activeChatMode]);

  // Close menus on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenMenuMessageId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Request browser push notification permission
  const handleEnablePushNotifications = async () => {
    const status = await notificationService.requestDesktopPermission();
    setDesktopPermission(status);
    setShowPermissionPromptBanner(false);
    if (status === 'granted') {
      notificationService.notify({
        title: 'TUJUANE Kenya Notifications Enabled!',
        body: 'You will receive real-time alerts for direct chats, channels, and group mentions.',
        type: 'direct_chat',
        sourceId: 'system',
        sourceName: 'TUJUANE'
      });
    }
  };

  // Toggle notification sound
  const handleToggleSound = () => {
    const nextState = !isSoundMuted;
    setIsSoundMuted(nextState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tujuane_sound_muted', String(nextState));
    }
    if (!nextState) {
      notificationService.playChime();
    }
  };

  // Handle typing debounce for direct chat
  const handleInputChange = (val: string) => {
    setMessageInput(val);
    if (activeChatMode !== 'direct' || !activeChatId || !currentUser || !userProfile || editingMessage) {
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!isUserTypingRef.current && val.trim().length > 0) {
      isUserTypingRef.current = true;
      setTypingStatus(activeChatId, currentUser.uid, userProfile.displayName, true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isUserTypingRef.current) {
        isUserTypingRef.current = false;
        setTypingStatus(activeChatId, currentUser.uid, userProfile.displayName, false);
      }
    }, 2500);
  };

  // Open direct chat
  const handleStartDirectChat = async (targetUser: UserProfile, existingChatId?: string) => {
    const sender = userProfile || (currentUser ? {
      uid: currentUser.uid,
      displayName: currentUser.displayName || 'Citizen Member',
      email: currentUser.email || '',
      photoURL: currentUser.photoURL || undefined,
      county: 'Nairobi',
      createdAt: new Date().toISOString()
    } : null);

    if (!sender) return;
    if (sender.uid === targetUser.uid) {
      console.warn('Cannot open direct chat with yourself');
      return;
    }

    try {
      setActivePartner(targetUser);
      setActiveChannel(null);
      setActiveGroup(null);
      setActiveChatMode('direct');
      if (existingChatId) {
        setActiveChatId(existingChatId);
      }
      const chatId = existingChatId || await getOrCreateDirectChat(sender, targetUser);
      if (chatId) {
        setActiveChatId(chatId);
      }
      setActiveTab('direct');
    } catch (err) {
      console.error('Failed to open chat:', err);
    }
  };


  // Select channel
  const handleSelectChannel = (channel: CommunityChannel) => {
    setActiveChannel(channel);
    setActivePartner(null);
    setActiveGroup(null);
    setActiveChatId(null);
    setActiveChatMode('channel');
    setReplyingToMessage(null);
    setEditingMessage(null);
  };

  // Select group
  const handleSelectGroup = (group: GroupChat) => {
    setActiveGroup(group);
    setActivePartner(null);
    setActiveChannel(null);
    setActiveChatId(null);
    setActiveChatMode('group');
    setReplyingToMessage(null);
    setEditingMessage(null);
  };

  // Join group
  const handleJoinGroup = async (group: GroupChat) => {
    if (!userProfile) return;
    try {
      await joinGroupChat(group.id, userProfile);
      setActiveGroup({
        ...group,
        members: [...group.members, userProfile.uid]
      });
      notificationService.playChime();
    } catch (err) {
      console.error('Failed to join group:', err);
    }
  };

  // Create a new group
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !newGroupName.trim()) return;

    setIsCreatingGroup(true);
    try {
      const groupId = await createGroupChat(userProfile, {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        county: newGroupCounty,
        icon: newGroupIcon,
        isPublic: true
      });

      const newGroupObj: GroupChat = {
        id: groupId,
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        creatorId: userProfile.uid,
        creatorName: userProfile.displayName,
        icon: newGroupIcon,
        county: newGroupCounty,
        members: [userProfile.uid],
        admins: [userProfile.uid],
        isPublic: true,
        createdAt: new Date().toISOString()
      };

      setIsCreateGroupModalOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      handleSelectGroup(newGroupObj);
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Image selection
  const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setIsCompressingImage(true);
    try {
      const result = await compressImage(file, 900, 0.75);
      setAttachedImage(result.dataUrl);
      setAttachedFile(null);
    } catch (err) {
      console.error('Failed to compress chat image:', err);
      setFileError('Could not optimize image. Please select a valid photo.');
    } finally {
      setIsCompressingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Document / file selection
  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (file.size > 400 * 1024) {
      setFileError(`File "${file.name}" is ${formatBytes(file.size)}. Max size is 400 KB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl: reader.result as string,
        isDocument: true
      });
      setAttachedImage(null);
    };
    reader.onerror = () => {
      setFileError('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Dispatch message sending (Direct, Channel, or Group)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    if (userProfile.accountStatus === 'banned') {
      setChatToast(`⛔ Account permanently banned: ${userProfile.banReason || 'Policy violation'}`);
      setTimeout(() => setChatToast(null), 4000);
      return;
    }
    if (userProfile.accountStatus === 'suspended' && (!userProfile.suspendedUntil || new Date(userProfile.suspendedUntil).getTime() > Date.now())) {
      const untilStr = userProfile.suspendedUntil ? new Date(userProfile.suspendedUntil).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'temporary duration';
      setChatToast(`⚠️ Account suspended until ${untilStr}: ${userProfile.banReason || 'Policy violation'}`);
      setTimeout(() => setChatToast(null), 4000);
      return;
    }

    // Reset typing status for direct chats
    if (activeChatMode === 'direct' && activeChatId) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isUserTypingRef.current) {
        isUserTypingRef.current = false;
        setTypingStatus(activeChatId, currentUser.uid, userProfile.displayName, false);
      }
    }

    // Direct chat edit
    if (activeChatMode === 'direct' && editingMessage) {
      if (!messageInput.trim() || !activeChatId) return;
      setIsSending(true);
      try {
        await editChatMessage(activeChatId, editingMessage.id, messageInput.trim());
        setEditingMessage(null);
        setMessageInput('');
      } catch (err) {
        console.error('Error updating message:', err);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Content check
    if (!messageInput.trim() && !attachedImage && !attachedFile) return;

    let textToSend = messageInput.trim();
    if (!textToSend) {
      if (attachedImage) textToSend = '📷 Photo';
      else if (attachedFile) textToSend = `📎 ${attachedFile.name}`;
    }

    const imageToSend = attachedImage;
    const fileToSend = attachedFile;
    const replyToSend: MessageReplyReference | undefined = replyingToMessage
      ? {
          messageId: replyingToMessage.id,
          senderName:
            replyingToMessage.senderId === currentUser.uid
              ? 'You'
              : replyingToMessage.senderName || 'Member',
          senderId: replyingToMessage.senderId,
          text: replyingToMessage.text || '',
          hasAttachment: !!(replyingToMessage.attachment || replyingToMessage.mediaUrl),
          mediaUrl: replyingToMessage.mediaUrl
        }
      : undefined;

    setMessageInput('');
    setAttachedImage(null);
    setAttachedFile(null);
    setReplyingToMessage(null);

    setIsSending(true);
    try {
      if (activeChatMode === 'direct' && activeChatId && activePartner) {
        await sendChatMessage(
          activeChatId,
          userProfile,
          activePartner.uid,
          textToSend,
          undefined,
          imageToSend || undefined,
          fileToSend || undefined,
          replyToSend
        );
      } else if (activeChatMode === 'channel' && activeChannel) {
        await sendChannelMessage(
          activeChannel.id,
          userProfile,
          textToSend,
          imageToSend || undefined,
          fileToSend || undefined,
          replyToSend
        );
      } else if (activeChatMode === 'group' && activeGroup) {
        await sendGroupMessage(
          activeGroup.id,
          userProfile,
          textToSend,
          imageToSend || undefined,
          fileToSend || undefined,
          replyToSend
        );
      }
      notificationService.playChime();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleStartEdit = (msg: any) => {
    setEditingMessage(msg);
    setMessageInput(msg.text);
    setReplyingToMessage(null);
    setOpenMenuMessageId(null);
    setTimeout(() => messageInputRef.current?.focus(), 50);
  };

  const handleStartReply = (msg: any) => {
    setReplyingToMessage(msg);
    setEditingMessage(null);
    setOpenMenuMessageId(null);
    setTimeout(() => messageInputRef.current?.focus(), 50);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setOpenMenuMessageId(null);
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation || !activeChatId || !currentUser) return;
    const { message, type } = deleteConfirmation;

    try {
      if (type === 'forEveryone') {
        await deleteMessageForEveryone(activeChatId, message.id);
      } else {
        await deleteMessageForMe(activeChatId, message.id, currentUser.uid);
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    } finally {
      setDeleteConfirmation(null);
      setOpenMenuMessageId(null);
    }
  };

  const handleSaveCounty = async () => {
    try {
      await updateUserLocation(selectedCounty, selectedConstituency || undefined);
      setIsCountyPickerOpen(false);
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  };

  const handleDownloadFile = (att: MessageAttachment) => {
    const link = document.createElement('a');
    link.href = att.dataUrl;
    link.download = att.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Long-press gesture detector on message bubbles
  const longPressTimerRef = useRef<any>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMessageTouchStart = (msg: ChatMessage, e: React.TouchEvent) => {
    if (msg.isDeletedForEveryone) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40);
        }
      } catch {}
      setActionModalMessage(msg);
    }, 450);
  };

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    if (!longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMessageTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.isDeletedForEveryone) return;
    e.preventDefault();
    setActionModalMessage(msg);
  };

  // Forward message execution to citizen, channel, or group
  const handleExecuteForwardToCitizen = async (targetCitizen: UserProfile) => {
    if (!forwardingMessage || !userProfile || !currentUser) return;
    setIsForwardingSending(true);
    try {
      const targetChatId = await getOrCreateDirectChat(userProfile, targetCitizen);
      await sendChatMessage(
        targetChatId,
        userProfile,
        targetCitizen.uid,
        forwardingMessage.text || '',
        undefined,
        forwardingMessage.mediaUrl,
        forwardingMessage.attachment
      );
      notificationService.playChime();
      showChatToast(`Message forwarded to ${targetCitizen.displayName}`);
      setForwardingMessage(null);
    } catch (err) {
      console.error('Failed to forward message:', err);
      showChatToast('Failed to forward message.');
    } finally {
      setIsForwardingSending(false);
    }
  };

  const handleExecuteForwardToChannel = async (channel: CommunityChannel) => {
    if (!forwardingMessage || !userProfile) return;
    setIsForwardingSending(true);
    try {
      await sendChannelMessage(
        channel.id,
        userProfile,
        forwardingMessage.text || '',
        forwardingMessage.mediaUrl,
        forwardingMessage.attachment
      );
      notificationService.playChime();
      showChatToast(`Message forwarded to #${channel.name}`);
      setForwardingMessage(null);
    } catch (err) {
      console.error('Failed to forward to channel:', err);
      showChatToast('Failed to forward message.');
    } finally {
      setIsForwardingSending(false);
    }
  };

  const handleExecuteForwardToGroup = async (group: GroupChat) => {
    if (!forwardingMessage || !userProfile) return;
    setIsForwardingSending(true);
    try {
      await sendGroupMessage(
        group.id,
        userProfile,
        forwardingMessage.text || '',
        forwardingMessage.mediaUrl,
        forwardingMessage.attachment
      );
      notificationService.playChime();
      showChatToast(`Message forwarded to group ${group.name}`);
      setForwardingMessage(null);
    } catch (err) {
      console.error('Failed to forward to group:', err);
      showChatToast('Failed to forward message.');
    } finally {
      setIsForwardingSending(false);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const partnerId = c.participants.find((p) => p !== currentUser?.uid);
    const details = partnerId ? c.participantDetails?.[partnerId] : null;
    return (
      details?.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter channels
  const filteredChannels = channels.filter((ch) => {
    if (!searchQuery.trim()) return true;
    return (
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter groups
  const filteredGroups = communityGroups.filter((g) => {
    if (!searchQuery.trim()) return true;
    return (
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.county?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter members
  const filteredMembers = communityUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    return (
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.county?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Whether a thread is currently open
  const isThreadOpen =
    (activeChatMode === 'direct' && (!!activeChatId || !!activePartner)) ||
    (activeChatMode === 'channel' && !!activeChannel) ||
    (activeChatMode === 'group' && !!activeGroup);

  // Notify parent container (App.tsx) of thread open state to prevent mobile bottom nav collision
  useEffect(() => {
    onThreadStateChange?.(isThreadOpen);
  }, [isThreadOpen, onThreadStateChange]);


  // Unauthenticated Welcome View
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-sm space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-inner">
            <MessageSquare className="w-8 h-8 text-emerald-700" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              TUJUANE Community Communication
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Connect with fellow Kenyans through direct 1-on-1 chats, county channels, and custom
              community groups. Stay informed with instant push notifications, media sharing, and
              live typing indicators.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={loginWithGoogle}
              className="inline-flex items-center gap-3 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-2xl shadow-md transition-all hover:scale-102 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google to Connect</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-100 text-left">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <Hash className="w-4 h-4 text-emerald-600" />
              <div className="font-bold text-xs text-slate-900">County Channels</div>
              <div className="text-[11px] text-slate-500">Public hubs for Nairobi, Mombasa, Nakuru & Kisumu</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <Users className="w-4 h-4 text-emerald-600" />
              <div className="font-bold text-xs text-slate-900">Group Chats</div>
              <div className="text-[11px] text-slate-500">Create private or public community spaces</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <Bell className="w-4 h-4 text-emerald-600" />
              <div className="font-bold text-xs text-slate-900">Push Notifications</div>
              <div className="text-[11px] text-slate-500">Instant desktop and audio chime alerts</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border-0 sm:border border-slate-200 dark:border-slate-800 shadow-none sm:shadow-xs overflow-hidden flex flex-col md:flex-row h-full w-full flex-1 min-h-0 relative transition-colors">
      {/* Top Floating Push Notification Prompt Banner */}
      {showPermissionPromptBanner && desktopPermission === 'default' && (
        <div className="absolute top-0 inset-x-0 z-40 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-2 flex items-center justify-between text-xs shadow-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 animate-bounce" />
            <span className="font-medium">
              Enable push notifications to never miss messages, mentions, or county alerts.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEnablePushNotifications}
              className="px-3 py-1 bg-white text-emerald-800 font-bold rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              Enable Now
            </button>
            <button
              onClick={() => setShowPermissionPromptBanner(false)}
              className="p-1 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* LEFT COLUMN: Navigation Tabs & List Feed */}
      <div
        className={`w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-950/50 h-full min-h-0 overflow-hidden ${
          isThreadOpen ? 'hidden md:flex' : 'flex'
        }`}
      >

        {/* User Profile Mini Header & Notification Bell */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-xs">
                {userProfile?.displayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                <span className="truncate">{userProfile?.displayName}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
              </div>
              <button
                onClick={() => {
                  setSelectedCounty(userProfile?.county || 'Nairobi');
                  setSelectedConstituency(userProfile?.constituency || '');
                  setIsCountyPickerOpen(true);
                }}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-1 cursor-pointer font-medium"
              >
                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate max-w-[130px]">
                  {userProfile?.constituency ? `${userProfile.constituency}, ` : ''}{userProfile?.county || 'Nairobi'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 underline shrink-0">Change</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 relative">
            {/* Notification Bell with Badge */}
            <button
              onClick={() => setIsNotificationsMenuOpen(!isNotificationsMenuOpen)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Sound Chime Toggle */}
            <button
              onClick={handleToggleSound}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isSoundMuted ? 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60'
              }`}
              title={isSoundMuted ? 'Sound muted (click to unmute)' : 'Sound enabled (click to mute)'}
            >
              {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Sign Out */}
            <button
              onClick={logout}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Sign out of chat"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Notifications Dropdown Panel */}
            {isNotificationsMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-10 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 p-3 space-y-2.5 animate-in fade-in-50 zoom-in-95 text-left"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Notifications & Alerts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                      <button
                        onClick={() => notificationService.clearAll()}
                        className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={() => setIsNotificationsMenuOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Push Notification Permission Action */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between text-[11px]">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">Desktop Push Notifications</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {desktopPermission === 'granted'
                        ? '✅ Active & receiving alerts'
                        : desktopPermission === 'denied'
                        ? '❌ Blocked in browser settings'
                        : '⚠️ Not yet enabled'}
                    </div>
                  </div>
                  {desktopPermission !== 'granted' && (
                    <button
                      onClick={handleEnablePushNotifications}
                      className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 cursor-pointer"
                    >
                      Enable
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-slate-50 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 dark:text-slate-500 text-xs">
                      No recent notifications
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div key={notif.id} className="pt-1.5 first:pt-0">
                        <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {notif.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{notif.body}</div>
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {new Date(notif.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4 Primary Navigation Tabs */}
        <div className="px-3 pt-3">
          <div className="grid grid-cols-4 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-[11px] font-semibold text-center">
            <button
              onClick={() => setActiveTab('direct')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer truncate ${
                activeTab === 'direct'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer truncate flex items-center justify-center gap-1 ${
                activeTab === 'channels'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Hash className="w-3 h-3" />
              <span>Channels</span>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer truncate flex items-center justify-center gap-1 ${
                activeTab === 'groups'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Groups</span>
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer truncate ${
                activeTab === 'members'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Citizens
            </button>
          </div>
        </div>

        {/* Search Bar & Action Buttons */}
        <div className="p-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'direct'
                  ? 'Search 1-on-1 chats...'
                  : activeTab === 'channels'
                  ? 'Search county channels...'
                  : activeTab === 'groups'
                  ? 'Search community groups...'
                  : 'Search by member or county...'
              }
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          {activeTab === 'groups' && (
            <button
              onClick={() => setIsCreateGroupModalOpen(true)}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors cursor-pointer shrink-0"
              title="Create new group"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic Feed List based on Active Tab */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {/* TAB 1: Direct 1-on-1 Chats */}
          {activeTab === 'direct' && (
            filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-slate-400 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                <div className="text-xs font-semibold text-slate-600">No direct chats yet</div>
                <p className="text-[11px] text-slate-400">
                  Switch to Citizens tab to start a direct 1-on-1 chat!
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const partnerId = conv.participants.find((p) => p !== currentUser.uid);
                const partner = partnerId ? conv.participantDetails?.[partnerId] : null;
                const partnerUser = partnerId ? communityUsers.find((u) => u.uid === partnerId) : null;
                const isOnline = isUserOnline(partnerUser?.isOnline, partnerUser?.lastSeen);
                const lastSeenText = formatLastSeen(partnerUser?.lastSeen, isOnline);
                const isSelected = activeChatMode === 'direct' && activeChatId === conv.id;
                const isTyping =
                  partnerId &&
                  conv.typingUsers?.[partnerId]?.isTyping &&
                  conv.typingUsers[partnerId].updatedAt &&
                  Date.now() - (conv.typingUsers[partnerId].updatedAt || 0) < 6000;

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      if (partnerId && partner) {
                        handleStartDirectChat({
                          uid: partnerId,
                          displayName: partner.displayName,
                          email: partner.email || '',
                          photoURL: partner.photoURL,
                          county: partner.county || 'Nairobi',
                          isOnline,
                          lastSeen: partnerUser?.lastSeen,
                          createdAt: ''
                        }, conv.id);
                      }
                    }}

                    className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 shadow-2xs'
                        : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {partner?.photoURL ? (
                        <img
                          src={partner.photoURL}
                          alt={partner.displayName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs">
                          {partner?.displayName?.charAt(0) || 'U'}
                        </div>
                      )}
                      {isOnline ? (
                        <span
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 ring-1 ring-emerald-400"
                          title="Online now"
                        />
                      ) : (
                        <span
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-400 rounded-full border-2 border-white dark:border-slate-900"
                          title={lastSeenText}
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-bold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span>{partner?.displayName || 'Community Member'}</span>
                          {isOnline && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" title="Online" />
                          )}
                        </div>
                        {conv.lastMessageTimestamp ? (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                            {new Date(conv.lastMessageTimestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        ) : !isOnline && partnerUser?.lastSeen ? (
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 font-medium">
                            {lastSeenText.replace('Last seen ', '')}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isTyping ? (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 truncate animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            typing...
                          </span>
                        ) : (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1 flex items-center gap-1">
                            {conv.lastMessageSenderId === currentUser.uid && (
                              <CheckCheck className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0 inline" />
                            )}
                            <span className="truncate">{conv.lastMessage || 'Say hello...'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )
          )}

          {/* TAB 2: Channels (County & Topic) */}
          {activeTab === 'channels' && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Official Kenya Channels
              </div>
              {filteredChannels.map((ch) => {
                const isSelected = activeChatMode === 'channel' && activeChannel?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch)}
                    className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 shadow-2xs'
                        : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs">
                      {ch.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1 truncate">
                          <Hash className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">{ch.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-medium">
                          {ch.memberCount} members
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {ch.lastMessage || ch.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 3: Community Groups */}
          {activeTab === 'groups' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>Community Groups ({filteredGroups.length})</span>
                <button
                  onClick={() => setIsCreateGroupModalOpen(true)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer lowercase font-medium flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  new group
                </button>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-slate-500 space-y-3">
                  <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">No groups created yet</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                    Start a community group for your estate, campus, hustle, or sports team!
                  </p>
                  <button
                    onClick={() => setIsCreateGroupModalOpen(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Group
                  </button>
                </div>
              ) : (
                filteredGroups.map((grp) => {
                  const isSelected = activeChatMode === 'group' && activeGroup?.id === grp.id;
                  const isMember = grp.members.includes(currentUser.uid);

                  return (
                    <button
                      key={grp.id}
                      onClick={() => handleSelectGroup(grp)}
                      className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 shadow-2xs'
                          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-transparent'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-lg shrink-0 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                        {grp.icon || '👥'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {grp.name}
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                            {grp.members.length} members
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {grp.lastMessage || grp.description || 'Join the group chat'}
                        </div>
                      </div>

                      {!isMember && (
                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 rounded-md text-[10px] font-bold shrink-0">
                          Join
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 4: Citizens / Members Directory */}
          {activeTab === 'members' && (
            filteredMembers.length === 0 ? (
              <div className="p-6 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">No citizens found</div>
              </div>
            ) : (
              filteredMembers.map((member) => {
                const isOnline = isUserOnline(member.isOnline, member.lastSeen);
                const lastSeenText = formatLastSeen(member.lastSeen, isOnline);

                return (
                  <div
                    key={member.uid}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        {member.photoURL ? (
                          <img
                            src={member.photoURL}
                            alt={member.displayName}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs">
                            {member.displayName.charAt(0)}
                          </div>
                        )}
                        {isOnline ? (
                          <span
                            className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white dark:border-slate-900 ring-1 ring-emerald-400"
                            title="Online now"
                          />
                        ) : (
                          <span
                            className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-400 rounded-full border border-white dark:border-slate-900"
                            title={lastSeenText}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span>{member.displayName}</span>
                          {isOnline && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Online</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                          {!isOnline && (
                            <span className="text-slate-400 dark:text-slate-500 truncate flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {lastSeenText}
                            </span>
                          )}
                          {!isOnline && <span className="text-slate-300 dark:text-slate-600">•</span>}
                          <span className="truncate">
                            {member.constituency ? `${member.constituency}, ` : ''}{member.county || 'Nairobi'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartDirectChat(member)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Chat
                    </button>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Active Conversation Window (Direct, Channel, or Group) */}
      <div
        className={`flex-1 flex flex-col bg-white dark:bg-slate-900 h-full min-h-0 overflow-hidden ${
          isThreadOpen ? 'flex' : 'hidden md:flex'
        }`}
      >
        {isThreadOpen ? (
          <>
            {/* Header: Displays info based on active chat mode */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-2xs shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => {
                    setActiveChatId(null);
                    setActivePartner(null);
                    setActiveChannel(null);
                    setActiveGroup(null);
                    if (onClearDirectChatTargetUser) onClearDirectChatTargetUser();
                  }}

                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer flex items-center gap-1 font-bold text-xs md:hidden"
                  title="Back to list"
                >
                  <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  <span>Back</span>
                </button>

                {/* Direct Chat Partner Header */}
                {activeChatMode === 'direct' && activePartner && (
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      onClick={() => {
                        if (onViewUserProfile) onViewUserProfile(activePartner);
                      }}
                      className="relative shrink-0 cursor-pointer group"
                      title={`View ${activePartner.displayName}'s Profile`}
                    >
                      {activePartner.photoURL ? (
                        <img
                          src={activePartner.photoURL}
                          alt={activePartner.displayName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 group-hover:ring-2 group-hover:ring-emerald-500 transition-all"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-sm group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors">
                          {activePartner.displayName.charAt(0)}
                        </div>
                      )}
                      {partnerPresence.isOnline ? (
                        <span
                          className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 ring-2 ring-emerald-400/40 animate-pulse"
                          title="Online now"
                        />
                      ) : (
                        <span
                          className="absolute bottom-0 right-0 w-3 h-3 bg-slate-400 dark:bg-slate-600 rounded-full border-2 border-white dark:border-slate-900"
                          title={partnerPresence.lastSeenText}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (onViewUserProfile) onViewUserProfile(activePartner);
                          }}
                          className="font-bold text-sm text-slate-900 dark:text-white truncate hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline cursor-pointer text-left"
                          title={`View ${activePartner.displayName}'s Profile`}
                        >
                          {activePartner.displayName}
                        </button>
                        {mutedUserIds.includes(activePartner.uid) && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800" title="Notifications muted">
                            <VolumeX className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span className="hidden sm:inline">Muted</span>
                          </span>
                        )}
                        {blockedUserIds.includes(activePartner.uid) && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded-md border border-rose-200 dark:border-rose-800" title="Account blocked">
                            <Ban className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span className="hidden sm:inline">Blocked</span>
                          </span>
                        )}
                        {onViewUserProfile && (
                          <button
                            onClick={() => onViewUserProfile(activePartner)}
                            className="hidden sm:inline text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          >
                            Profile
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {isPartnerTyping ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            typing...
                          </span>
                        ) : partnerPresence.isOnline ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                            Online now
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1" title={partnerPresence.lastSeenText}>
                            <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span>{partnerPresence.lastSeenText}</span>
                          </span>
                        )}
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">
                          {activePartner.constituency ? `${activePartner.constituency}, ` : ''}{activePartner.county || 'Nairobi'} County
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Channel Header */}
                {activeChatMode === 'channel' && activeChannel && (
                  <>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-xl shrink-0">
                      {activeChannel.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                        <Hash className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{activeChannel.name}</span>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold border border-slate-200 dark:border-slate-700">
                          Public Channel
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {activeChannel.description}
                      </div>
                    </div>
                  </>
                )}

                {/* Group Header */}
                {activeChatMode === 'group' && activeGroup && (
                  <>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-xl shrink-0">
                      {activeGroup.icon || '👥'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 truncate">
                        <span>{activeGroup.name}</span>
                        <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-200 dark:border-emerald-800">
                          {activeGroup.members.length} members
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {activeGroup.description || `${activeGroup.county || 'Kenya'} Group`}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-2 text-xs">
                {activeChatMode === 'group' &&
                  activeGroup &&
                  !activeGroup.members.includes(currentUser.uid) && (
                    <button
                      onClick={() => handleJoinGroup(activeGroup)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Join Group</span>
                    </button>
                  )}

                {/* Direct Chat Partner Actions (Mute, Block, Report) */}
                {activeChatMode === 'direct' && activePartner && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDirectActionMenuOpen(!isDirectActionMenuOpen)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      title="Chat options & safety"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isDirectActionMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-30 animate-in fade-in zoom-in-95 text-xs text-slate-700 dark:text-slate-200 space-y-0.5"
                      >
                        {/* Mute/Unmute */}
                        <button
                          type="button"
                          onClick={async () => {
                            setIsDirectActionMenuOpen(false);
                            if (mutedUserIds.includes(activePartner.uid)) {
                              await unmuteUser(activePartner.uid);
                            } else {
                              await muteUser(activePartner.uid);
                            }
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium cursor-pointer"
                        >
                          {mutedUserIds.includes(activePartner.uid) ? (
                            <>
                              <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Unmute Notifications</span>
                            </>
                          ) : (
                            <>
                              <VolumeX className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Mute Notifications</span>
                            </>
                          )}
                        </button>

                        {/* Block/Unblock */}
                        <button
                          type="button"
                          onClick={async () => {
                            setIsDirectActionMenuOpen(false);
                            if (blockedUserIds.includes(activePartner.uid)) {
                              await unblockUser(activePartner.uid);
                            } else {
                              setDirectUserToBlock({ id: activePartner.uid, name: activePartner.displayName });
                            }
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-medium cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>{blockedUserIds.includes(activePartner.uid) ? 'Unblock Account' : 'Block Account'}</span>
                        </button>

                        {/* Report */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsDirectActionMenuOpen(false);
                            setIsDirectReportModalOpen(true);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 flex items-center gap-2 font-medium cursor-pointer border-t border-slate-100 dark:border-slate-800"
                        >
                          <Flag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Report Account</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Message Feed Area */}
            <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto space-y-3.5 bg-slate-50/50 dark:bg-slate-950/40">
              {/* Blocked Partner Warning Banner */}
              {activeChatMode === 'direct' && activePartner && blockedUserIds.includes(activePartner.uid) && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <div>
                      <span className="font-bold">You have blocked {activePartner.displayName}.</span>
                      <span className="text-[11px] text-rose-700 dark:text-rose-300 block">
                        You will not receive new messages or notifications from this user.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => unblockUser(activePartner.uid)}
                    className="px-3 py-1 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
                  >
                    Unblock
                  </button>
                </div>
              )}

              {/* DIRECT MESSAGES STREAM */}
              {activeChatMode === 'direct' &&
                (visibleDirectMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                    <MessageSquare className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">No messages yet</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      Send a message to start a direct 1-on-1 chat with {activePartner?.displayName}.
                    </p>
                    <div className="pt-2 flex items-center justify-center gap-1.5 text-xs">
                      {partnerPresence.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse" />
                          Online now — ready to chat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 shadow-2xs">
                          <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          {partnerPresence.lastSeenText}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  visibleDirectMessages.map((msg) => {
                    const isMe = msg.senderId === currentUser.uid;
                    const isMenuOpen = openMenuMessageId === msg.id;
                    const isHighlighted = highlightedMessageId === msg.id;

                    if (msg.isDeletedForEveryone) {
                      return (
                        <div
                          id={`msg-${msg.id}`}
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all`}
                        >
                          <div className="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs italic flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                            <span>This message was deleted</span>
                          </div>
                        </div>
                      );
                    }

                    const isRead =
                      msg.status === 'read' ||
                      (msg.readBy && activePartner && msg.readBy.includes(activePartner.uid));
                    const isDelivered =
                      msg.status === 'delivered' ||
                      (msg.deliveredTo &&
                        activePartner &&
                        msg.deliveredTo.includes(activePartner.uid));

                    return (
                      <div
                        id={`msg-${msg.id}`}
                        key={msg.id}
                        className={`group relative flex flex-col ${
                          isMe ? 'items-end' : 'items-start'
                        } ${isHighlighted ? 'ring-2 ring-emerald-500 ring-offset-2 rounded-2xl transition-all' : ''}`}
                      >
                        <div className="relative max-w-[85%] sm:max-w-[70%]">
                          <div
                            onTouchStart={(e) => handleMessageTouchStart(msg, e)}
                            onTouchMove={handleMessageTouchMove}
                            onTouchEnd={handleMessageTouchEnd}
                            onTouchCancel={handleMessageTouchEnd}
                            onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                            className={`rounded-2xl p-3.5 shadow-2xs space-y-2 transition-all active:scale-[0.99] select-text cursor-pointer ${
                              isMe
                                ? 'bg-slate-900 dark:bg-emerald-700 text-white rounded-br-xs'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-xs'
                            }`}
                            title="Long press or right-click to edit, delete, or forward"
                          >
                            {/* Quoted Message */}
                            {msg.replyTo && (
                              <div
                                onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                                className={`p-2 rounded-lg border-l-4 border-emerald-500 text-xs cursor-pointer transition-opacity hover:opacity-90 ${
                                  isMe ? 'bg-slate-800 dark:bg-emerald-800/80 text-slate-200' : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                                }`}
                                title="Click to jump to quoted message"
                              >
                                <div className="font-bold text-[11px] text-emerald-400 flex items-center gap-1">
                                  <CornerUpLeft className="w-3 h-3" />
                                  <span>{msg.replyTo.senderName}</span>
                                </div>
                                <div className="truncate text-[11px] opacity-80 mt-0.5">
                                  {msg.replyTo.text || 'Shared attachment'}
                                </div>
                              </div>
                            )}

                            {/* Photo */}
                            {msg.mediaUrl && (
                              <div className="rounded-xl overflow-hidden border border-slate-700 max-h-60 bg-black/20 relative group/img">
                                <img
                                  src={msg.mediaUrl}
                                  alt="Attachment"
                                  className="w-full max-h-60 object-contain cursor-pointer"
                                  onClick={() => setLightboxImage(msg.mediaUrl!)}
                                />
                                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group/img:opacity-100 transition-opacity">
                                  <a
                                    href={msg.mediaUrl}
                                    download="chat-image.jpg"
                                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-xs text-xs"
                                    title="Download Image"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Document / File */}
                            {msg.attachment && (
                              <div
                                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                                  isMe
                                    ? 'bg-slate-800/80 dark:bg-emerald-800/80 border-slate-700 dark:border-emerald-600 text-white'
                                    : 'bg-slate-50 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                                    <FileText className="w-5 h-5 text-emerald-500" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-xs truncate">
                                      {msg.attachment.name}
                                    </div>
                                    <div
                                      className={`text-[10px] ${
                                        isMe ? 'text-slate-400 dark:text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      {formatBytes(msg.attachment.size)}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  onClick={() => handleDownloadFile(msg.attachment!)}
                                  className={`p-1.5 rounded-lg shrink-0 cursor-pointer transition-colors ${
                                    isMe
                                      ? 'bg-slate-700 dark:bg-emerald-600 hover:bg-slate-600 dark:hover:bg-emerald-500 text-white'
                                      : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white'
                                  }`}
                                  title="Download File"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            {/* Text Content */}
                            {msg.text && (
                              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                              </div>
                            )}

                            {/* Meta & Status Indicator */}
                            <div
                              className={`text-[10px] flex items-center justify-end gap-1.5 pt-0.5 ${
                                isMe ? 'text-slate-400 dark:text-emerald-200' : 'text-slate-400 dark:text-slate-400'
                              }`}
                            >
                              {msg.isEdited && (
                                <span className="italic text-[10px] opacity-75">(edited)</span>
                              )}
                              <span>
                                {msg.createdAt
                                  ? new Date(msg.createdAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : ''}
                              </span>

                              {isMe && (
                                <span
                                  className="flex items-center"
                                  title={isRead ? 'Read' : isDelivered ? 'Delivered' : 'Sent'}
                                >
                                  {isRead ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                                  ) : isDelivered ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-slate-400 dark:text-emerald-200 stroke-[2]" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-slate-400 dark:text-emerald-200 stroke-[2]" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Menu Button */}
                          <div
                            className={`absolute top-1 ${
                              isMe ? '-left-8' : '-right-8'
                            } opacity-0 group-hover:opacity-100 transition-opacity`}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuMessageId(isMenuOpen ? null : msg.id);
                              }}
                              className="p-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white rounded-full border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
                              title="Message actions"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Action Dropdown Menu */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute z-30 top-6 ${
                                isMe ? 'right-0' : 'left-0'
                              } w-44 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1 text-xs text-slate-700 dark:text-slate-200 animate-in fade-in-50 zoom-in-95`}
                            >
                              <button
                                onClick={() => handleStartReply(msg)}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                              >
                                <CornerUpLeft className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                <span>Reply</span>
                              </button>

                              <button
                                onClick={() => {
                                  setForwardingMessage(msg);
                                  setOpenMenuMessageId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-emerald-700 dark:text-emerald-400 font-medium"
                              >
                                <CornerUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Forward</span>
                              </button>

                              {msg.text && (
                                <button
                                  onClick={() => handleCopyText(msg.text)}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>Copy Text</span>
                                </button>
                              )}

                              {isMe && (
                                <button
                                  onClick={() => handleStartEdit(msg)}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>Edit Message</span>
                                </button>
                              )}

                              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                              {isMe && (
                                <button
                                  onClick={() =>
                                    setDeleteConfirmation({ message: msg, type: 'forEveryone' })
                                  }
                                  className="w-full px-3 py-1.5 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete for Everyone</span>
                                </button>
                              )}

                              <button
                                onClick={() =>
                                  setDeleteConfirmation({ message: msg, type: 'forMe' })
                                }
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                <span>Delete for Me</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ))}

              {/* CHANNEL MESSAGES STREAM */}
              {activeChatMode === 'channel' &&
                (channelMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                    <Hash className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Welcome to #{activeChannel?.name}!
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      This is the beginning of the #{activeChannel?.name} channel. Be the first to
                      say hello to fellow community members!
                    </p>
                  </div>
                ) : (
                  channelMessages.map((msg) => {
                    const isMe = msg.senderId === currentUser.uid;
                    return (
                      <div
                        id={`msg-${msg.id}`}
                        key={msg.id}
                        className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {/* Avatar */}
                        {msg.senderPhoto ? (
                          <img
                            src={msg.senderPhoto}
                            alt={msg.senderName}
                            className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                            {msg.senderName?.charAt(0) || 'M'}
                          </div>
                        )}

                        <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                          {/* Sender name & county */}
                          <div
                            className={`flex items-center gap-1.5 text-[11px] ${
                              isMe ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span className="font-bold text-slate-900 dark:text-white">{msg.senderName}</span>
                            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-[9px] font-medium border border-slate-200 dark:border-slate-700">
                              {msg.senderCounty || 'Nairobi'}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          <div
                            className={`p-3 rounded-2xl shadow-2xs space-y-1.5 ${
                              isMe
                                ? 'bg-slate-900 dark:bg-emerald-700 text-white rounded-tr-xs'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-xs'
                            }`}
                          >
                            {msg.mediaUrl && (
                              <img
                                src={msg.mediaUrl}
                                alt="Channel media"
                                className="max-h-60 rounded-xl object-contain cursor-pointer"
                                onClick={() => setLightboxImage(msg.mediaUrl!)}
                              />
                            )}

                            {msg.attachment && (
                              <div
                                onClick={() => handleDownloadFile(msg.attachment!)}
                                className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span className="truncate font-semibold">
                                    {msg.attachment.name}
                                  </span>
                                </div>
                                <Download className="w-3.5 h-3.5 shrink-0" />
                              </div>
                            )}

                            <div className="text-xs sm:text-sm whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ))}

              {/* GROUP MESSAGES STREAM */}
              {activeChatMode === 'group' &&
                (groupMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                    <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Welcome to {activeGroup?.name}!
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      Send a message, share photos, or post files to start the group conversation.
                    </p>
                  </div>
                ) : (
                  groupMessages.map((msg) => {
                    const isMe = msg.senderId === currentUser.uid;
                    return (
                      <div
                        id={`msg-${msg.id}`}
                        key={msg.id}
                        className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {msg.senderPhoto ? (
                          <img
                            src={msg.senderPhoto}
                            alt={msg.senderName}
                            className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                            {msg.senderName?.charAt(0) || 'M'}
                          </div>
                        )}

                        <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`flex items-center gap-1.5 text-[11px] ${
                              isMe ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span className="font-bold text-slate-900 dark:text-white">{msg.senderName}</span>
                            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-[9px] font-medium border border-slate-200 dark:border-slate-700">
                              {msg.senderCounty || 'Nairobi'}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          <div
                            className={`p-3 rounded-2xl shadow-2xs space-y-1.5 ${
                              isMe
                                ? 'bg-slate-900 dark:bg-emerald-700 text-white rounded-tr-xs'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-xs'
                            }`}
                          >
                            {msg.mediaUrl && (
                              <img
                                src={msg.mediaUrl}
                                alt="Group media"
                                className="max-h-60 rounded-xl object-contain cursor-pointer"
                                onClick={() => setLightboxImage(msg.mediaUrl!)}
                              />
                            )}

                            {msg.attachment && (
                              <div
                                onClick={() => handleDownloadFile(msg.attachment!)}
                                className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span className="truncate font-semibold">
                                    {msg.attachment.name}
                                  </span>
                                </div>
                                <Download className="w-3.5 h-3.5 shrink-0" />
                              </div>
                            )}

                            <div className="text-xs sm:text-sm whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ))}

              {/* Partner typing indicator animated bubble for direct chat */}
              {activeChatMode === 'direct' && isPartnerTyping && activePartner && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300 text-xs py-1.5 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-fit shadow-2xs animate-pulse">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {activePartner.displayName} is typing
                  </span>
                  <div className="flex gap-1 items-center pl-1">
                    <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce"></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* File Error Notification */}
            {fileError && (
              <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
                <button onClick={() => setFileError(null)} className="p-1 hover:text-rose-900 dark:hover:text-rose-100 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Reply Preview Banner */}
            {replyingToMessage && (
              <div className="mx-4 mt-2 p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border-l-4 border-emerald-600 flex items-center justify-between text-xs animate-in fade-in-50">
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <CornerUpLeft className="w-3 h-3" />
                    <span>
                      Replying to{' '}
                      {replyingToMessage.senderId === currentUser.uid
                        ? 'yourself'
                        : replyingToMessage.senderName || 'Member'}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 truncate mt-0.5">
                    {replyingToMessage.text ||
                      (replyingToMessage.mediaUrl ? '📷 Photo' : '📎 Attachment')}
                  </p>
                </div>
                <button
                  onClick={() => setReplyingToMessage(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
                  title="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Attached Image Preview */}
            {attachedImage && (
              <div className="mx-4 mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <img
                    src={attachedImage}
                    alt="Attachment preview"
                    className="w-10 h-10 object-cover rounded-lg border border-emerald-400"
                  />
                  <div>
                    <div className="text-xs text-slate-800 dark:text-slate-200 font-semibold">Photo attached</div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Ready to send</div>
                  </div>
                </div>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded cursor-pointer"
                  title="Remove image attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Attached Generic Document / File Preview */}
            {attachedFile && (
              <div className="mx-4 mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-900 dark:text-white font-semibold truncate">
                      {attachedFile.name}
                    </div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      {formatBytes(attachedFile.size)} · Document
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded cursor-pointer shrink-0"
                  title="Remove file attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Blocked Account Composer Notice OR Account Restriction Notice OR Message Input Form */}
            {userProfile?.accountStatus === 'banned' ? (
              <div className="shrink-0 p-4 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-800 text-center text-xs text-rose-800 dark:text-rose-200 flex items-center justify-center gap-2 font-semibold pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Account permanently banned ({userProfile.banReason || 'Policy violations'}). Messaging disabled.</span>
              </div>
            ) : userProfile?.accountStatus === 'suspended' && (!userProfile.suspendedUntil || new Date(userProfile.suspendedUntil).getTime() > Date.now()) ? (
              <div className="shrink-0 p-4 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800 text-center text-xs text-amber-800 dark:text-amber-200 flex items-center justify-center gap-2 font-semibold pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Account suspended until {userProfile.suspendedUntil ? new Date(userProfile.suspendedUntil).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'temporary duration'} ({userProfile.banReason || 'Policy violation'}). Messaging disabled.</span>
              </div>
            ) : activeChatMode === 'direct' && activePartner && blockedUserIds.includes(activePartner.uid) ? (
              <div className="shrink-0 p-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 font-medium pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Ban className="w-4 h-4 text-rose-500 shrink-0" />
                <span>You have blocked this account. Unblock to send messages.</span>
                <button
                  type="button"
                  onClick={() => unblockUser(activePartner.uid)}
                  className="font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 underline cursor-pointer ml-1"
                >
                  Unblock Citizen
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="shrink-0 p-2.5 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky bottom-0 z-20 shadow-xs pb-[max(0.625rem,env(safe-area-inset-bottom))]">

                <input
                  type="file"
                  ref={imageInputRef}
                  accept="image/*"
                  onChange={handleChatImageSelect}
                  className="hidden"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.doc,.docx,.txt,.csv,.json,.xls,.xlsx"
                  onChange={handleChatFileSelect}
                  className="hidden"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isCompressingImage || !!editingMessage}
                    onClick={() => imageInputRef.current?.click()}
                    className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Attach photo / image"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </button>

                  <button
                    type="button"
                    disabled={isCompressingImage || !!editingMessage}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Attach document / file (up to 400KB)"
                  >
                    <Paperclip className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </button>

                  <input
                    ref={messageInputRef}
                    type="text"
                    value={messageInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder={
                      isCompressingImage
                        ? 'Optimizing photo...'
                        : activeChatMode === 'channel'
                        ? `Message #${activeChannel?.name}...`
                        : activeChatMode === 'group'
                        ? `Message group ${activeGroup?.name}...`
                        : `Message ${activePartner?.displayName || 'member'}...`
                    }
                    maxLength={1000}
                    className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />

                  <button
                    type="submit"
                    disabled={
                      isSending ||
                      isCompressingImage ||
                      (!messageInput.trim() && !attachedImage && !attachedFile)
                    }
                    className="p-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer shrink-0 flex items-center justify-center min-w-10 shadow-sm"
                    title={editingMessage ? 'Save changes' : 'Send message'}
                  >
                    {editingMessage ? (
                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shadow-sm">
              <Globe className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">Select a Channel or Conversation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Pick a County Channel like <strong>#Nairobi Central</strong>, join a <strong>Community Group</strong>,
                or start a private <strong>1-on-1 Direct Chat</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CREATE GROUP MODAL */}
      {isCreateGroupModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsCreateGroupModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Create Community Group</h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreateGroupModalOpen(false);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Group Name *</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Westlands Tech Hustlers, Kilifi Surfers"
                  maxLength={80}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Group Purpose
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="What is this group about? Who should join?"
                  rows={2}
                  maxLength={300}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">County</label>
                  <select
                    value={newGroupCounty}
                    onChange={(e) => setNewGroupCounty(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                  >
                    {ALL_47_COUNTIES.map((c) => (
                      <option key={c} value={c}>
                        {c} County
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Group Icon</label>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                    {groupIcons.map((ic) => (
                      <button
                        type="button"
                        key={ic}
                        onClick={() => setNewGroupIcon(ic)}
                        className={`w-8 h-8 rounded-lg text-base flex items-center justify-center shrink-0 transition-transform ${
                          newGroupIcon === ic
                            ? 'bg-emerald-500 text-white scale-110 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateGroupModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGroup || !newGroupName.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  {isCreatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setDeleteConfirmation(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {deleteConfirmation.type === 'forEveryone'
                  ? 'Delete message for everyone?'
                  : 'Delete message for me?'}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmation(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              {deleteConfirmation.type === 'forEveryone'
                ? 'This will remove the message for all participants in this chat and replace it with a deleted indicator.'
                : 'This message will be removed from your chat history.'}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COUNTY & CONSTITUENCY SELECTION MODAL */}
      {isCountyPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsCountyPickerOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Select County & Constituency</h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCountyPickerOpen(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your location badge lets fellow citizens find you for grassroots discussions and local county connections.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  County (47 Counties)
                </label>
                <select
                  value={selectedCounty}
                  onChange={(e) => {
                    setSelectedCounty(e.target.value);
                    setSelectedConstituency('');
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                >
                  {ALL_47_COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c} County
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Constituency ({availableConstituencies.length} in {selectedCounty})
                </label>
                <select
                  value={selectedConstituency}
                  onChange={(e) => setSelectedConstituency(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                >
                  <option value="">Select Constituency (Optional)</option>
                  {availableConstituencies.map((cons) => (
                    <option key={cons} value={cons}>
                      {cons}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCountyPickerOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCounty}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-end text-white pb-3 px-2">
              <a
                href={lightboxImage}
                download="tujuane-chat-photo.jpg"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white mr-3 transition-colors cursor-pointer"
                title="Download original image"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <img
              src={lightboxImage}
              alt="Full-size view"
              className="max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* CONFIRM BLOCK DIRECT CHAT USER MODAL */}
      {directUserToBlock && (
        <div
          onClick={() => setDirectUserToBlock(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-rose-200 dark:border-rose-900 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-rose-100 dark:border-rose-900/50">
              <h3 className="font-bold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Ban className="w-4 h-4" />
                <span>Block {directUserToBlock.name}?</span>
              </h3>
              <button
                type="button"
                onClick={() => setDirectUserToBlock(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to block <strong>{directUserToBlock.name}</strong>? They will not be able to send you direct messages, and their posts will be hidden from your feed.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isBlockInProgress}
                onClick={() => setDirectUserToBlock(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBlockInProgress}
                onClick={async () => {
                  setIsBlockInProgress(true);
                  try {
                    await blockUser(directUserToBlock.id);
                    setDirectUserToBlock(null);
                  } finally {
                    setIsBlockInProgress(false);
                  }
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                {isBlockInProgress ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Blocking...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Yes, Block Citizen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT ACCOUNT MODAL */}
      <ReportModal
        isOpen={isDirectReportModalOpen}
        onClose={() => setIsDirectReportModalOpen(false)}
        target={
          activePartner
            ? {
                type: 'user',
                authorId: activePartner.uid,
                authorName: activePartner.displayName,
                snippet: `Citizen from ${activePartner.county || 'Kenya'}`
              }
            : null
        }
      />

      {/* CHAT TOAST ALERT */}
      {chatToast && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 dark:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 border border-slate-700 dark:border-emerald-700">
          <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
          <span>{chatToast}</span>
        </div>
      )}

      {/* LONG-PRESS MESSAGE ACTION SHEET / MODAL */}
      {actionModalMessage && (
        <div
          onClick={() => setActionModalMessage(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl sm:max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-4 sm:zoom-in-95"
          >
            {/* Header / Message Preview */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-white">Message Options</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium border border-slate-200 dark:border-slate-700">
                  {actionModalMessage.senderId === currentUser?.uid ? 'Sent by you' : `From ${actionModalMessage.senderName || 'Member'}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActionModalMessage(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message snippet preview */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 max-h-24 overflow-hidden text-ellipsis line-clamp-3 leading-relaxed">
              {actionModalMessage.text || (actionModalMessage.mediaUrl ? '📷 Photo attachment' : actionModalMessage.attachment ? `📎 ${actionModalMessage.attachment.name}` : 'Shared content')}
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Reply */}
              <button
                type="button"
                onClick={() => {
                  handleStartReply(actionModalMessage);
                  setActionModalMessage(null);
                }}
                className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-800 dark:text-slate-200 hover:text-emerald-800 dark:hover:text-emerald-300 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CornerUpLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Reply</span>
              </button>

              {/* Forward */}
              <button
                type="button"
                onClick={() => {
                  setForwardingMessage(actionModalMessage);
                  setActionModalMessage(null);
                }}
                className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-800 dark:text-slate-200 hover:text-emerald-800 dark:hover:text-emerald-300 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CornerUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Forward</span>
              </button>

              {/* Edit (if own message) */}
              {actionModalMessage.senderId === currentUser?.uid && !actionModalMessage.isDeletedForEveryone && (
                <button
                  type="button"
                  onClick={() => {
                    handleStartEdit(actionModalMessage);
                    setActionModalMessage(null);
                  }}
                  className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-800 dark:text-slate-200 hover:text-amber-800 dark:hover:text-amber-300 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Edit Message</span>
                </button>
              )}

              {/* Copy */}
              {actionModalMessage.text && (
                <button
                  type="button"
                  onClick={() => {
                    handleCopyText(actionModalMessage.text);
                    setActionModalMessage(null);
                    showChatToast('Message copied to clipboard');
                  }}
                  className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Copy Text</span>
                </button>
              )}

              {/* Delete for Me */}
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmation({ message: actionModalMessage, type: 'forMe' });
                  setActionModalMessage(null);
                }}
                className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <span>Delete for Me</span>
              </button>

              {/* Delete for Everyone */}
              {actionModalMessage.senderId === currentUser?.uid && !actionModalMessage.isDeletedForEveryone && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmation({ message: actionModalMessage, type: 'forEveryone' });
                    setActionModalMessage(null);
                  }}
                  className="p-3 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Delete for All</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActionModalMessage(null)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FORWARD MESSAGE MODAL */}
      {forwardingMessage && (
        <div
          onClick={() => setForwardingMessage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <CornerUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Forward Message</h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Select a citizen, channel, or group
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message preview snippet */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Forwarding content:
              </div>
              <div className="italic line-clamp-2">
                "{forwardingMessage.text || (forwardingMessage.mediaUrl ? '📷 Photo attachment' : forwardingMessage.attachment ? `📎 ${forwardingMessage.attachment.name}` : 'Shared content')}"
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search citizen or channel..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
              />
            </div>

            {/* Destination Type Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setForwardTab('citizens')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  forwardTab === 'citizens' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Citizens ({communityUsers.filter((u) => u.uid !== currentUser?.uid).length})
              </button>
              <button
                type="button"
                onClick={() => setForwardTab('channels')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  forwardTab === 'channels' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Channels ({DEFAULT_CHANNELS.length})
              </button>
              <button
                type="button"
                onClick={() => setForwardTab('groups')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  forwardTab === 'groups' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Groups ({communityGroups.length})
              </button>
            </div>

            {/* List of targets */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[300px] pr-1 divide-y divide-slate-100 dark:divide-slate-800">
              {/* Citizens */}
              {forwardTab === 'citizens' && (
                communityUsers
                  .filter((u) => u.uid !== currentUser?.uid)
                  .filter((u) => !forwardSearch.trim() || u.displayName.toLowerCase().includes(forwardSearch.toLowerCase()) || (u.county || '').toLowerCase().includes(forwardSearch.toLowerCase()))
                  .map((citizen) => (
                    <div key={citizen.uid} className="pt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {citizen.photoURL ? (
                          <img src={citizen.photoURL} alt={citizen.displayName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {citizen.displayName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{citizen.displayName}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{citizen.county || 'Nairobi'} County</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isForwardingSending}
                        onClick={() => handleExecuteForwardToCitizen(citizen)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1 shadow-2xs"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </button>
                    </div>
                  ))
              )}

              {/* Channels */}
              {forwardTab === 'channels' && (
                DEFAULT_CHANNELS
                  .filter((ch) => !forwardSearch.trim() || ch.name.toLowerCase().includes(forwardSearch.toLowerCase()))
                  .map((ch) => (
                    <div key={ch.id} className="pt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-800 text-emerald-400 font-mono font-bold flex items-center justify-center text-xs shrink-0 border border-slate-800 dark:border-slate-700">
                          #
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">#{ch.name}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{ch.description}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isForwardingSending}
                        onClick={() => handleExecuteForwardToChannel(ch)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1 shadow-2xs"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </button>
                    </div>
                  ))
              )}

              {/* Groups */}
              {forwardTab === 'groups' && (
                communityGroups.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
                    You haven't joined any groups yet.
                  </div>
                ) : (
                  communityGroups
                    .filter((g: GroupChat) => !forwardSearch.trim() || g.name.toLowerCase().includes(forwardSearch.toLowerCase()))
                    .map((grp: GroupChat) => (
                      <div key={grp.id} className="pt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold flex items-center justify-center text-sm shrink-0 border border-purple-200 dark:border-purple-800">
                            {grp.icon || '👥'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{grp.name}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{grp.members.length} members</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isForwardingSending}
                          onClick={() => handleExecuteForwardToGroup(grp)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1 shadow-2xs"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send</span>
                        </button>
                      </div>
                    ))
                )
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
