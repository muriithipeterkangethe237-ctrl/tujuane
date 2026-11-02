export interface FollowRelationship {
  id: string; // `${followerId}_${followingId}`
  followerId: string;
  followerName: string;
  followerPhoto?: string;
  followerCounty?: string;
  followingId: string;
  followingName: string;
  followingPhoto?: string;
  followingCounty?: string;
  createdAt: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  senderCounty?: string;
  senderConstituency?: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  receiverCounty?: string;
  receiverConstituency?: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface SocialState {
  followingIds: string[];
  followerIds: string[];
  friends: FriendRequest[];
  incomingRequests: FriendRequest[];
  sentRequestReceiverIds: string[];
}
