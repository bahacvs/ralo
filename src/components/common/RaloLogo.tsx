import React from 'react';

interface RaloIconProps {
  className?: string;
  size?: number;
  withBackground?: boolean;
  withBorder?: boolean;
}

/**
 * RALO Stylized Padel Ribbon "R" Emblem
 * Accurately vectorized from official brand assets
 */
export const RaloIcon: React.FC<RaloIconProps> = ({
  className = '',
  size = 36,
  withBackground = false,
  withBorder = false
}) => {
  const gradientId = `ralo-gold-grad-${Math.random().toString(36).substr(2, 9)}`;
  const shadowGradId = `ralo-shadow-grad-${Math.random().toString(36).substr(2, 9)}`;

  const content = (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="RALO Padel Logo"
    >
      <defs>
        {/* Main Brand Gold Gradient */}
        <linearGradient id={gradientId} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="70%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Fold Depth Gradient */}
        <linearGradient id={shadowGradId} x1="30%" y1="20%" x2="70%" y2="80%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#B45309" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>

        {/* Soft Drop Shadow for Icon */}
        <filter id="goldGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#F59E0B" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Stylized Padel "R" Geometry */}
      <g filter="url(#goldGlow)">
        {/* Upper Loop of the "R" - sweeping ribbon */}
        <path
          d="M 68 46 
             L 132 46 
             C 152 46 168 62 168 82 
             C 168 102 152 118 132 118 
             L 100 118 
             C 94 118 90 114 90 108 
             C 90 102 94 98 100 98 
             L 130 98 
             C 139 98 146 91 146 82 
             C 146 73 139 66 130 66 
             L 76 66 
             Z"
          fill={`url(#${gradientId})`}
        />

        {/* Center Diagonal Ribbon Fold (Cross-stroke of R) */}
        <path
          d="M 72 64 
             C 76 64 80 66 84 72 
             L 164 164 
             L 126 164 
             L 82 108 
             L 58 144 
             L 34 144 
             L 64 74 
             C 66 68 69 64 72 64 
             Z"
          fill={`url(#${shadowGradId})`}
        />

        {/* Upper Highlight Layer on the Ribbon Fold */}
        <path
          d="M 78 66 
             C 83 66 88 71 92 78 
             L 162 162 
             L 138 162 
             L 94 106 
             C 86 96 82 86 78 76 
             Z"
          fill={`url(#${gradientId})`}
          opacity="0.95"
        />

        {/* Lower Left Leg & Integrated Padel Ball Hole */}
        <path
          d="M 32 144 
             L 68 86 
             L 86 114 
             L 64 144 
             Z"
          fill={`url(#${gradientId})`}
        />

        {/* The Characteristic Ball Ring inside the lower left triangle */}
        <path
          d="M 64 144 
             A 18 18 0 1 1 50 116 
             L 56 125 
             A 10 10 0 1 0 64 136 
             Z"
          fill={`url(#${shadowGradId})`}
        />

        {/* Padel Ball nestled in the "R" */}
        <circle
          cx="68"
          cy="128"
          r="12"
          fill={`url(#${gradientId})`}
        />
        {/* Ball highlight */}
        <circle
          cx="65"
          cy="124"
          r="4"
          fill="#FEF3C7"
          opacity="0.8"
        />
      </g>
    </svg>
  );

  if (withBackground) {
    return (
      <div 
        className={`relative inline-flex items-center justify-center rounded-2xl bg-slate-950 p-1.5 shadow-md ${
          withBorder ? 'border border-amber-500/40 ring-1 ring-amber-500/20 shadow-amber-950/20' : ''
        }`}
        style={{ width: size + 16, height: size + 16 }}
      >
        {content}
      </div>
    );
  }

  return content;
};

interface RaloWordmarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light';
  showSubtitle?: boolean;
  subtitleText?: string;
  subtitleClassName?: string;
}

/**
 * Full RALO Brand Wordmark (Icon + Typography + Slogan)
 */
export const RaloWordmark: React.FC<RaloWordmarkProps> = ({
  className = '',
  size = 'md',
  theme = 'dark',
  showSubtitle = true,
  subtitleText = 'THE SOCIAL NETWORK FOR PADEL',
  subtitleClassName = ''
}) => {
  const isLight = theme === 'light';

  const iconSizes = {
    sm: 26,
    md: 34,
    lg: 44
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const subSizes = {
    sm: 'text-[8px] tracking-[0.2em]',
    md: 'text-[9.5px] tracking-[0.24em]',
    lg: 'text-[11px] tracking-[0.28em]'
  };

  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      {/* Ralo Ribbon "R" Icon in Squircle */}
      <div className="relative shrink-0 flex items-center justify-center">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center shadow-md shadow-amber-950/20">
          <RaloIcon size={iconSizes[size]} />
        </div>
      </div>

      {/* RALO Wordmark and Subtitle */}
      <div className="flex flex-col justify-center select-none">
        <div className="flex items-baseline leading-none">
          <span 
            className={`font-black font-sans tracking-[0.14em] uppercase ${textSizes[size]} ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
            style={{ fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            RALO
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1.5 self-center mb-0.5" />
        </div>

        {showSubtitle && (
          <span 
            className={`font-extrabold uppercase mt-0.5 text-amber-500/90 whitespace-nowrap ${subSizes[size]} ${subtitleClassName}`}
            style={{ letterSpacing: '0.22em' }}
          >
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
};
