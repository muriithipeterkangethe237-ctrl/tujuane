import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CommunityPoll, CreatePollParams } from '../types/poll';
import { UserProfile } from '../types/chat';

const POLLS_COLLECTION = 'community_polls';

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

      callback(polls);
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

/**
 * Seeds default authentic Kenyan cultural & community polls if collection is empty
 */
export async function seedDefaultKenyanPollsIfEmpty(): Promise<void> {
  try {
    const pollsRef = collection(db, POLLS_COLLECTION);
    const existingSnap = await getDocs(query(pollsRef, limit(1)));

    if (!existingSnap.empty) {
      return; // Already seeded
    }

    const defaultPolls = [
      {
        id: 'poll_culture_kenya_food_heritage',
        title: 'Which Kenyan evening comfort food reigns supreme?',
        description: 'From Nairobi streets to shags country kitchens, which evening bite hits the soul best?',
        category: 'culture' as const,
        countyScope: 'All 47 Counties',
        featured: true,
        options: [
          { id: 'opt_1', text: 'Ugali Saucer na Sukuma Wiki & Beef Stew', votesCount: 42, emoji: '🍲' },
          { id: 'opt_2', text: 'Chapo Smokie / Pasua na Kachumbari & Pilipili', votesCount: 58, emoji: '🌯' },
          { id: 'opt_3', text: 'Viazi Karai na Chutney ya Ukwaju & Pilipili Manga', votesCount: 29, emoji: '🥔' },
          { id: 'opt_4', text: 'Mutura Moto-Moto right off the evening grill', votesCount: 51, emoji: '🥩' }
        ],
        totalVotes: 180,
        isActive: true,
        authorName: 'TUJUANE Kenya Cultural Desk',
        createdAt: serverTimestamp()
      },
      {
        id: 'poll_community_county_devolution_priority',
        title: 'What should our local County Barazas prioritize most this quarter?',
        description: 'Citizen voice on grassroots devolution impact across the 47 county assemblies.',
        category: 'community' as const,
        countyScope: 'Grassroots Kenya',
        featured: false,
        options: [
          { id: 'opt_1', text: 'Equipped Youth Vocational & Digital Work Hubs', votesCount: 64, emoji: '💻' },
          { id: 'opt_2', text: 'Borehole Rehabilitation & Clean Tap Water Access', votesCount: 88, emoji: '💧' },
          { id: 'opt_3', text: 'Solar Streetlighting & Safer Community Walkways', votesCount: 37, emoji: '💡' },
          { id: 'opt_4', text: 'Estate Drainage Cleaning & Waste Sorting Centers', votesCount: 45, emoji: '🌱' }
        ],
        totalVotes: 234,
        isActive: true,
        authorName: 'TUJUANE Civic Forum',
        createdAt: serverTimestamp()
      },
      {
        id: 'poll_lifestyle_matatu_nganya_culture',
        title: 'What is the most iconic signature of Kenya’s Matatu Culture?',
        description: 'Our world-renowned public transit heritage and artistic street style.',
        category: 'lifestyle' as const,
        countyScope: 'Nairobi & Transit Corridors',
        featured: false,
        options: [
          { id: 'opt_1', text: 'Custom Airbrush Graffiti Murals & Kenyan pop art', votesCount: 72, emoji: '🎨' },
          { id: 'opt_2', text: 'Booming sound systems & exclusive Kenyan music mixes', votesCount: 69, emoji: '🎵' },
          { id: 'opt_3', text: 'Neon ambient LED roof lighting & dashboard displays', votesCount: 31, emoji: '✨' },
          { id: 'opt_4', text: 'The conductor (Manamba) route swagger & energy', votesCount: 44, emoji: '🧢' }
        ],
        totalVotes: 216,
        isActive: true,
        authorName: 'Matatu Arts & Heritage Club',
        createdAt: serverTimestamp()
      },
      {
        id: 'poll_culture_kenyan_chai_debate',
        title: 'The Great Chai Debate: How do you take your morning Kenyan tea?',
        description: 'Nothing starts the Kenyan day without a steaming cup. What is your go-to?',
        category: 'culture' as const,
        countyScope: 'All 47 Counties',
        featured: false,
        options: [
          { id: 'opt_1', text: 'Chai Masala brewed with fresh Tangawizi & Iliki', votesCount: 84, emoji: '🫖' },
          { id: 'opt_2', text: 'Rich Chai ya Maziwa Fresh with hot Mandazi', votesCount: 96, emoji: '🥛' },
          { id: 'opt_3', text: 'Kahawa Chungu / Tangawizi with crispy Kaimati', votesCount: 28, emoji: '☕' },
          { id: 'opt_4', text: 'Chai Kavu (Black tea) na ndimu (fresh lemon slice)', votesCount: 22, emoji: '🍋' }
        ],
        totalVotes: 230,
        isActive: true,
        authorName: 'Mombasa & Highlands Tea Lovers',
        createdAt: serverTimestamp()
      },
      {
        id: 'poll_sports_national_pride',
        title: 'Which Kenyan sporting triumph gave you the deepest goosebumps?',
        description: 'Celebrating Kenyan champions flying our national flag on global stages.',
        category: 'sports' as const,
        countyScope: 'Team Kenya Champions',
        featured: false,
        options: [
          { id: 'opt_1', text: 'Athletics & Marathon Records (Faith Kipyegon & Kipchoge)', votesCount: 112, emoji: '🏃' },
          { id: 'opt_2', text: 'Kenya Rugby Sevens (Shujaa) electric World Series runs', votesCount: 67, emoji: '🏉' },
          { id: 'opt_3', text: 'Harambee Stars fighting spirit & regional derbies', votesCount: 34, emoji: '⚽' },
          { id: 'opt_4', text: 'Safari Rally Kenya roaring across Naivasha dust trails', votesCount: 49, emoji: '🏎️' }
        ],
        totalVotes: 262,
        isActive: true,
        authorName: 'TUJUANE Sports Desk',
        createdAt: serverTimestamp()
      }
    ];

    for (const poll of defaultPolls) {
      await setDoc(doc(db, POLLS_COLLECTION, poll.id), poll);
    }
  } catch (error) {
    console.warn('Notice seeding initial polls:', error);
  }
}
