import React, { useState } from 'react';
import {
  Users,
  MessageSquare,
  Flame,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Compass,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  Share2,
  Vote
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LandingPageProps {
  onNavigate: (tab: string, countyFilter?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { currentUser, openAuthModal } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const countyHighlights = [
    { name: 'Nairobi', description: 'Capital city hub: Tech, creative gigs, campus events, and urban hustles.' },
    { name: 'Mombasa', description: 'Coastal community: Local business, arts, tourism updates, and county meetups.' },
    { name: 'Kisumu', description: 'Lakeside network: Innovation, community agricultural trade, and youth initiatives.' },
    { name: 'Nakuru', description: 'Rift Valley center: Farming opportunities, student forums, and town happenings.' },
    { name: 'Uasin Gishu', description: 'North Rift hub (Eldoret): Athletics, entrepreneurship, and local county stories.' },
    { name: 'Kiambu', description: 'Metropolitan circle: Agri-tech, real estate discussions, and young professionals.' },
  ];

  const communityPillars = [
    {
      title: 'Daily Community Polls',
      desc: 'Cast your vote on Kenyan cultural debates, devolution priorities, and matatu lifestyle with instant live percentage breakdowns.',
      icon: Vote,
      color: 'rose',
      tab: 'polls',
    },
    {
      title: 'Community Feed',
      desc: 'Browse and share authentic stories, neighborhood news, hustle opportunities, and questions across all 47 counties.',
      icon: Flame,
      color: 'emerald',
      tab: 'community',
    },
    {
      title: '1-on-1 Direct Chat',
      desc: 'Engage in private real-time direct messaging with verified community members. Exchange ideas and attach photos.',
      icon: MessageSquare,
      color: 'sky',
      tab: 'chat',
    },
    {
      title: 'Members Directory',
      desc: 'Discover peers, creators, and potential collaborators near you. Filter by county and active presence.',
      icon: Users,
      color: 'purple',
      tab: 'members',
    },
    {
      title: 'Media Photo Sharing',
      desc: 'Upload event photos, local scenes, or product images with automatic data-friendly compression.',
      icon: ImageIcon,
      color: 'amber',
      tab: 'community',
    },
  ];

  const faqs = [
    {
      q: 'What is TUJUANE?',
      a: 'TUJUANE (Swahili for "Let us know each other") is an open Kenyan civic community interaction platform designed for people across all 47 counties to connect, discuss local happenings, share opportunities, and converse one-on-one in a safe, constructive environment.',
    },
    {
      q: 'How does 1-on-1 Direct Chat work?',
      a: 'Once you sign in with your Google account, you can click "Chat" next to any post author or browse the Members Directory. All direct conversations update in real-time through secure cloud synchronization, with photo attachment support.',
    },
    {
      q: 'Can I connect with members from specific Kenyan counties?',
      a: 'Yes! Both the Community Feed and the Members Directory include county filters. Whether you want to see what is happening in Nairobi, Mombasa, Kisumu, Nakuru, or Eldoret, you can filter discussions and members with one click.',
    },
    {
      q: 'How does photo compression work?',
      a: 'When you upload an image to the feed or a direct chat, TUJUANE compresses the photo directly inside your browser before uploading. This ensures fast sending even on basic 3G or 4G mobile data connections.',
    },
    {
      q: 'Is TUJUANE free to use?',
      a: 'Yes, TUJUANE is completely free for all citizens. There are no paywalls, hidden fees, or subscription charges.',
    },
  ];

  return (
    <div className="space-y-16 py-4">
      {/* 1. Hero Section */}
      <section className="bg-gradient-to-br from-slate-900/92 via-emerald-950/90 to-slate-900/92 backdrop-blur-md rounded-3xl p-6 sm:p-10 lg:p-14 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-8 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-emerald-300 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Jukwaa la Wakenya Kujuana na Kusaidiana</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Karibu TUJUANE: Connect, Converse & Collaborate Across Kenya
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
              An open citizen community platform where Kenyans meet, discuss local happenings,
              support neighborhood hustles, share photos, and message one-on-one in real-time.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onNavigate('polls')}
                className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg hover:shadow-amber-500/25 flex items-center gap-2 cursor-pointer"
              >
                <Vote className="w-4 h-4 fill-slate-950" />
                <span>Daily Community Poll</span>
                <span className="bg-slate-950/20 text-slate-950 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold uppercase">
                  Live
                </span>
              </button>

              <button
                onClick={() => onNavigate('community')}
                className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2 cursor-pointer"
              >
                <Flame className="w-4 h-4 fill-slate-950" />
                <span>Community Feed</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate('chat')}
                className="px-6 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Open 1-on-1 Chat</span>
              </button>

              {!currentUser && (
                <button
                  type="button"
                  onClick={() => openAuthModal('register')}
                  className="px-5 py-3.5 bg-white text-slate-900 font-bold text-xs sm:text-sm rounded-xl hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Create an account or sign in"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Register / Sign In</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-slate-300 border-t border-white/10">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Civic & Respectful Space</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>47 County Circles</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Direct Citizen-to-Citizen</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 hidden lg:flex flex-col gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Active Today</span>
              </div>
              <p className="text-xs text-slate-200">
                Kenyans are currently discussing student tech hubs in Nairobi, coastal tourism gigs in Mombasa, and agri-business ideas in Nakuru.
              </p>
              <button
                onClick={() => onNavigate('community')}
                className="text-xs text-emerald-300 font-bold hover:underline flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Join the discussions</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>New to the County?</span>
              </div>
              <p className="text-xs text-slate-200">
                Browse our Community Directory to meet fellow residents, ask for neighborhood recommendations, or make new friends.
              </p>
              <button
                onClick={() => onNavigate('members')}
                className="text-xs text-emerald-300 font-bold hover:underline flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Browse members</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Four Main Community Features */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Platform Features</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Everything You Need to Connect
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            A purposeful platform crafted for real conversations, mutual assistance, and shared opportunities.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {communityPillars.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                onClick={() => onNavigate(p.tab)}
                className="tujuane-surface rounded-2xl p-6 hover:opacity-95 transition-all cursor-pointer flex flex-col justify-between group space-y-4"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {p.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {p.desc}
                  </p>
                </div>

                <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Open {p.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. County Circles Exploration */}
      <section className="tujuane-surface rounded-3xl p-6 sm:p-10 space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>47 County Circles</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Explore Discussions by County
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Connect with citizens living or working in your specific county or home region.
            </p>
          </div>

          <button
            onClick={() => onNavigate('members')}
            className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>View All County Members</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {countyHighlights.map((county) => (
            <button
              key={county.name}
              onClick={() => onNavigate('community', county.name)}
              className="p-5 rounded-2xl tujuane-surface-soft hover:bg-emerald-500/12 text-left transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-800 dark:group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{county.name} County</span>
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                    Explore
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {county.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t tujuane-divider flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>View local posts</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 text-emerald-600 dark:text-emerald-400 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 4. Community Values & Etiquette */}
      <section className="bg-slate-900/88 backdrop-blur-md text-white rounded-3xl p-6 sm:p-10 shadow-lg space-y-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Community Ethos</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Our Commitment to Constructive Dialogue
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            TUJUANE thrives on kindness, mutual support, authentic Kenyan stories, and productive collaboration.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="bg-white/5 rounded-2xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
              01
            </div>
            <h4 className="font-bold text-sm text-white">Heshima & Respect</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Treat every community member with respect and dignity across diverse viewpoints.
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
              02
            </div>
            <h4 className="font-bold text-sm text-white">Civic Solidarity</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Share real tips, helpful advice, local opportunities, and constructive knowledge.
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
              03
            </div>
            <h4 className="font-bold text-sm text-white">Hustle Support</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Encourage local creators, artisans, freelancers, and small neighborhood businesses.
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
              04
            </div>
            <h4 className="font-bold text-sm text-white">Safe & Verified</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Secure authentication via Google ensures genuine interaction and zero spam bots.
            </p>
          </div>
        </div>
      </section>

      {/* 5. FAQs */}
      <section className="tujuane-surface rounded-3xl p-6 sm:p-10 space-y-6 transition-colors">
        <div className="max-w-xl space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Got Questions About TUJUANE?
          </h2>
        </div>

        <div className="divide-y divide-slate-900/5 dark:divide-white/5">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div key={faq.q} className="py-4">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full flex items-center justify-between text-left gap-4 font-bold text-sm text-slate-900 dark:text-white hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-2.5 max-w-2xl">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
