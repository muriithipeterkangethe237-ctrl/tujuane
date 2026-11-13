import React, { useId } from 'react';

interface KenyanFlagWaveProps {
  className?: string;
  animated?: boolean;
  showSheen?: boolean;
}

/**
 * Crisp, mathematically seamless waving Kenyan flag SVG.
 * Uses official 3:2 flag proportions, black/white/crimson-red/white/Maasai-green bands,
 * crossed white spears, and the central Maasai shield emblem.
 */
export const KenyanFlagWave: React.FC<KenyanFlagWaveProps> = ({
  className = 'w-full h-full',
  animated = true,
  showSheen = true,
}) => {
  const uid = useId().replace(/:/g, '');
  const sheenId = `kenya-sheen-${uid}`;

  // Builds a C1-continuous, period-180 horizontal sine-like wave filled down to y=132
  const buildWaveFill = (y0: number, amplitude = 4.2) => {
    const a2 = amplitude * 2;
    return [
      `M 0 ${y0}`,
      `Q 45 ${y0 - a2} 90 ${y0}`,
      `Q 135 ${y0 + a2} 180 ${y0}`,
      `Q 225 ${y0 - a2} 270 ${y0}`,
      `Q 315 ${y0 + a2} 360 ${y0}`,
      `L 360 134 L 0 134 Z`,
    ].join(' ');
  };

  return (
    <div
      className={`relative overflow-hidden select-none bg-[#0a0b0d] ${className}`}
      aria-hidden="true"
    >
      {/* Seamless 200%-width waving stripes layer */}
      <div
        className={`absolute inset-y-[-10%] left-0 w-[200%] h-[120%] ${
          animated ? 'kenya-wave-scroll' : ''
        }`}
      >
        <svg
          viewBox="0 0 360 120"
          preserveAspectRatio="none"
          className="w-full h-full block"
        >
          {showSheen && (
            <defs>
              <linearGradient id={sheenId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.22" />
                <stop offset="12.5%" stopColor="#ffffff" stopOpacity="0.16" />
                <stop offset="25%" stopColor="#000000" stopOpacity="0.06" />
                <stop offset="37.5%" stopColor="#000000" stopOpacity="0.24" />
                <stop offset="50%" stopColor="#000000" stopOpacity="0.22" />
                <stop offset="62.5%" stopColor="#ffffff" stopOpacity="0.16" />
                <stop offset="75%" stopColor="#000000" stopOpacity="0.06" />
                <stop offset="87.5%" stopColor="#000000" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
              </linearGradient>
            </defs>
          )}

          {/* Top band: Kenyan Black */}
          <rect x="0" y="-12" width="360" height="146" fill="#0b0c0e" />

          {/* Upper fimbriation: White */}
          <path d={buildWaveFill(36, 4.2)} fill="#f8fafc" />

          {/* Center band: Crimson Red */}
          <path d={buildWaveFill(42, 4.2)} fill="#bb0000" />

          {/* Lower fimbriation: White */}
          <path d={buildWaveFill(78, 4.2)} fill="#f8fafc" />

          {/* Bottom band: Maasai Green */}
          <path d={buildWaveFill(84, 4.2)} fill="#006600" />

          {/* Synchronized cloth fold highlights and shadows */}
          {showSheen && <rect x="0" y="-12" width="360" height="146" fill={`url(#${sheenId})`} />}
        </svg>
      </div>

      {/* Centered Crossed Spears & Maasai Shield riding the cloth ripple */}
      <svg
        viewBox="0 0 180 120"
        preserveAspectRatio="xMidYMid meet"
        className={`relative z-10 w-full h-full block ${
          animated ? 'kenya-shield-float' : ''
        }`}
      >
        <g transform="translate(90, 60)">
          {/* Crossed Spears behind shield */}
          <g stroke="#0b0c0e" strokeWidth="0.9" strokeLinejoin="round">
            {/* Left-to-right upward spear */}
            <g transform="rotate(31)">
              <rect x="-1.4" y="-42" width="2.8" height="84" rx="1.2" fill="#f8fafc" />
              <path d="M 0 -51 L 4.3 -38 L 0 -40 L -4.3 -38 Z" fill="#f8fafc" />
            </g>
            {/* Right-to-left upward spear */}
            <g transform="rotate(-31)">
              <rect x="-1.4" y="-42" width="2.8" height="84" rx="1.2" fill="#f8fafc" />
              <path d="M 0 -51 L 4.3 -38 L 0 -40 L -4.3 -38 Z" fill="#f8fafc" />
            </g>
          </g>

          {/* Maasai Shield Silhouette (waist-pinched oval) */}
          <path
            d="M 0 -36 C 9.5 -35 16.5 -24 17.5 -10 C 16.2 -3.5 16.2 3.5 17.5 10 C 16.5 24 9.5 35 0 36 C -9.5 35 -16.5 24 -17.5 10 C -16.2 3.5 -16.2 -3.5 -17.5 -10 C -16.5 -24 -9.5 -35 0 -36 Z"
            fill="#bb0000"
            stroke="#0b0c0e"
            strokeWidth="1.2"
          />

          {/* Left Black Scalloped Flank with white hairline */}
          <path
            d="M -16.2 -10 C -10.5 -7.5 -10.5 7.5 -16.2 10 C -15.5 2 -15.5 -2 -16.2 -10 Z"
            fill="#0b0c0e"
          />
          <path
            d="M -16.2 -10 C -10.2 -7.5 -10.2 7.5 -16.2 10"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M -15.8 -6.5 C -12.6 -4.5 -12.6 4.5 -15.8 6.5"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.15"
            strokeLinecap="round"
          />

          {/* Right Black Scalloped Flank with white hairline */}
          <path
            d="M 16.2 -10 C 10.5 -7.5 10.5 7.5 16.2 10 C 15.5 2 15.5 -2 16.2 -10 Z"
            fill="#0b0c0e"
          />
          <path
            d="M 16.2 -10 C 10.2 -7.5 10.2 7.5 16.2 10"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M 15.8 -6.5 C 12.6 -4.5 12.6 4.5 15.8 6.5"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.15"
            strokeLinecap="round"
          />

          {/* Central black shield waist bands & white spine */}
          <path
            d="M -6.5 -29 C -3 -10 -3 10 -6.5 29"
            fill="none"
            stroke="#0b0c0e"
            strokeWidth="0.9"
            opacity="0.35"
          />
          <path
            d="M 6.5 -29 C 3 -10 3 10 6.5 29"
            fill="none"
            stroke="#0b0c0e"
            strokeWidth="0.9"
            opacity="0.35"
          />

          {/* White central vertical stripe + upper and lower decorative ovals */}
          <line x1="0" y1="-31" x2="0" y2="31" stroke="#f8fafc" strokeWidth="1.4" strokeLinecap="round" />
          <ellipse cx="0" cy="-14.5" rx="2.6" ry="5.5" fill="#f8fafc" />
          <ellipse cx="0" cy="14.5" rx="2.6" ry="5.5" fill="#f8fafc" />
        </g>
      </svg>
    </div>
  );
};

/**
 * Atmospheric full-viewport Kenyan Flag theme backdrop.
 * Renders a smoothly rippling full-bleed Kenyan flag softened with a dark obsidian
 * contrast scrim so every feed card, chat bubble, poll, and modal maintains >=4.5:1 legibility.
 */
export const KenyanFlagBackdrop: React.FC = () => {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#060907]"
      aria-hidden="true"
    >
      {/* Slowly waving atmospheric Kenyan flag canvas */}
      <div className="absolute -inset-6 sm:-inset-10 opacity-55 kenya-backdrop-sway">
        <KenyanFlagWave className="w-full h-full" animated={true} showSheen={true} />
      </div>

      {/* Balanced ambient tricolor glow accents */}
      <div
        className="absolute inset-0 opacity-65"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(187, 0, 0, 0.22) 0%, transparent 50%), radial-gradient(circle at 82% 78%, rgba(0, 102, 0, 0.26) 0%, transparent 54%)',
        }}
      />

      {/* Contrast scrim ensuring crisp WCAG AA legibility across feed, chat, and modals */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(6, 9, 7, 0.62) 0%, rgba(6, 9, 7, 0.44) 48%, rgba(6, 9, 7, 0.68) 100%)',
        }}
      />
    </div>
  );
};
