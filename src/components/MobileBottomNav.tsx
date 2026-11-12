import React from 'react';
import { Home, Users, MessageSquare, Flame, Plus } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingFriendRequestsCount?: number;
  unreadNotificationsCount?: number;
  unreadMessagesCount?: number;
  onOpenNotifications?: () => void;
  onDirectPost?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendingFriendRequestsCount = 0,
  unreadNotificationsCount = 0,
  unreadMessagesCount = 0,
  onOpenNotifications,
  onDirectPost
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 py-1 shadow-lg transition-colors">
      <div className="grid grid-cols-5 items-center">
        {/* 1. Hub */}
        <button
          type="button"
          onClick={() => setActiveTab('landing')}
          className="flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors group cursor-pointer"
        >
          <Home
            className={`w-5 h-5 transition-transform group-active:scale-90 ${
              activeTab === 'landing' ? 'text-emerald-700 dark:text-emerald-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-500'
            }`}
          />
          <span
            className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap ${
              activeTab === 'landing' ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Hub
          </span>
        </button>

        {/* 2. Feed */}
        <button
          type="button"
          onClick={() => setActiveTab('community')}
          className="flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors group cursor-pointer"
        >
          <Flame
            className={`w-5 h-5 transition-transform group-active:scale-90 ${
              activeTab === 'community' ? 'text-emerald-700 dark:text-emerald-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-500'
            }`}
          />
          <span
            className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap ${
              activeTab === 'community' ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Feed
          </span>
        </button>

        {/* 3. Center Action: Direct Post Plus Sign */}
        <button
          type="button"
          onClick={onDirectPost}
          className="flex flex-col items-center justify-center -mt-3.5 group cursor-pointer"
          title="Create Direct Post"
          aria-label="Direct Post"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white flex items-center justify-center shadow-lg shadow-emerald-600/35 ring-3 ring-white dark:ring-slate-900 group-active:scale-90 transition-all">
            <Plus className="w-6 h-6 stroke-[3]" />
          </div>
          <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 mt-1 tracking-tight">
            Post
          </span>
        </button>

        {/* 4. Chat */}
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className="flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors group cursor-pointer"
        >
          <div className="relative">
            <MessageSquare
              className={`w-5 h-5 transition-transform group-active:scale-90 ${
                activeTab === 'chat' ? 'text-emerald-700 dark:text-emerald-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            {unreadMessagesCount > 0 ? (
              <span className="absolute -top-1 -right-2 bg-emerald-600 text-white font-black text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 animate-pulse shadow-xs">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            ) : null}
          </div>
          <span
            className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap ${
              activeTab === 'chat' ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Chat
          </span>
        </button>

        {/* 5. Members */}
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className="flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors group cursor-pointer"
        >
          <div className="relative">
            <Users
              className={`w-5 h-5 transition-transform group-active:scale-90 ${
                activeTab === 'members' ? 'text-emerald-700 dark:text-emerald-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            {pendingFriendRequestsCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                {pendingFriendRequestsCount > 9 ? '9+' : pendingFriendRequestsCount}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap ${
              activeTab === 'members' ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Members
          </span>
        </button>
      </div>
    </nav>
  );
};
