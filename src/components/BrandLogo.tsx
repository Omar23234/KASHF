import React from 'react';

/**
 * Official "من غير كلام" app icon emblem.
 */
export const BrandEmblem: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <img
    src="/app-icon.png"
    alt="من غير كلام"
    className={`object-cover select-none bg-[#F3F0EB] ${className}`}
    draggable={false}
  />
);

/**
 * Wide Hero Calligraphy Wordmark of "من غير كلام" horizontally mirrored,
 * accented with hand-drawn stars and question marks.
 */
export const BrandWordmark: React.FC<{ className?: string }> = ({
  className = 'w-64 sm:w-72 h-auto',
}) => (
  <svg
    viewBox="0 0 420 140"
    fill="none"
    className={className}
    role="img"
    aria-label="من غير كلام"
  >
    {/* Subtle hand-drawn sparkles & question mark accents */}
    <path
      d="M36 40 C37.5 48 40 50.5 48 52 C40 53.5 37.5 56 36 64 C34.5 56 32 53.5 24 52 C32 50.5 34.5 48 36 40 Z"
      fill="#8B5E3C"
      opacity="0.75"
    />
    <path
      d="M384 78 C385.5 85 388 87.5 395 89 C388 90.5 385.5 93 384 100 C382.5 93 380 90.5 373 89 C380 87.5 382.5 85 384 78 Z"
      fill="#8B5E3C"
      opacity="0.7"
    />
    <path
      d="M366 28 C366 19 380 17 382 27 C384 34 373 37 374 44"
      stroke="#8B5E3C"
      strokeWidth="3.8"
      strokeLinecap="round"
    />
    <circle cx="374" cy="53" r="2.6" fill="#8B5E3C" />
    <circle cx="52" cy="106" r="3" fill="#8B5E3C" opacity="0.55" />

    {/* Horizontally mirrored hand-drawn connected Arabic phrase: من غير كلام */}
    <g transform="translate(362 4) scale(-0.96, 0.96)">
      {/* "من غير" (upper-right in natural RTL -> upper-left when mirrored) */}
      <g
        stroke="#231A15"
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M 294 42 C 304 34, 308 48, 297 53 C 288 56, 282 50, 278 43 C 276 61, 267 72, 252 70 C 241 68, 239 58, 243 48" />
        <path d="M 227 38 C 216 32, 206 39, 213 49 C 216 53, 223 55, 226 56 C 214 58, 202 58, 195 57 C 190 57, 187 50, 184 45 C 182 51, 177 57, 169 57 C 164 57, 162 54, 160 50 C 160 63, 152 76, 137 80" />
      </g>
      <g fill="#231A15">
        <circle cx="259" cy="34" r="5" />
        <circle cx="217" cy="21" r="5" />
        <circle cx="190" cy="73" r="4.5" />
        <circle cx="177" cy="73" r="4.5" />
      </g>

      {/* "كلام" (natural RTL on left -> sits harmoniously below-right / adjacent when mirrored) */}
      <g
        stroke="#231A15"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M 122 36 L 94 49 L 112 62 C 115 71, 106 78, 94 78 L 76 78" />
        <path d="M 76 30 L 76 70 C 76 82, 58 84, 48 77 C 41 72, 40 63, 45 55" />
        <path d="M 49 30 L 68 77" />
        <path d="M 26 70 C 28 60, 14 58, 11 66 C 8 73, 18 78, 25 75 C 15 76, 10 81, 10 108" />
      </g>

      {/* Subtle hand-drawn curved underline flourish */}
      <path
        d="M 22 114 C 95 104, 215 104, 294 112"
        stroke="#8B5E3C"
        strokeWidth="4.2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </g>
  </svg>
);
