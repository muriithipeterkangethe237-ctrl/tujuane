import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  getDoc,
  getDocFromCache,
  getDocs,
  runTransaction,
  limit,
  type DocumentSnapshot
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  handleFirestoreListenerError,
  isFirestoreQuotaExceeded,
  OperationType
} from '../firebase';
import { UserProfile } from '../types/chat';
import { CommunityPost, CommunityComment, CreatePostParams } from '../types/community';
import { base64ChunksToBlob, resolvePlayableVideoUrl } from '../utils/videoProcessor';

const videoBlobUrlCache = new Map<string, string>();
const inFlightVideoLoads = new Map<string, Promise<string>>();

// Tier-1 progressive cache: holds only chunk_0 (header + first few frames) for adjacent videos
const videoHeadBlobCache = new Map<string, string>();
const videoHeadChunkDataCache = new Map<string, string>();
const inFlightHeadLoads = new Map<string, Promise<string | null>>();

const VIDEO_IDB_NAME = 'tujuane_video_blob_cache_v1';
const VIDEO_IDB_STORE = 'videos';
const MAX_CACHED_VIDEO_BLOBS = 12;
const MAX_CACHED_VIDEO_HEADS = 20;

function openVideoCacheDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VIDEO_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const dbInst = req.result;
        if (!dbInst.objectStoreNames.contains(VIDEO_IDB_STORE)) {
          dbInst.createObjectStore(VIDEO_IDB_STORE, { keyPath: 'postId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getVideoBlobFromIDB(postId: string): Promise<Blob | null> {
  const idb = await openVideoCacheDB();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(VIDEO_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VIDEO_IDB_STORE);
      const getReq = store.get(postId);
      getReq.onsuccess = () => {
        const record = getReq.result as { postId: string; blob: Blob; updatedAt: number } | undefined;
        if (record?.blob instanceof Blob && record.blob.size > 0) {
          try {
            store.put({ ...record, updatedAt: Date.now() });
          } catch {
            // ignore touch error
          }
          resolve(record.blob);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveVideoBlobToIDB(postId: string, blob: Blob): Promise<void> {
  if (!postId || !(blob instanceof Blob) || blob.size === 0) return;
  const idb = await openVideoCacheDB();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(VIDEO_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VIDEO_IDB_STORE);
      store.put({ postId, blob, updatedAt: Date.now() });

      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const items = (allReq.result || []) as Array<{ postId: string; updatedAt: number }>;
        if (items.length > MAX_CACHED_VIDEO_BLOBS) {
          items.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
          const excess = items.slice(0, items.length - MAX_CACHED_VIDEO_BLOBS);
          for (const old of excess) {
            store.delete(old.postId);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function evictOldestHeadCacheIfNeeded(): void {
  if (videoHeadBlobCache.size < MAX_CACHED_VIDEO_HEADS) return;
  const oldestKey = videoHeadBlobCache.keys().next().value;
  if (!oldestKey) return;
  const oldestUrl = videoHeadBlobCache.get(oldestKey);
  videoHeadBlobCache.delete(oldestKey);
  videoHeadChunkDataCache.delete(oldestKey);
  if (oldestUrl && videoBlobUrlCache.get(oldestKey) !== oldestUrl) {
    try {
      URL.revokeObjectURL(oldestUrl);
    } catch {
      // ignore revoke error
    }
  }
}

/**
 * Synchronously check if a post's full assembled video Object URL is already cached in memory.
 */
export function getCachedPostVideoUrl(postId?: string): string | null {
  if (!postId) return null;
  return videoBlobUrlCache.get(postId) || null;
}

/**
 * Synchronously check if a post's video URL (full OR opening-frame head segment) is already cached in memory.
 */
export function getCachedPostVideoHeadUrl(postId?: string): string | null {
  if (!postId) return null;
  return videoBlobUrlCache.get(postId) || videoHeadBlobCache.get(postId) || null;
}

const POSTS_COLLECTION = 'community_posts';

/**
 * Create a new community post
 */
export async function createCommunityPost(
  author: UserProfile,
  params: CreatePostParams,
  onProgress?: (percent: number) => void
): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const postRef = doc(db, POSTS_COLLECTION, postId);

  const trimmedContent = (params.content || '').trim().slice(0, 2000);
  const derivedTitle = params.title?.trim()
    ? params.title.trim().slice(0, 150)
    : (trimmedContent.slice(0, 75) + (trimmedContent.length > 75 ? '...' : '')) || 'Citizen Post';

  const hasChunkedVideo = Array.isArray(params.videoChunks) && params.videoChunks.length > 0;

  const postData: any = {
    id: postId,
    authorId: author.uid,
    authorName: author.displayName,
    authorPhotoUrl: author.photoURL || '',
    authorCounty: author.county || '',
    title: derivedTitle,
    content: trimmedContent,
    category: params.category || 'general',
    county: params.county !== undefined ? params.county : '',
    upvotes: 0,
    upvoters: [],
    commentsCount: 0,
    createdAt: serverTimestamp(),
  };

  if (params.hotspotId && params.hotspotName) {
    postData.hotspotId = params.hotspotId;
    postData.hotspotName = params.hotspotName;
  }

  if (params.speedMbps !== undefined && !isNaN(params.speedMbps)) {
    postData.speedMbps = Number(params.speedMbps);
  }

  if (hasChunkedVideo) {
    postData.mediaType = 'video';
    postData.videoChunkCount = params.videoChunks!.length;
    postData.videoStatus = 'uploading';
    if (params.videoThumbnail) postData.videoThumbnail = params.videoThumbnail;
    if (params.videoDuration !== undefined) postData.videoDuration = Number(params.videoDuration);
    if (params.videoSizeBytes !== undefined) postData.videoSizeBytes = Math.round(params.videoSizeBytes);
    if (params.videoMimeType) postData.videoMimeType = params.videoMimeType.slice(0, 100);
  } else if (params.mediaUrl) {
    if (params.mediaUrl.length > 940000) {
      throw new Error('Attached media is too large to save. Please keep audio shouts under 30 seconds.');
    }
    postData.mediaUrl = params.mediaUrl;
    postData.mediaType =
      params.mediaType ||
      (params.mediaUrl.startsWith('data:video/')
        ? 'video'
        : params.mediaUrl.startsWith('data:audio/')
        ? 'audio'
        : 'image');
    if (postData.mediaType === 'video') {
      postData.videoStatus = 'ready';
      if (params.videoThumbnail) postData.videoThumbnail = params.videoThumbnail;
      if (params.videoDuration !== undefined) postData.videoDuration = Number(params.videoDuration);
      if (params.videoSizeBytes !== undefined) postData.videoSizeBytes = Math.round(params.videoSizeBytes);
      if (params.videoMimeType) postData.videoMimeType = params.videoMimeType.slice(0, 100);
    } else if (postData.mediaType === 'audio') {
      if (params.audioDuration !== undefined) {
        postData.audioDuration = Math.min(32, Math.max(0, Number(params.audioDuration)));
      }
      if (params.audioSizeBytes !== undefined) {
        postData.audioSizeBytes = Math.round(params.audioSizeBytes);
      }
      if (params.audioMimeType) {
        postData.audioMimeType = params.audioMimeType.slice(0, 100);
      }
    }
  }

  if (params.constituency) {
    postData.constituency = params.constituency;
  }

  if (params.mediaCaption) {
    postData.mediaCaption = params.mediaCaption.trim().slice(0, 200);
  }

  if (params.backgroundColor && params.backgroundColor !== 'default') {
    postData.backgroundColor = params.backgroundColor;
  }

  try {
    onProgress?.(hasChunkedVideo ? 5 : 50);
    await setDoc(postRef, postData);

    if (hasChunkedVideo && params.videoChunks) {
      const total = params.videoChunks.length;
      const uploadedChunkIds: string[] = [];
      const BATCH_CONCURRENCY = 4;

      try {
        for (let i = 0; i < total; i += BATCH_CONCURRENCY) {
          const slice = params.videoChunks.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            slice.map(async (chunkData, offset) => {
              const index = i + offset;
              const chunkId = `chunk_${index}`;
              const chunkRef = doc(db, POSTS_COLLECTION, postId, 'video_chunks', chunkId);
              const payload = {
                id: chunkId,
                postId,
                authorId: author.uid,
                index,
                data: chunkData,
                createdAt: serverTimestamp(),
              };

              let lastErr: unknown;
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  await setDoc(chunkRef, payload);
                  lastErr = null;
                  break;
                } catch (err: any) {
                  lastErr = err;
                  const code = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
                  if (
                    code === 'permission-denied' ||
                    code === 'resource-exhausted' ||
                    attempt === 2
                  ) {
                    throw err;
                  }
                  await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
                }
              }
              if (lastErr) throw lastErr;
              uploadedChunkIds.push(chunkId);
            })
          );
          const pct = Math.min(95, Math.round(10 + ((i + slice.length) / total) * 85));
          onProgress?.(pct);
        }

        await updateDoc(postRef, { videoStatus: 'ready' });
        // Pre-seed local cache so author's newly published video plays immediately
        try {
          const blob = base64ChunksToBlob(params.videoChunks, params.videoMimeType || 'video/mp4');
          const objectUrl = URL.createObjectURL(blob);
          videoBlobUrlCache.set(postId, objectUrl);
          saveVideoBlobToIDB(postId, blob);
        } catch {
          // Non-critical cache seed
        }
        onProgress?.(100);
      } catch (chunkErr) {
        // Rollback partial chunks & post document cleanly
        await Promise.allSettled([
          ...uploadedChunkIds.map((cid) => deleteDoc(doc(db, POSTS_COLLECTION, postId, 'video_chunks', cid))),
          deleteDoc(postRef),
        ]);
        handleFirestoreError(chunkErr, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}/video_chunks`);
      }
    } else {
      if (postData.mediaType === 'video' && params.mediaUrl) {
        const blobUrl = resolvePlayableVideoUrl(params.mediaUrl);
        if (blobUrl) videoBlobUrlCache.set(postId, blobUrl);
      }
      onProgress?.(100);
    }

    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Fetch ONLY the opening chunk (chunk_0: header + first few frames) of a chunked video
 * so adjacent videos can decode frame 0 with minimal bandwidth and Firestore reads.
 */
export async function fetchPostVideoHeadSegment(
  postId: string,
  mimeType: string = 'video/mp4',
  totalChunkCount?: number
): Promise<string | null> {
  if (!postId) return null;

  const fullCached = videoBlobUrlCache.get(postId);
  if (fullCached) return fullCached;

  const headCached = videoHeadBlobCache.get(postId);
  if (headCached) return headCached;

  const existingHeadPromise = inFlightHeadLoads.get(postId);
  if (existingHeadPromise) return existingHeadPromise;

  const loadHeadPromise = (async (): Promise<string | null> => {
    const chunkPath = `${POSTS_COLLECTION}/${postId}/video_chunks/chunk_0`;
    try {
      let chunkData: string | undefined;

      try {
        // 1. Check persistent IndexedDB cache first (zero Firestore reads)
        const cachedBlob = await getVideoBlobFromIDB(postId);
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          videoBlobUrlCache.set(postId, objectUrl);
          return objectUrl;
        }

        if (isFirestoreQuotaExceeded()) {
          return null;
        }

        // 2. Fetch ONLY chunk_0 via getDoc (1 Firestore read instead of all chunks)
        const chunk0Ref = doc(db, POSTS_COLLECTION, postId, 'video_chunks', 'chunk_0');
        const chunk0Snap = await getDoc(chunk0Ref);
        if (!chunk0Snap.exists()) {
          return null;
        }

        chunkData = (chunk0Snap.data() as { data?: string })?.data;
      } catch (error) {
        handleFirestoreListenerError(error, OperationType.GET, chunkPath);
        return null;
      }

      if (!chunkData) {
        return null;
      }

      try {
        const blob = base64ChunksToBlob([chunkData], mimeType);
        const objectUrl = URL.createObjectURL(blob);

        if (totalChunkCount === 1) {
          // Single-chunk video is already complete!
          videoBlobUrlCache.set(postId, objectUrl);
          saveVideoBlobToIDB(postId, blob);
          return objectUrl;
        }

        evictOldestHeadCacheIfNeeded();
        videoHeadChunkDataCache.set(postId, chunkData);
        videoHeadBlobCache.set(postId, objectUrl);
        return objectUrl;
      } catch (decodeErr) {
        console.warn(`Could not decode video head chunk for ${postId}:`, decodeErr);
        return null;
      }
    } finally {
      inFlightHeadLoads.delete(postId);
    }
  })();

  inFlightHeadLoads.set(postId, loadHeadPromise);
  return loadHeadPromise;
}

/**
 * Fetch and assemble chunked video segments from IndexedDB or Firestore into a cached Blob Object URL.
 * Reuses cached `chunk_0` if already preloaded so `chunk_0` is never read twice.
 */
export async function fetchAndAssemblePostVideo(
  postId: string,
  mimeType: string = 'video/mp4',
  expectedChunkCount?: number
): Promise<string> {
  const cached = videoBlobUrlCache.get(postId);
  if (cached) return cached;

  const existingPromise = inFlightVideoLoads.get(postId);
  if (existingPromise) return existingPromise;

  const loadPromise = (async () => {
    const chunksPath = `${POSTS_COLLECTION}/${postId}/video_chunks`;
    try {
      let orderedData: string[] | null = null;

      try {
        // 1. Check persistent IndexedDB cache first (zero network/Firestore reads)
        const cachedBlob = await getVideoBlobFromIDB(postId);
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          videoBlobUrlCache.set(postId, objectUrl);
          return objectUrl;
        }

        if (isFirestoreQuotaExceeded()) {
          throw new Error('Database daily free read quota reached. Cached data remains available; quota resets tomorrow.');
        }

        // 2. If chunk_0 was already preloaded for head frames, fetch only remaining chunk_1..chunk_{N-1}
        const cachedChunk0Data = videoHeadChunkDataCache.get(postId);
        if (cachedChunk0Data && expectedChunkCount && expectedChunkCount > 1) {
          try {
            const remainingIndices = Array.from(
              { length: expectedChunkCount - 1 },
              (_, idx) => idx + 1
            );
            const remainingSnaps = await Promise.all(
              remainingIndices.map((idx) =>
                getDoc(doc(db, POSTS_COLLECTION, postId, 'video_chunks', `chunk_${idx}`))
              )
            );
            const allValid = remainingSnaps.every(
              (s) => s.exists() && typeof (s.data() as { data?: string })?.data === 'string'
            );
            if (allValid) {
              orderedData = [
                cachedChunk0Data,
                ...remainingSnaps.map((s) => (s.data() as { data: string }).data)
              ];
            }
          } catch {
            orderedData = null;
          }
        }

        // 3. Full collection fallback when chunk_0 isn't cached or indexed fetch fell short
        if (!orderedData) {
          const chunksRef = collection(db, POSTS_COLLECTION, postId, 'video_chunks');
          const snap = await getDocs(chunksRef);
          if (snap.empty) {
            throw new Error('Video data is unavailable.');
          }
          const ordered = snap.docs
            .map((d) => d.data() as { index: number; data: string })
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
          orderedData = ordered.map((c) => c.data);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, chunksPath);
      }

      try {
        const blob = base64ChunksToBlob(orderedData, mimeType);
        const objectUrl = URL.createObjectURL(blob);
        videoBlobUrlCache.set(postId, objectUrl);
        // Persist in background for instant replay across page loads
        saveVideoBlobToIDB(postId, blob);
        return objectUrl;
      } catch (decodeErr) {
        console.warn(`Could not decode video chunks for ${postId}:`, decodeErr);
        throw new Error('This video clip could not be decoded in your browser.');
      }
    } finally {
      inFlightVideoLoads.delete(postId);
    }
  })();

  inFlightVideoLoads.set(postId, loadPromise);
  return loadPromise;
}

/**
 * Intelligently preload ONLY the first few frames (`chunk_0`) of an upcoming or adjacent video
 * without downloading the full multi-chunk payload until the user actively views it.
 */
export function prefetchVideoHeadFrames(post: CommunityPost): Promise<string | null> {
  if (!post?.id) return Promise.resolve(null);
  if (post.mediaUrl) {
    return Promise.resolve(resolvePlayableVideoUrl(post.mediaUrl) || post.mediaUrl);
  }
  if (!post.videoChunkCount || post.videoChunkCount <= 0) return Promise.resolve(null);
  const fullCached = videoBlobUrlCache.get(post.id);
  if (fullCached) return Promise.resolve(fullCached);
  const headCached = videoHeadBlobCache.get(post.id);
  if (headCached) return Promise.resolve(headCached);
  if (isFirestoreQuotaExceeded()) return Promise.resolve(null);

  return fetchPostVideoHeadSegment(
    post.id,
    post.videoMimeType || 'video/mp4',
    post.videoChunkCount
  ).catch(() => null);
}

/**
 * Quietly prefetch a chunked video post's opening frames in the background.
 */
export function prefetchPostVideo(post: CommunityPost): void {
  void prefetchVideoHeadFrames(post);
}

const POSTS_CACHE_KEY = 'tujuane_posts_cache_v1';

function loadCachedPostsSnapshot(): CommunityPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CommunityPost[]) : [];
  } catch {
    return [];
  }
}

function saveCachedPostsSnapshot(posts: CommunityPost[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Strip heavy inline data URIs from localStorage fallback cache so storage never overflows
    const compact = posts.slice(0, 30).map((p) => ({
      ...p,
      mediaUrl: p.mediaUrl && p.mediaUrl.length > 60_000 ? undefined : p.mediaUrl,
      videoThumbnail: p.videoThumbnail && p.videoThumbnail.length > 35_000 ? undefined : p.videoThumbnail
    }));
    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(compact));
  } catch {
    // ignore storage quota errors
  }
}

function applyPostFiltersInMemory(
  rawPosts: CommunityPost[],
  filters: { county?: string; constituency?: string; category?: string; sortBy?: 'latest' | 'popular' }
): CommunityPost[] {
  let posts = [...rawPosts];
  if (filters.county && filters.county !== 'All') {
    posts = posts.filter((p) => (p.county || '').toLowerCase() === filters.county!.toLowerCase());
  }
  if (filters.constituency && filters.constituency !== 'All') {
    posts = posts.filter((p) => (p.constituency || '').toLowerCase() === filters.constituency!.toLowerCase());
  }
  if (filters.category && filters.category !== 'all') {
    posts = posts.filter((p) => p.category === filters.category);
  }
  if (filters.sortBy === 'popular') {
    posts.sort((a, b) => b.upvotes - a.upvotes);
  }
  return posts;
}

async function getDocPreferCache(ref: ReturnType<typeof doc>): Promise<DocumentSnapshot> {
  try {
    const cached = await getDocFromCache(ref);
    if (cached.exists()) return cached;
  } catch {
    // cache miss
  }
  return getDoc(ref);
}

/**
 * Real-time listener for community posts with optional county, constituency and category filtering
 */
export function subscribeToCommunityPosts(
  filters: { county?: string; constituency?: string; category?: string; sortBy?: 'latest' | 'popular'; maxPosts?: number },
  callback: (posts: CommunityPost[]) => void
): () => void {
  const cachedInitial = loadCachedPostsSnapshot();
  if (cachedInitial.length > 0) {
    callback(applyPostFiltersInMemory(cachedInitial, filters));
  }

  if (isFirestoreQuotaExceeded()) {
    if (cachedInitial.length === 0) callback([]);
    return () => {};
  }

  const postsRef = collection(db, POSTS_COLLECTION);
  const q = query(postsRef, orderBy('createdAt', 'desc'), limit(filters.maxPosts ?? 40));

  return onSnapshot(
    q,
    (snapshot) => {
      const rawPosts: CommunityPost[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          authorId: d.authorId,
          authorName: d.authorName || 'Kenya Community Member',
          authorPhotoUrl: d.authorPhotoUrl || undefined,
          authorCounty: d.authorCounty || 'Kenya',
          title: d.title || 'Community Update',
          content: d.content || '',
          category: d.category || 'general',
          county: d.county || '',
          constituency: d.constituency || undefined,
          hotspotId: d.hotspotId,
          hotspotName: d.hotspotName,
          speedMbps: d.speedMbps !== undefined ? Number(d.speedMbps) : undefined,
          mediaUrl: d.mediaUrl || undefined,
          mediaType:
            d.mediaType === 'video' || d.mediaType === 'image' || d.mediaType === 'audio'
              ? d.mediaType
              : typeof d.mediaUrl === 'string' && d.mediaUrl.startsWith('data:video/')
              ? 'video'
              : typeof d.mediaUrl === 'string' && d.mediaUrl.startsWith('data:audio/')
              ? 'audio'
              : (d.videoChunkCount ?? 0) > 0
              ? 'video'
              : d.mediaUrl
              ? 'image'
              : undefined,
          mediaCaption: d.mediaCaption || undefined,
          videoThumbnail: d.videoThumbnail || undefined,
          videoDuration: typeof d.videoDuration === 'number' ? d.videoDuration : undefined,
          videoSizeBytes: typeof d.videoSizeBytes === 'number' ? d.videoSizeBytes : undefined,
          videoChunkCount: typeof d.videoChunkCount === 'number' ? d.videoChunkCount : undefined,
          videoMimeType: d.videoMimeType || undefined,
          videoStatus: d.videoStatus || undefined,
          audioDuration: typeof d.audioDuration === 'number' ? d.audioDuration : undefined,
          audioSizeBytes: typeof d.audioSizeBytes === 'number' ? d.audioSizeBytes : undefined,
          audioMimeType: d.audioMimeType || undefined,
          backgroundColor: d.backgroundColor || undefined,
          upvotes: typeof d.upvotes === 'number' ? d.upvotes : (d.upvoters?.length || 0),
          upvoters: Array.isArray(d.upvoters) ? d.upvoters : [],
          reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
          reactionsCount: d.reactionsCount && typeof d.reactionsCount === 'object' ? d.reactionsCount : {},
          commentsCount: typeof d.commentsCount === 'number' ? d.commentsCount : 0,
          isFlagged: !!d.isFlagged,
          safetyCategory: d.safetyCategory,
          safetyReason: d.safetyReason,
          safetyAdvisory: d.safetyAdvisory,
          moderationStatus: d.moderationStatus || 'approved',
          reportCount: typeof d.reportCount === 'number' ? d.reportCount : 0,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : undefined,
        };
      }).filter((p) => p.videoStatus !== 'uploading');

      if (rawPosts.length > 0) {
        saveCachedPostsSnapshot(rawPosts);
      }

      callback(applyPostFiltersInMemory(rawPosts, filters));
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.GET, POSTS_COLLECTION, () => {
        callback(applyPostFiltersInMemory(loadCachedPostsSnapshot(), filters));
      });
    }
  );
}

/**
 * Toggle upvote for a community post
 */
export async function toggleUpvotePost(postId: string, userId: string): Promise<boolean> {
  const postRef = doc(db, POSTS_COLLECTION, postId);

  try {
    const postSnap = await getDocPreferCache(postRef);
    if (!postSnap.exists()) return false;

    const data = postSnap.data();
    const upvoters: string[] = data.upvoters || [];
    const hasUpvoted = upvoters.includes(userId);

    if (hasUpvoted) {
      await updateDoc(postRef, {
        upvoters: arrayRemove(userId),
        upvotes: increment(-1),
      });
      return false;
    } else {
      await updateDoc(postRef, {
        upvoters: arrayUnion(userId),
        upvotes: increment(1),
      });
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Add a comment to a post
 */
export async function addCommunityComment(
  postId: string,
  author: UserProfile,
  content: string,
  mediaUrl?: string,
  replyToCommentId?: string,
  replyToAuthorName?: string
): Promise<string> {
  const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
  const postRef = doc(db, POSTS_COLLECTION, postId);

  const commentPayload: any = {
    id: commentId,
    postId,
    authorId: author.uid,
    authorName: author.displayName,
    authorPhotoUrl: author.photoURL || '',
    content: content.trim().slice(0, 1000),
    createdAt: serverTimestamp(),
  };

  if (mediaUrl) {
    commentPayload.mediaUrl = mediaUrl;
  }

  if (replyToCommentId) {
    commentPayload.replyToCommentId = replyToCommentId;
  }

  if (replyToAuthorName) {
    commentPayload.replyToAuthorName = replyToAuthorName;
  }

  try {
    await setDoc(commentRef, commentPayload);
    // Increment comment count on the post
    await updateDoc(postRef, {
      commentsCount: increment(1),
    });
    // Track authored comment counter on user profile for achievement badges
    updateDoc(doc(db, 'users', author.uid), {
      feedCommentsCount: increment(1),
    }).catch(() => {});
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${POSTS_COLLECTION}/${postId}/comments/${commentId}`);
  }
}

/**
 * Subscribe to comments for a specific post
 */
export function subscribeToPostComments(
  postId: string,
  callback: (comments: CommunityComment[]) => void
): () => void {
  const path = `${POSTS_COLLECTION}/${postId}/comments`;
  const commentsRef = collection(db, POSTS_COLLECTION, postId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'), limit(60));

  return onSnapshot(
    q,
    (snapshot) => {
      const comments: CommunityComment[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          postId,
          authorId: d.authorId,
          authorName: d.authorName || 'Kenya Community Member',
          authorPhotoUrl: d.authorPhotoUrl || undefined,
          content: d.content || '',
          mediaUrl: d.mediaUrl || undefined,
          replyToCommentId: d.replyToCommentId || undefined,
          replyToAuthorName: d.replyToAuthorName || undefined,
          reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
          reactionsCount: d.reactionsCount && typeof d.reactionsCount === 'object' ? d.reactionsCount : {},
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
        };
      });
      callback(comments);
    },
    (error) => {
      handleFirestoreListenerError(error, OperationType.GET, path, () => callback([]));
    }
  );
}

/**
 * Toggle or set a reaction on a community post (strictly one reaction per user)
 */
export async function reactToCommunityPost(
  postId: string,
  userId: string,
  reactionKey: string
): Promise<{ reaction: string | null; reactionsCount: Record<string, number> }> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    const postSnap = await getDocPreferCache(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const data = postSnap.data();
    const currentReactions: Record<string, string> = { ...(data.reactions || {}) };
    const currentCounts: Record<string, number> = { ...(data.reactionsCount || {}) };
    const previousReaction = currentReactions[userId];

    let newReaction: string | null = reactionKey;

    if (previousReaction === reactionKey) {
      // User tapped the same active reaction -> un-react
      delete currentReactions[userId];
      currentCounts[reactionKey] = Math.max(0, (currentCounts[reactionKey] || 1) - 1);
      if (currentCounts[reactionKey] === 0) {
        delete currentCounts[reactionKey];
      }
      newReaction = null;
    } else {
      // User is changing reaction or adding a new one
      if (previousReaction && currentCounts[previousReaction]) {
        currentCounts[previousReaction] = Math.max(0, currentCounts[previousReaction] - 1);
        if (currentCounts[previousReaction] === 0) {
          delete currentCounts[previousReaction];
        }
      }
      currentReactions[userId] = reactionKey;
      currentCounts[reactionKey] = (currentCounts[reactionKey] || 0) + 1;
    }

    // Maintain upvotes & upvoters array for backward compatibility
    let upvoters: string[] = Array.isArray(data.upvoters) ? [...data.upvoters] : [];
    if (newReaction) {
      if (!upvoters.includes(userId)) upvoters.push(userId);
    } else {
      upvoters = upvoters.filter((id) => id !== userId);
    }
    const totalReactions = Object.values(currentCounts).reduce((acc, c) => acc + c, 0);

    await updateDoc(postRef, {
      reactions: currentReactions,
      reactionsCount: currentCounts,
      upvotes: totalReactions,
      upvoters
    });

    return { reaction: newReaction, reactionsCount: currentCounts };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}`);
  }
}

/**
 * Toggle or set a reaction on a comment (strictly one reaction per user)
 */
export async function reactToCommunityComment(
  postId: string,
  commentId: string,
  userId: string,
  reactionKey: string
): Promise<{ reaction: string | null; reactionsCount: Record<string, number> }> {
  const commentRef = doc(db, POSTS_COLLECTION, postId, 'comments', commentId);
  try {
    const commentSnap = await getDocPreferCache(commentRef);
    if (!commentSnap.exists()) {
      throw new Error('Comment not found');
    }

    const data = commentSnap.data();
    const currentReactions: Record<string, string> = { ...(data.reactions || {}) };
    const currentCounts: Record<string, number> = { ...(data.reactionsCount || {}) };
    const previousReaction = currentReactions[userId];

    let newReaction: string | null = reactionKey;

    if (previousReaction === reactionKey) {
      // User tapped the same active reaction -> un-react
      delete currentReactions[userId];
      currentCounts[reactionKey] = Math.max(0, (currentCounts[reactionKey] || 1) - 1);
      if (currentCounts[reactionKey] === 0) {
        delete currentCounts[reactionKey];
      }
      newReaction = null;
    } else {
      // User is changing reaction or adding a new one
      if (previousReaction && currentCounts[previousReaction]) {
        currentCounts[previousReaction] = Math.max(0, currentCounts[previousReaction] - 1);
        if (currentCounts[previousReaction] === 0) {
          delete currentCounts[previousReaction];
        }
      }
      currentReactions[userId] = reactionKey;
      currentCounts[reactionKey] = (currentCounts[reactionKey] || 0) + 1;
    }

    await updateDoc(commentRef, {
      reactions: currentReactions,
      reactionsCount: currentCounts
    });

    return { reaction: newReaction, reactionsCount: currentCounts };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POSTS_COLLECTION}/${postId}/comments/${commentId}`);
  }
}

/**
 * Delete a post (allowed if author or developer/moderator)
 */
export async function deleteCommunityPost(
  postId: string,
  userId: string,
  isDeveloper: boolean = false
): Promise<void> {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  try {
    const snap = await getDocPreferCache(postRef);
    if (!snap.exists()) return;
    const authorId = snap.data().authorId;
    if (authorId !== userId && !isDeveloper) {
      throw new Error('Unauthorized: You can only delete your own posts.');
    }

    // Clean up any video_chunks subcollection documents
    const chunksSnap = await getDocs(collection(db, POSTS_COLLECTION, postId, 'video_chunks'));
    if (!chunksSnap.empty) {
      await Promise.allSettled(chunksSnap.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));
    }

    const cachedUrl = videoBlobUrlCache.get(postId);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      videoBlobUrlCache.delete(postId);
    }

    await deleteDoc(postRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${POSTS_COLLECTION}/${postId}`);
  }
}
