import React from 'react';

interface AppIconProps {
  size?: number;
  className?: string;
  withGlow?: boolean;
}

export const AppIcon: React.FC<AppIconProps> = ({ size = 48, className = '', withGlow = true }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`${withGlow ? 'drop-shadow-lg' : ''} ${className}`}
    >
      <defs>
        <linearGradient id="appIconBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="appIconGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="35%" stopColor="#f59e0b" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="appIconPlate" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="appIconBadge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Squircle Background */}
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="108"
        ry="108"
        fill="url(#appIconBg)"
        stroke="#38bdf8"
        strokeWidth="4"
        strokeOpacity="0.35"
      />

      {/* Inner Ring Accent */}
      <rect
        x="28"
        y="28"
        width="456"
        height="456"
        rx="96"
        ry="96"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeOpacity="0.15"
      />

      {/* Steam Curves */}
      <path
        d="M 210 160 Q 195 130 215 105 Q 230 85 220 65"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="7"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M 256 150 Q 240 120 260 95 Q 275 75 265 55"
        fill="none"
        stroke="#67e8f9"
        strokeWidth="8"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <path
        d="M 302 160 Q 285 130 305 105 Q 320 85 310 65"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="7"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />

      {/* Cloche Handle Knob */}
      <circle cx="256" cy="180" r="22" fill="url(#appIconGold)" />
      <ellipse cx="256" cy="174" rx="14" ry="6" fill="#fef08a" opacity="0.85" />

      {/* Cloche Dome */}
      <path
        d="M 120 310 C 120 210, 180 195, 256 195 C 332 195, 392 210, 392 310 Z"
        fill="url(#appIconGold)"
      />

      {/* Specular Light Reflection on Cloche */}
      <path
        d="M 155 300 C 155 235, 195 210, 245 208 C 220 215, 175 240, 170 300 Z"
        fill="#ffffff"
        opacity="0.35"
      />

      {/* Cloche Lower Lip / Accent Strip */}
      <path
        d="M 108 312 C 108 306, 114 302, 122 302 L 390 302 C 398 302, 404 306, 404 312 L 404 318 C 404 324, 398 328, 390 328 L 122 328 C 114 328, 108 324, 108 318 Z"
        fill="#b45309"
      />
      <path d="M 112 310 L 400 310 L 400 316 L 112 316 Z" fill="#fef08a" opacity="0.6" />

      {/* Platter Plate */}
      <path
        d="M 80 338 C 80 330, 88 326, 98 326 L 414 326 C 424 326, 432 330, 432 338 C 432 358, 396 372, 256 372 C 116 372, 80 358, 80 338 Z"
        fill="url(#appIconPlate)"
      />
      <ellipse cx="256" cy="336" rx="160" ry="8" fill="#cbd5e1" opacity="0.6" />

      {/* Platter Rim Base */}
      <path
        d="M 130 366 C 130 366, 170 388, 256 388 C 342 388, 382 366, 382 366 L 372 380 C 372 380, 332 398, 256 398 C 180 398, 140 380, 140 380 Z"
        fill="#64748b"
      />

      {/* Mobile Lite Lightning Badge */}
      <circle cx="390" cy="390" r="52" fill="#0f172a" stroke="#38bdf8" strokeWidth="4" />
      <circle cx="390" cy="390" r="44" fill="url(#appIconBadge)" />
      {/* Lightning Bolt */}
      <path d="M 394 360 L 374 388 L 388 388 L 382 420 L 408 384 L 394 384 Z" fill="#ffffff" />
    </svg>
  );
};
