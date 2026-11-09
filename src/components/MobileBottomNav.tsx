import React from 'react';
import { Home, Users, MessageSquare, Flame, Vote, Bell } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingFriendRequestsCount?: number;
  unreadNotificationsCount?: number;
  unreadMessagesCount?: number;
  onOpenNotifications?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendingFriendRequestsCount = 0,
  unreadNotificationsCount = 0,
  unreadMessagesCount = 0,
  onOpenNotifications
}) => {
  const tabs = [
    { id: 'landing', label: 'Hub', icon: Home },
    { id: 'community', label: 'Feed', icon: Flame },
    { id: 'polls', label: 'Polls', icon: Vote },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'members', label: 'Members', icon: Users },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 py-1 shadow-lg transition-colors">
      <div className="grid grid-cols-5 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors group cursor-pointer"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform group-active:scale-90 ${
                    isActive ? 'text-emerald-700 dark:text-emerald-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                {tab.id === 'chat' && unreadMessagesCount > 0 ? (
                  <span className="absolute -top-1 -right-2 bg-emerald-600 text-white font-black text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 animate-pulse shadow-xs">
                    {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                  </span>
                ) : tab.id === 'chat' ? (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                ) : null}
                {tab.id === 'members' && pendingFriendRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                    {pendingFriendRequestsCount > 9 ? '9+' : pendingFriendRequestsCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap ${
                  isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
