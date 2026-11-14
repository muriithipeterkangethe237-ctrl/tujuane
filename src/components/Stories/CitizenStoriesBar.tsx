import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Video,
  Camera,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { UserProfile } from '../../types/chat';
import { CitizenStory, UserStoryGroup } from '../../types/story';
import {
  subscribeToActiveStories,
  groupStoriesByAuthor
} from '../../services/storyService';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewerModal } from './StoryViewerModal';
import { useAuth } from '../../context/AuthContext';
import { resolveLiveAuthor } from '../../utils/profileUtils';

interface CitizenStoriesBarProps {
  currentUser: any;
  userProfile: UserProfile | null;
  onOpenAuthModal: (mode?: 'login' | 'register') => void;
  onViewUserProfile?: (user: UserProfile) => void;
}

export const CitizenStoriesBar: React.FC<CitizenStoriesBarProps> = ({
  currentUser,
  userProfile,
  onOpenAuthModal,
  onViewUserProfile
}) => {
  const { usersById } = useAuth();
  const [stories, setStories] = useState<CitizenStory[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | undefined>(undefined);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time 24h active stories
  useEffect(() => {
    const unsub = subscribeToActiveStories((activeStories) => {
      setStories(activeStories);
    });
    return () => unsub();
  }, []);

  const storyGroups: UserStoryGroup[] = groupStoriesByAuthor(stories, currentUser?.uid);
  const myGroup = currentUser ? storyGroups.find((g) => g.authorId === currentUser.uid) : null;
  const otherGroups = storyGroups.filter((g) => g.authorId !== currentUser?.uid);

  const handleOpenMyStoryOrAdd = () => {
    if (!currentUser) {
      onOpenAuthModal('register');
      return;
    }
    if (myGroup && myGroup.stories.length > 0) {
      // If user already has active stories, open viewer on their story
      setSelectedAuthorId(currentUser.uid);
      setIsViewerOpen(true);
    } else {
      setIsCreateOpen(true);
    }
  };

  const handleOpenAuthorStories = (authorId: string) => {
    setSelectedAuthorId(authorId);
    setIsViewerOpen(true);
  };

  const scrollTray = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -260 : 260;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Stories Tray Carousel */}
      <div className="tujuane-surface rounded-2xl p-3 sm:p-4 relative transition-colors">
        <div className="flex items-center justify-between pb-2.5 mb-1 px-1 border-b tujuane-divider">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
            <span>Citizen Stories</span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
              Photos & Videos (24h)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  onOpenAuthModal('register');
                } else {
                  setIsCreateOpen(true);
                }
              }}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Post Story</span>
            </button>
          </div>
        </div>

        {/* Scrollable Story Avatars Strip */}
        <div className="relative group">
          {/* Scroll Buttons for Desktop */}
          <button
            type="button"
            onClick={() => scrollTray('left')}
            className="hidden md:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 items-center justify-center shadow-md hover:bg-slate-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            title="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollTray('right')}
            className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 items-center justify-center shadow-md hover:bg-slate-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            title="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div
            ref={scrollContainerRef}
            className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-1.5 scrollbar-none scroll-smooth"
          >
            {/* 1. "Your Story" Circle */}
            <div className="flex flex-col items-center shrink-0 w-16 sm:w-18 cursor-pointer group/item">
              <div className="relative" onClick={handleOpenMyStoryOrAdd}>
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 flex items-center justify-center transition-transform group-hover/item:scale-105 ${
                    myGroup && myGroup.stories.length > 0
                      ? 'bg-gradient-to-tr from-emerald-500 via-teal-400 to-green-500 shadow-sm'
                      : 'border-2 border-dashed border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {userProfile?.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.displayName}
                      className="w-full h-full rounded-full object-cover border-2 border-white dark:border-slate-900"
                    />
                  ) : currentUser ? (
                    <div className="w-full h-full rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-sm border-2 border-white dark:border-slate-900">
                      {(userProfile?.displayName || currentUser.displayName || 'C').charAt(0)}
                    </div>
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-sm border-2 border-white dark:border-slate-900">
                      <Camera className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Plus Icon Badge to post */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!currentUser) {
                      onOpenAuthModal('register');
                    } else {
                      setIsCreateOpen(true);
                    }
                  }}
                  className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-sm cursor-pointer transition-transform hover:scale-110"
                  title="Add to story"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>

              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mt-1.5 truncate text-center w-full">
                {myGroup && myGroup.stories.length > 0 ? 'Your Story' : 'Add Story'}
              </span>
              <span className="text-[9px] text-slate-400 truncate">
                {myGroup && myGroup.stories.length > 0 ? `${myGroup.stories.length} live` : 'Share 24h'}
              </span>
            </div>

            {/* 2. Other Citizens' Story Circles */}
            {otherGroups.map((group) => {
              const hasVideo = group.stories.some((s) => s.type === 'video');
              const liveAuthor = resolveLiveAuthor(
                group.authorId,
                {
                  displayName: group.authorName,
                  photoURL: group.authorPhotoUrl,
                  county: group.authorCounty
                },
                usersById
              );
              const firstName = liveAuthor.displayName.split(' ')[0] || liveAuthor.displayName;

              return (
                <div
                  key={group.authorId}
                  onClick={() => handleOpenAuthorStories(group.authorId)}
                  className="flex flex-col items-center shrink-0 w-16 sm:w-18 cursor-pointer group/item"
                >
                  <div className="relative">
                    <div
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 flex items-center justify-center transition-transform group-hover/item:scale-105 ${
                        group.hasUnviewed
                          ? 'bg-gradient-to-tr from-emerald-500 via-teal-400 to-green-500 shadow-sm animate-pulse'
                          : 'border-2 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {liveAuthor.photoURL ? (
                        <img
                          src={liveAuthor.photoURL}
                          alt={liveAuthor.displayName}
                          className="w-full h-full rounded-full object-cover border-2 border-white dark:border-slate-900"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-sm border-2 border-white dark:border-slate-900">
                          {liveAuthor.displayName.charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Media Type Badge: Video or Photo */}
                    <div
                      className={`absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs text-white ${
                        hasVideo ? 'bg-rose-500' : 'bg-emerald-600'
                      }`}
                      title={hasVideo ? 'Contains video story' : 'Contains photo story'}
                    >
                      {hasVideo ? <Video className="w-2.5 h-2.5" /> : <Camera className="w-2.5 h-2.5" />}
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 truncate text-center w-full">
                    {firstName}
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-full">
                    {liveAuthor.county ? `${liveAuthor.county}` : 'Kenya'}
                  </span>
                </div>
              );
            })}

            {/* Empty state hint if only user is there */}
            {otherGroups.length === 0 && (
              <div className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 whitespace-nowrap flex items-center gap-1.5">
                <span>Be the first to post a photo or video story today!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Story Creation Modal */}
      <CreateStoryModal
        isOpen={isCreateOpen}
        currentUser={currentUser}
        userProfile={userProfile}
        onClose={() => setIsCreateOpen(false)}
        onStoryPublished={(storyId) => {
          setSelectedAuthorId(currentUser?.uid);
          setIsViewerOpen(true);
        }}
      />

      {/* Story Fullscreen Viewer Modal */}
      <StoryViewerModal
        isOpen={isViewerOpen}
        storyGroups={storyGroups}
        initialAuthorId={selectedAuthorId}
        currentUser={currentUser}
        userProfile={userProfile}
        onClose={() => setIsViewerOpen(false)}
        onViewUserProfile={onViewUserProfile}
      />
    </>
  );
};
