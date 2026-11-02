import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CommunityPoll, CreatePollParams } from '../types/poll';
import { UserProfile } from '../types/chat';

const POLLS_COLLECTION = 'community_polls';
// Keep pre-reset polls stored in Firebase but out of public listings.
const PUBLIC_POLLS_VISIBLE_AFTER = Date.parse('2026-11-02T22:47:21.708+03:00');

/**
 * Real-time listener for all active community polls
 */
export function subscribeToCommunityPolls(
  callback: (polls: CommunityPoll[]) => void
): () => void {
  const pollsRef = collection(db, POLLS_COLLECTION);
  const q = query(pollsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const polls: CommunityPoll[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          title: d.title || 'Community Poll',
          description: d.description || '',
          category: d.category || 'culture',
          countyScope: d.countyScope || 'All Kenya (47 Counties)',
          options: Array.isArray(d.options) ? d.options : [],
          totalVotes: typeof d.totalVotes === 'number' ? d.totalVotes : 0,
          isActive: d.isActive !== undefined ? d.isActive : true,
          authorId: d.authorId || '',
          authorName: d.authorName || 'TUJUANE Community',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          closesAt: d.closesAt?.toDate ? d.closesAt.toDate().toISOString() : undefined,
          featured: d.featured || false,
        };
      });

      callback(
        polls.filter(
          (poll) => Date.parse(poll.createdAt) >= PUBLIC_POLLS_VISIBLE_AFTER
        )
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, POLLS_COLLECTION);
    }
  );
}

/**
 * Real-time listener for current user's vote on a specific poll
 */
export function subscribeToUserPollVote(
  pollId: string,
  userId: string | undefined,
  callback: (selectedOptionId: string | null) => void
): () => void {
  if (!userId || !pollId) {
    callback(null);
    return () => {};
  }

  const voteDocRef = doc(db, POLLS_COLLECTION, pollId, 'votes', userId);
  return onSnapshot(
    voteDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callback(data.optionId || null);
      } else {
        callback(null);
      }
    },
    (error) => {
      // If permission or read issue, report gracefully
      console.warn('User poll vote listener error:', error);
      callback(null);
    }
  );
}

/**
 * Cast a vote on a community poll atomically
 */
export async function castPollVote(
  pollId: string,
  userId: string,
  newOptionId: string,
  previousOptionId?: string | null
): Promise<void> {
  const pollRef = doc(db, POLLS_COLLECTION, pollId);
  const voteRef = doc(db, POLLS_COLLECTION, pollId, 'votes', userId);

  try {
    await runTransaction(db, async (transaction) => {
      const pollDoc = await transaction.get(pollRef);
      if (!pollDoc.exists()) {
        throw new Error('Poll does not exist.');
      }

      const pollData = pollDoc.data();
      const currentOptions: any[] = pollData.options || [];

      // Update counts
      const updatedOptions = currentOptions.map((opt) => {
        let count = Number(opt.votesCount) || 0;
        if (opt.id === newOptionId) {
          count += 1;
        }
        if (previousOptionId && opt.id === previousOptionId && previousOptionId !== newOptionId) {
          count = Math.max(0, count - 1);
        }
        return {
          ...opt,
          votesCount: count
        };
      });

      // Total votes change
      let newTotalVotes = Number(pollData.totalVotes) || 0;
      if (!previousOptionId) {
        newTotalVotes += 1; // brand new vote
      }

      transaction.update(pollRef, {
        options: updatedOptions,
        totalVotes: newTotalVotes
      });

      transaction.set(voteRef, {
        userId,
        pollId,
        optionId: newOptionId,
        votedAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${POLLS_COLLECTION}/${pollId}`);
  }
}

/**
 * Create a new user-generated community poll
 */
export async function createCommunityPoll(
  author: UserProfile,
  params: CreatePollParams
): Promise<string> {
  const pollId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const pollRef = doc(db, POLLS_COLLECTION, pollId);

  const formattedOptions = params.options
    .filter((txt) => txt.trim().length > 0)
    .map((text, idx) => ({
      id: `opt_${idx + 1}_${Math.random().toString(36).substring(2, 5)}`,
      text: text.trim().slice(0, 100),
      votesCount: 0
    }));

  if (formattedOptions.length < 2) {
    throw new Error('Poll must have at least 2 options.');
  }

  const pollData: any = {
    id: pollId,
    title: params.title.trim().slice(0, 200),
    description: params.description?.trim().slice(0, 1000) || '',
    category: params.category,
    countyScope: params.countyScope || 'All Kenya (47 Counties)',
    options: formattedOptions,
    totalVotes: 0,
    isActive: true,
    authorId: author.uid,
    authorName: author.displayName || 'TUJUANE Member',
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(pollRef, pollData);
    return pollId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POLLS_COLLECTION}/${pollId}`);
  }
}
