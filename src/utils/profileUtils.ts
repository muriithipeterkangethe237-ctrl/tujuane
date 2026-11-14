import { UserProfile } from '../types/chat';
import { getConstituenciesByCounty } from '../data/kenyaCounties';

function makeAvatarSvg(bgTop: string, bgBottom: string, accent: string, ring: string, emblemPath: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgTop}"/>
        <stop offset="100%" stop-color="${bgBottom}"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="32" fill="url(#g)"/>
    <circle cx="64" cy="64" r="50" fill="none" stroke="${ring}" stroke-width="2" stroke-opacity="0.35"/>
    <circle cx="64" cy="48" r="19" fill="${accent}"/>
    <path d="M28 106c4-22 18-32 36-32s32 10 36 32" fill="${accent}" fill-opacity="0.92"/>
    ${emblemPath}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Reliable zero-external-network preset citizen avatars in Kenyan civic palettes
 */
export const PRESET_AVATARS: string[] = [
  makeAvatarSvg(
    '#064e3b',
    '#022c22',
    '#34d399',
    '#a7f3d0',
    '<path d="M64 16l5 8-5 8-5-8z" fill="#fbbf24"/>'
  ),
  makeAvatarSvg(
    '#7f1d1d',
    '#1f2937',
    '#fca5a5',
    '#f87171',
    '<circle cx="64" cy="21" r="4" fill="#10b981"/>'
  ),
  makeAvatarSvg(
    '#0f172a',
    '#065f46',
    '#e2e8f0',
    '#34d399',
    '<rect x="52" y="16" width="24" height="4" rx="2" fill="#dc2626"/><rect x="52" y="21" width="24" height="4" rx="2" fill="#16a34a"/>'
  ),
  makeAvatarSvg(
    '#78350f',
    '#451a03',
    '#fde68a',
    '#fbbf24',
    '<polygon points="64,14 68,23 64,28 60,23" fill="#ffffff" fill-opacity="0.85"/>'
  ),
  makeAvatarSvg(
    '#134e4a',
    '#0f172a',
    '#5eead4',
    '#2dd4bf',
    '<circle cx="64" cy="20" r="4.5" fill="#fbbf24"/>'
  ),
  makeAvatarSvg(
    '#1e293b',
    '#090d16',
    '#cbd5e1',
    '#f59e0b',
    '<path d="M56 20h16l-8 7z" fill="#10b981"/>'
  )
];

const GENERIC_PLACEHOLDER_NAMES = new Set([
  'citizen',
  'citizen member',
  'tujuane member',
  'tujuane community member',
  'kenya community member',
  'member'
]);

export interface ProfileCompletenessReport {
  isComplete: boolean;
  percentage: number;
  missingRequired: { key: 'displayName' | 'county' | 'constituency' | 'bio' | 'occupation'; label: string }[];
  hasPhoto: boolean;
}

/**
 * Evaluates whether a citizen profile satisfies required profile editing standards.
 */
export function getProfileCompleteness(profile: Partial<UserProfile> | null | undefined): ProfileCompletenessReport {
  if (!profile) {
    return {
      isComplete: false,
      percentage: 0,
      missingRequired: [
        { key: 'displayName', label: 'Display Name' },
        { key: 'county', label: 'Home County' },
        { key: 'constituency', label: 'Constituency' },
        { key: 'bio', label: 'About / Bio' },
        { key: 'occupation', label: 'Occupation / Role' }
      ],
      hasPhoto: false
    };
  }

  const missingRequired: ProfileCompletenessReport['missingRequired'] = [];
  const trimmedName = (profile.displayName || '').trim();
  const isValidName = trimmedName.length >= 2 && !GENERIC_PLACEHOLDER_NAMES.has(trimmedName.toLowerCase());
  if (!isValidName) {
    missingRequired.push({ key: 'displayName', label: 'Display Name' });
  }

  const county = (profile.county || '').trim();
  if (!county) {
    missingRequired.push({ key: 'county', label: 'Home County' });
  }

  const countyConstituencies = county ? getConstituenciesByCounty(county) : [];
  const constituency = (profile.constituency || '').trim();
  if (countyConstituencies.length > 0 && !constituency) {
    missingRequired.push({ key: 'constituency', label: 'Constituency' });
  }

  const bio = (profile.bio || '').trim();
  if (bio.length < 10) {
    missingRequired.push({ key: 'bio', label: 'About / Bio (min 10 chars)' });
  }

  const occupation = (profile.occupation || '').trim();
  if (occupation.length < 2) {
    missingRequired.push({ key: 'occupation', label: 'Occupation / Community Role' });
  }

  const hasPhoto = !!(profile.photoURL && profile.photoURL.trim().length > 0);

  const totalChecks = 6; // 5 required + photo
  const completedChecks = (5 - missingRequired.length) + (hasPhoto ? 1 : 0);
  const percentage = Math.round((completedChecks / totalChecks) * 100);

  return {
    isComplete: missingRequired.length === 0,
    percentage,
    missingRequired,
    hasPhoto
  };
}

/**
 * Merges live user directory data onto stale/denormalized author snapshots so profile edits
 * reflect immediately across feeds, comments, chats, and stories.
 */
export function resolveLiveAuthor<
  T extends {
    displayName?: string;
    photoURL?: string;
    county?: string;
    constituency?: string;
  }
>(
  uid: string | undefined,
  fallback: T,
  usersById?: Record<string, UserProfile>
): T & {
  displayName: string;
  photoURL?: string;
  county?: string;
  constituency?: string;
  bio?: string;
  occupation?: string;
  isOnline?: boolean;
  lastSeen?: string;
} {
  const live = uid && usersById ? usersById[uid] : undefined;
  if (!live) {
    return {
      ...fallback,
      displayName: fallback.displayName || 'Citizen Member'
    };
  }
  return {
    ...fallback,
    displayName: live.displayName || fallback.displayName || 'Citizen Member',
    photoURL: live.photoURL !== undefined ? (live.photoURL || undefined) : fallback.photoURL,
    county: live.county || fallback.county,
    constituency: live.constituency || fallback.constituency,
    bio: live.bio,
    occupation: live.occupation,
    isOnline: live.isOnline,
    lastSeen: live.lastSeen
  };
}
