import React from 'react';

interface AppLogoIconProps {
  className?: string;
  size?: number;
}

/**
 * Rock-solid inline SVG emblem of the Kenyan Maasai Warrior Shield and Community Beacon.
 * Uses clean vectors and pure gradients without GPU-heavy SVG filter effects for 100% stability.
 */
export const AppLogoIcon: React.FC<AppLogoIconProps> = ({ className = 'w-full h-full', size }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      style={{ display: 'block', shapeRendering: 'geometricPrecision' }}
    >
      <defs>
        <radialGradient id="tujuaneBgGlow" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#064e3b" />
          <stop offset="55%" stopColor="#022c22" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>

        <linearGradient id="tujuaneGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>

        <linearGradient id="tujuaneRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>

        <linearGradient id="tujuaneGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="60%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>

        <linearGradient id="tujuaneBlack" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1f2937" />
          <stop offset="100%" stopColor="#030712" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect width="512" height="512" rx="116" fill="url(#tujuaneBgGlow)" />

      {/* Outer Gold Accent Rim */}
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="100"
        fill="none"
        stroke="url(#tujuaneGold)"
        strokeWidth="4"
        strokeOpacity="0.45"
      />

      {/* 47-Counties Interconnection Grid */}
      <g opacity="0.18">
        <circle cx="256" cy="256" r="210" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx="256" cy="256" r="160" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="4 6" />
        <line x1="256" y1="46" x2="256" y2="466" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
        <line x1="46" y1="256" x2="466" y2="256" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.3" />
      </g>

      {/* Crossed Maasai Ceremonial Spears */}
      <g stroke="url(#tujuaneGold)" strokeWidth="7" strokeLinecap="round" opacity="0.95">
        <line x1="100" y1="412" x2="412" y2="100" />
        <path d="M412 100 L426 86 L402 96 Z" fill="url(#tujuaneGold)" />
        <circle cx="100" cy="412" r="8" fill="url(#tujuaneGold)" />

        <line x1="412" y1="412" x2="100" y2="100" />
        <path d="M100 100 L86 86 L96 110 Z" fill="url(#tujuaneGold)" />
        <circle cx="412" cy="412" r="8" fill="url(#tujuaneGold)" />
      </g>

      {/* Shield Silhouette */}
      <g>
        {/* Shield Outer Gold Rim Frame */}
        <path
          d="M256 68 C358 116, 388 200, 388 256 C388 312, 358 396, 256 444 C154 396, 124 312, 124 256 C124 200, 154 116, 256 68 Z"
          fill="url(#tujuaneBlack)"
          stroke="url(#tujuaneGold)"
          strokeWidth="7"
        />

        {/* Left Flank: Kenyan Vibrant Green Wing */}
        <path
          d="M256 74 C200 114, 134 195, 134 256 C134 317, 200 398, 256 438 C210 370, 178 290, 178 256 C178 222, 210 142, 256 74 Z"
          fill="url(#tujuaneGreen)"
        />

        {/* Right Flank: Kenyan Vibrant Green Wing */}
        <path
          d="M256 74 C312 114, 378 195, 378 256 C378 317, 312 398, 256 438 C302 370, 334 290, 334 256 C334 222, 302 142, 256 74 Z"
          fill="url(#tujuaneGreen)"
        />

        {/* Inner Flank: Pure White Piping Borders */}
        <path
          d="M256 74 C218 135, 184 210, 184 256 C184 302, 218 377, 256 438 C232 375, 206 305, 206 256 C206 207, 232 137, 256 74 Z"
          fill="#ffffff"
        />
        <path
          d="M256 74 C294 135, 328 210, 328 256 C328 302, 294 377, 256 438 C280 375, 306 305, 306 256 C306 207, 280 137, 256 74 Z"
          fill="#ffffff"
        />

        {/* Shield Center Column: Rich Kenyan Red */}
        <path
          d="M256 74 C234 137, 212 205, 212 256 C212 307, 234 375, 256 438 C278 375, 300 307, 300 256 C300 205, 278 137, 256 74 Z"
          fill="url(#tujuaneRed)"
        />

        {/* Central Traditional Harambee Chevron (White) */}
        <g fill="#ffffff">
          <polygon points="256,150 276,190 256,182 236,190" />
          <polygon points="256,362 276,322 256,330 236,322" />
        </g>

        {/* Center Pulse: Interconnected Community Hub Beacon */}
        <g>
          <circle cx="256" cy="256" r="42" fill="#030712" stroke="url(#tujuaneGold)" strokeWidth="5" />
          <circle cx="256" cy="234" r="8" fill="url(#tujuaneGold)" />
          <circle cx="238" cy="270" r="7.5" fill="#10b981" />
          <circle cx="274" cy="270" r="7.5" fill="#ef4444" />
          <line x1="256" y1="234" x2="238" y2="270" stroke="url(#tujuaneGold)" strokeWidth="3" />
          <line x1="256" y1="234" x2="274" y2="270" stroke="url(#tujuaneGold)" strokeWidth="3" />
          <line x1="238" y1="270" x2="274" y2="270" stroke="url(#tujuaneGold)" strokeWidth="3" />
          <circle cx="256" cy="256" r="5" fill="#ffffff" />
        </g>
      </g>

      {/* Golden 47-County Unity Star at Top */}
      <g transform="translate(256, 42)">
        <circle cx="0" cy="0" r="14" fill="#022c22" stroke="url(#tujuaneGold)" strokeWidth="2.5" />
        <polygon points="0,-10 3,-3 10,0 3,3 0,10 -3,3 -10,0 -3,-3" fill="url(#tujuaneGold)" />
      </g>
    </svg>
  );
};
