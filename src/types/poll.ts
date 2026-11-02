export type PollCategory =
  | 'culture'
  | 'community'
  | 'lifestyle'
  | 'governance'
  | 'food'
  | 'sports';

export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  emoji?: string;
  description?: string;
}

export interface CommunityPoll {
  id: string;
  title: string;
  description?: string;
  category: PollCategory;
  countyScope?: string;
  options: PollOption[];
  totalVotes: number;
  isActive: boolean;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  closesAt?: string;
  featured?: boolean;
}

export interface PollVote {
  userId: string;
  pollId: string;
  optionId: string;
  votedAt: string;
}

export interface CreatePollParams {
  title: string;
  description?: string;
  category: PollCategory;
  countyScope?: string;
  options: string[]; // text for each option
}
